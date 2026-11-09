import { formatGuild } from "../helpers/discord.js";
import type { PlayerQueue } from "../helpers/player.js";
import { getPlayerSessionState, type PlayerSessionState } from "../helpers/playerSessionState.js";
import type { WebsocketResult, WebsocketServer, WebsocketSocket } from "../helpers/websocket.js";
import { logger } from "./logger.js";
import {
	isUserInPlayerVoiceChannel,
	playerGuildMemberRequired,
	resolvePlayerActor,
	toPlayerWebUser,
	type PlayerActor,
	type PlayerWebUser,
} from "./playerAccess.js";

/** Changes within this window are sent as one update, so bursts such as adding a playlist cost one emit. */
const BROADCAST_DELAY_MS = 75;
/** Subscribers get a fresh state this often even when nothing changed, to correct drift and re-check access. */
const STATE_REFRESH_INTERVAL_MS = 30_000;
/** One browser tab needs one session; the cap only stops a client from joining rooms without bound. */
const MAX_SUBSCRIPTIONS_PER_SOCKET = 3;

const ROOM_PREFIX = "player:";

let websocketServer: WebsocketServer | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let refreshing = false;
/** Queues that currently have a room, so a refresh can reach them without searching every Discord guild. */
const subscribedQueues = new Map<string, PlayerQueue>();
const pendingBroadcasts = new Map<string, NodeJS.Timeout>();

function getPlayerRoom(sessionId: string): string {
	return `${ROOM_PREFIX}${sessionId}`;
}

export function isSubscribedToPlayerSession({
	socket,
	sessionId,
}: {
	socket: WebsocketSocket;
	sessionId: string;
}): boolean {
	return socket.rooms.has(getPlayerRoom(sessionId));
}

export function getSocketPlayerUser(socket: WebsocketSocket): PlayerWebUser {
	return toPlayerWebUser({
		session: socket.data.authSession,
		discordAccountId: socket.data.discordAccountId,
	});
}

function getRoomSockets(sessionId: string): WebsocketSocket[] {
	const server = websocketServer;
	const socketIds = server?.sockets.adapter.rooms.get(getPlayerRoom(sessionId));
	if (!server || !socketIds) {
		return [];
	}
	const sockets: WebsocketSocket[] = [];
	for (const socketId of socketIds) {
		const socket = server.sockets.sockets.get(socketId);
		if (socket) {
			sockets.push(socket);
		}
	}
	return sockets;
}

/**
 * The viewer for a broadcast. It uses only cached data so a change never waits on Discord; the checks that
 * must be exact (commands, subscribing, the periodic refresh) go through `resolvePlayerActor` instead.
 */
function getCachedViewer({ queue, user }: { queue: PlayerQueue; user: PlayerWebUser }): PlayerActor {
	return {
		userId: user.discordAccountId,
		username: user.username,
		source: "web",
		isAdmin: user.isAdmin,
		inVoiceChannel: user.isAdmin || isUserInPlayerVoiceChannel(queue, user.discordAccountId),
	};
}

function sendPlayerState({ queue, socket }: { queue: PlayerQueue; socket: WebsocketSocket }): void {
	const viewer = getCachedViewer({ queue, user: getSocketPlayerUser(socket) });
	socket.emit("player:state", getPlayerSessionState(queue, viewer));
}

function broadcastPlayerState(queue: PlayerQueue): void {
	if (queue.deleted) {
		return;
	}
	for (const socket of getRoomSockets(queue.metadata.sessionId)) {
		try {
			sendPlayerState({ queue, socket });
		} catch (error: unknown) {
			logger.error("WEBSOCKET", "Failed to send player state", {
				guild: formatGuild(queue.guild),
				error: error instanceof Error ? error.message : String(error),
			});
		}
	}
}

/** Tells everyone watching this session that it changed. Safe to call from anywhere; does nothing when nobody watches. */
export function notifyPlayerChanged(queue: PlayerQueue): void {
	const { sessionId, healthCheck } = queue.metadata;
	if (healthCheck || !subscribedQueues.has(sessionId) || pendingBroadcasts.has(sessionId)) {
		return;
	}
	const timer = setTimeout(() => {
		pendingBroadcasts.delete(sessionId);
		broadcastPlayerState(queue);
	}, BROADCAST_DELAY_MS);
	pendingBroadcasts.set(sessionId, timer);
}

