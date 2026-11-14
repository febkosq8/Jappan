import { formatUser } from "../helpers/discord.js";
import type { WebsocketResult, WebsocketServer, WebsocketSocket } from "../helpers/websocket.js";
import {
	authorizePurgeMessageJob,
	getPurgeMessageJob,
	onPurgeMessageJobState,
	isPurgeMessageJobTerminal,
	type PurgeMessageJobState,
} from "./purgeMessageJobs.js";
import { logger } from "./logger.js";

const ROOM_PREFIX = "purge-job:";
const ACCESS_REFRESH_INTERVAL_MS = 30_000;

let websocketServer: WebsocketServer | undefined;
let refreshTimer: NodeJS.Timeout | undefined;
let refreshing = false;
let stopListeningForJobState: (() => void) | undefined;
const subscriptions = new Map<string, { socket: WebsocketSocket; jobId: string }>();

function getRoom(jobId: string): string {
	return `${ROOM_PREFIX}${jobId}`;
}

function getSubscriptionKey(socket: WebsocketSocket, jobId: string): string {
	return `${socket.id}:${jobId}`;
}

function publishPurgeMessageJob(state: PurgeMessageJobState): void {
	const room = getRoom(state.jobId);
	websocketServer?.to(room).emit("purge-job:state", state);
	if (!isPurgeMessageJobTerminal(state.status)) return;
	websocketServer?.in(room).socketsLeave(room);
	for (const [key, subscription] of subscriptions) {
		if (subscription.jobId === state.jobId) subscriptions.delete(key);
	}
}

function asFailure(
	result: Exclude<Awaited<ReturnType<typeof authorizePurgeMessageJob>>, { status: "ok" }>,
): Extract<WebsocketResult<{ state: PurgeMessageJobState }>, { ok: false }> {
	switch (result.status) {
		case "not_found":
			return { ok: false, status: 404, error: "Message purge job not found" };
		case "forbidden":
			return { ok: false, status: 403, error: "You cannot view this message purge job" };
		case "unavailable":
			return { ok: false, status: 503, error: "Guild is unavailable" };
	}
}

export async function subscribeToPurgeMessageJob({
	socket,
	jobId,
}: {
	socket: WebsocketSocket;
	jobId: string;
}): Promise<WebsocketResult<{ state: PurgeMessageJobState }>> {
	const access = await authorizePurgeMessageJob({
		jobId,
		discordUserId: socket.data.user.id,
		isBotAdmin: socket.data.user.isAdmin,
	});
	if (access.status !== "ok") return asFailure(access);

	if (!isPurgeMessageJobTerminal(access.job.status)) {
		await socket.join(getRoom(jobId));
	}
	const state = getPurgeMessageJob(jobId);
	if (!state) {
		await socket.leave(getRoom(jobId));
		return { ok: false, status: 404, error: "Message purge job not found" };
	}
	if (!isPurgeMessageJobTerminal(state.status)) {
		subscriptions.set(getSubscriptionKey(socket, jobId), { socket, jobId });
	} else {
		await socket.leave(getRoom(jobId));
	}
	logger.info("WEBSOCKET", "Client subscribed to message purge job", {
		socket: socket.id,
		jobId,
		user: formatUser(socket.data.user),
	});
	return { ok: true, state };
}

export async function unsubscribeFromPurgeMessageJob({
	socket,
	jobId,
}: {
	socket: WebsocketSocket;
	jobId: string;
}): Promise<void> {
	await socket.leave(getRoom(jobId));
	subscriptions.delete(getSubscriptionKey(socket, jobId));
}

export function handlePurgeMessageSocketDisconnecting(socket: WebsocketSocket): void {
	const jobIds = [...socket.rooms]
		.filter((room) => room.startsWith(ROOM_PREFIX))
		.map((room) => room.slice(ROOM_PREFIX.length));
	queueMicrotask(() => {
		for (const jobId of jobIds) subscriptions.delete(getSubscriptionKey(socket, jobId));
	});
}

async function refreshSubscriptions(): Promise<void> {
	if (refreshing) return;
	refreshing = true;
	try {
		for (const [key, subscription] of [...subscriptions]) {
			const { socket, jobId } = subscription;
			if (!socket.connected) {
				subscriptions.delete(key);
				continue;
			}
			try {
				const access = await authorizePurgeMessageJob({
					jobId,
					discordUserId: socket.data.user.id,
					isBotAdmin: socket.data.user.isAdmin,
				});
				if (access.status === "ok") continue;
				await unsubscribeFromPurgeMessageJob({ socket, jobId });
				const failure = asFailure(access);
				if (!failure.ok) {
					socket.emit("purge-job:revoked", { jobId, status: failure.status, error: failure.error });
				}
			} catch (error: unknown) {
				logger.warn("WEBSOCKET", "Failed to refresh message purge job access", {
					jobId,
					user: formatUser(socket.data.user),
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	} finally {
		refreshing = false;
	}
}

export function startPurgeMessageJobWebsocket(server: WebsocketServer): void {
	websocketServer = server;
	stopListeningForJobState ??= onPurgeMessageJobState(publishPurgeMessageJob);
	refreshTimer ??= setInterval(() => void refreshSubscriptions(), ACCESS_REFRESH_INTERVAL_MS);
	refreshTimer.unref();
}

export function stopPurgeMessageJobWebsocket(): void {
	if (refreshTimer) {
		clearInterval(refreshTimer);
		refreshTimer = undefined;
	}
	stopListeningForJobState?.();
	stopListeningForJobState = undefined;
	subscriptions.clear();
	websocketServer = undefined;
}
