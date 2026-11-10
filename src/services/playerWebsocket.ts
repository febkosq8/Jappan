import { formatGuild, formatUser } from "../helpers/discord.js";
import { closeDisconnectedQueue, isQueueDisconnected, type PlayerQueue } from "../helpers/player.js";
import { getPlayerSessionState, type PlayerSessionState } from "../helpers/playerSessionState.js";
import type { WebsocketResult, WebsocketServer, WebsocketSocket } from "../helpers/websocket.js";
import { logger } from "./logger.js";
import {
	isUserInPlayerVoiceChannel,
	playerGuildMemberRequired,
	resolvePlayerActor,
	type PlayerActor,
	type PlayerWebUser,
} from "./playerAccess.js";

/** Changes within this window are sent as one update, so bursts such as adding a playlist cost one emit. */
const BROADCAST_DELAY_MS = 75;
/** Subscribers get a fresh state this often even when nothing changed, to correct drift and re-check access. */
const STATE_REFRESH_INTERVAL_MS = 30_000;

const ROOM_PREFIX = "player:";

let websocketServer: WebsocketServer | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let refreshing = false;
/** Queues that currently have a room, so a refresh can reach them without searching every Discord guild. */
const subscribedQueues = new Map<string, PlayerQueue>();
const pendingBroadcasts = new Map<string, NodeJS.Timeout>();
const subscriptionLocks = new Map<string, Promise<void>>();

async function withSubscriptionLock<Value>(key: string, work: () => Promise<Value>): Promise<Value> {
	const previous = subscriptionLocks.get(key);
	let release!: () => void;
	const current = new Promise<void>((resolve) => {
		release = resolve;
	});
	subscriptionLocks.set(key, current);
	if (previous) {
		await previous;
	}
	try {
		return await work();
	} finally {
		release();
		if (subscriptionLocks.get(key) === current) {
			subscriptionLocks.delete(key);
		}
	}
}

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

export function getPlayerSessionViewerCount(sessionId: string): number {
	return getRoomSockets(sessionId).length;
}

/**
 * The viewer for a broadcast. It uses only cached data so a change never waits on Discord; the checks that
 * must be exact (commands, subscribing, the periodic refresh) go through `resolvePlayerActor` instead.
 */
function getCachedViewer({ queue, user }: { queue: PlayerQueue; user: PlayerWebUser }): PlayerActor {
	return {
		id: user.id,
		username: user.username,
		source: "web",
		isAdmin: user.isAdmin,
		inVoiceChannel: user.isAdmin || isUserInPlayerVoiceChannel(queue, user.id),
	};
}

function sendPlayerState({ queue, socket }: { queue: PlayerQueue; socket: WebsocketSocket }): void {
	const viewer = getCachedViewer({ queue, user: socket.data.user });
	socket.emit(
		"player:state",
		getPlayerSessionState({
			queue,
			viewer,
			webPlayerCount: getPlayerSessionViewerCount(queue.metadata.sessionId),
		}),
	);
}

function broadcastPlayerState(queue: PlayerQueue, except?: WebsocketSocket): void {
	if (queue.deleted) {
		return;
	}
	for (const socket of getRoomSockets(queue.metadata.sessionId)) {
		if (socket === except) {
			continue;
		}
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

export function handlePlayerSocketDisconnecting(socket: WebsocketSocket): void {
	const sessionIds = [...socket.rooms]
		.filter((room) => room.startsWith(ROOM_PREFIX))
		.map((room) => room.slice(ROOM_PREFIX.length));
	queueMicrotask(() => {
		for (const sessionId of sessionIds) {
			const queue = subscribedQueues.get(sessionId);
			if (!queue) {
				continue;
			}
			if (getPlayerSessionViewerCount(sessionId) === 0) {
				subscribedQueues.delete(sessionId);
			} else {
				broadcastPlayerState(queue);
			}
		}
	});
}

export async function subscribeToPlayerSession({
	socket,
	queue,
}: {
	socket: WebsocketSocket;
	queue: PlayerQueue;
}): Promise<WebsocketResult<{ state: PlayerSessionState }>> {
	const { sessionId } = queue.metadata;
	return withSubscriptionLock(`${sessionId}:${socket.data.user.id}`, async () => {
		const room = getPlayerRoom(sessionId);
		const result = await resolvePlayerActor({ queue, user: socket.data.user });
		if (!result.success) {
			return { ok: false, status: result.status, error: result.error };
		}
		// The session may have ended while the membership was being checked
		if (queue.deleted) {
			return { ok: false, status: 404, error: "Player session not found or has ended" };
		}
		for (const previousSocket of getRoomSockets(sessionId)) {
			if (previousSocket.id === socket.id || previousSocket.data.user.id !== socket.data.user.id) {
				continue;
			}
			previousSocket.emit("player:replaced", { sessionId });
			await previousSocket.leave(room);
		}
		subscribedQueues.set(sessionId, queue);
		await socket.join(room);
		logger.info("WEBSOCKET", "Client subscribed to player session", {
			socket: socket.id,
			session: sessionId,
			guild: formatGuild(queue.guild),
			user: formatUser(result.actor),
		});
		broadcastPlayerState(queue, socket);
		return {
			ok: true,
			state: getPlayerSessionState({
				queue,
				viewer: result.actor,
				webPlayerCount: getPlayerSessionViewerCount(sessionId),
			}),
		};
	});
}

export async function unsubscribeFromPlayerSession({
	socket,
	sessionId,
}: {
	socket: WebsocketSocket;
	sessionId: string;
}): Promise<void> {
	await socket.leave(getPlayerRoom(sessionId));
	const queue = subscribedQueues.get(sessionId);
	if (!queue) {
		return;
	}
	if (getPlayerSessionViewerCount(sessionId) === 0) {
		subscribedQueues.delete(sessionId);
	} else {
		broadcastPlayerState(queue);
	}
}

async function refreshPlayerRoom({ sessionId, queue }: { sessionId: string; queue: PlayerQueue }): Promise<void> {
	// A missed disconnect event must not leave the session open for ever
	if (!queue.deleted && isQueueDisconnected(queue)) {
		closeDisconnectedQueue(queue);
	}
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
		const result = await resolvePlayerActor({ queue, user: socket.data.user });
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
	subscriptionLocks.clear();
	websocketServer = undefined;
}