/** Tells everyone watching that the session is over and empties its room. */
export function endPlayerSession(queue: PlayerQueue): void {
	const { sessionId } = queue.metadata;
	const timer = pendingBroadcasts.get(sessionId);
	if (timer) {
		clearTimeout(timer);
		pendingBroadcasts.delete(sessionId);
	}
	subscribedQueues.delete(sessionId);
	const room = getPlayerRoom(sessionId);
	websocketServer?.to(room).emit("player:ended", { sessionId });
	websocketServer?.in(room).socketsLeave(room);
}

export async function subscribeToPlayerSession({
	socket,
	queue,
}: {
	socket: WebsocketSocket;
	queue: PlayerQueue;
}): Promise<WebsocketResult<{ state: PlayerSessionState }>> {
	const { sessionId } = queue.metadata;
	const room = getPlayerRoom(sessionId);
	const subscriptionCount = [...socket.rooms].filter((joined) => joined.startsWith(ROOM_PREFIX)).length;
	if (!socket.rooms.has(room) && subscriptionCount >= MAX_SUBSCRIPTIONS_PER_SOCKET) {
		return { ok: false, status: 422, error: "Too many player sessions are open on this connection" };
	}
	const result = await resolvePlayerActor({ queue, user: getSocketPlayerUser(socket) });
	if (!result.success) {
		return { ok: false, status: result.status, error: result.error };
	}
	// The session may have ended while the membership was being checked
	if (queue.deleted) {
		return { ok: false, status: 404, error: "Player session not found or has ended" };
	}
	subscribedQueues.set(sessionId, queue);
	await socket.join(room);
	logger.debug("WEBSOCKET", "Subscribed to player session", {
		guild: formatGuild(queue.guild),
		user: result.actor.userId ?? result.actor.username,
	});
	return { ok: true, state: getPlayerSessionState(queue, result.actor) };
}

export async function unsubscribeFromPlayerSession({
	socket,
	sessionId,
}: {
	socket: WebsocketSocket;
	sessionId: string;
}): Promise<void> {
	await socket.leave(getPlayerRoom(sessionId));
}

async function refreshPlayerRoom({ sessionId, queue }: { sessionId: string; queue: PlayerQueue }): Promise<void> {
	if (queue.deleted) {
		endPlayerSession(queue);
		return;
	}
	const sockets = getRoomSockets(sessionId);
	if (sockets.length === 0) {
		subscribedQueues.delete(sessionId);
		return;
	}
	for (const socket of sockets) {
		const result = await resolvePlayerActor({ queue, user: getSocketPlayerUser(socket) });
		if (!result.success && result.status === 403) {
			await unsubscribeFromPlayerSession({ socket, sessionId });
			socket.emit("player:revoked", { sessionId, status: 403, error: playerGuildMemberRequired });
		}
	}
	broadcastPlayerState(queue);
}

async function refreshPlayerRooms(): Promise<void> {
	if (refreshing) {
		return;
	}
	refreshing = true;
	try {
		for (const [sessionId, queue] of [...subscribedQueues]) {
			try {
				await refreshPlayerRoom({ sessionId, queue });
			} catch (error: unknown) {
				logger.warn("WEBSOCKET", "Failed to refresh player room", {
					guild: formatGuild(queue.guild),
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	} finally {
		refreshing = false;
	}
}

export function startPlayerWebsocket(server: WebsocketServer): void {
	websocketServer = server;
	refreshTimer ??= setInterval(() => void refreshPlayerRooms(), STATE_REFRESH_INTERVAL_MS);
	refreshTimer.unref();
}

export function stopPlayerWebsocket(): void {
	if (refreshTimer) {
		clearInterval(refreshTimer);
		refreshTimer = undefined;
	}
	for (const timer of pendingBroadcasts.values()) {
		clearTimeout(timer);
	}
	pendingBroadcasts.clear();
	subscribedQueues.clear();
	websocketServer = undefined;
}
