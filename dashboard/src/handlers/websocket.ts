import { io, type Socket } from "socket.io-client";
import {
	apiBaseURL,
	type PurgeMessageJobState,
	type PlayerControlAction,
	type PlayerSession,
	type PlayerSuggestion,
	type AdminDirectMessage,
	type AdminDirectMessagePage,
} from "./APIHandler";

/** Must match `WEBSOCKET_PATH` on the server. */
const WEBSOCKET_PATH = "/api/v1/websocket";
/** Adding a track searches for it first, which can be slow. */
const REQUEST_TIMEOUT_MS = 30_000;

type WebsocketResult<Data extends object = Record<never, never>> =
	({ ok: true } & Data) | { ok: false; status: number; error: string };

type Ack<Data extends object = Record<never, never>> = (result: WebsocketResult<Data>) => void;

export interface DirectMessageBot {
	id: string;
	name: string;
	avatarUrl: string;
}

interface ServerToClientEvents {
	"player:state": (state: PlayerSession) => void;
	"player:ended": (payload: { sessionId: string }) => void;
	"player:revoked": (payload: { sessionId: string; status: number; error: string }) => void;
	"player:replaced": (payload: { sessionId: string }) => void;
	"purge-job:state": (state: PurgeMessageJobState) => void;
	"purge-job:revoked": (payload: { jobId: string; status: number; error: string }) => void;
	"direct-messages:changed": (payload: { userId: string }) => void;
	"direct-messages:revoked": (payload: { userId: string; status: number; error: string }) => void;
}

interface ClientToServerEvents {
	"player:subscribe": (payload: { sessionId: string }, ack: Ack<{ state: PlayerSession }>) => void;
	"player:unsubscribe": (payload: { sessionId: string }, ack: Ack) => void;
	"player:control": (
		payload: { sessionId: string; control: PlayerControlAction },
		ack: Ack<{ notice?: string }>,
	) => void;
	"player:suggestions": (
		payload: { sessionId: string; query: string },
		ack: Ack<{ suggestions: PlayerSuggestion[] }>,
	) => void;
	"purge-job:subscribe": (payload: { jobId: string }, ack: Ack<{ state: PurgeMessageJobState }>) => void;
	"purge-job:unsubscribe": (payload: { jobId: string }, ack: Ack) => void;
	"direct-messages:subscribe": (payload: { userId: string }, ack: Ack<{ bot: DirectMessageBot }>) => void;
	"direct-messages:unsubscribe": (payload: { userId: string }, ack: Ack) => void;
	"direct-messages:history": (
		payload: { userId: string; before?: string },
		ack: Ack<{ page: AdminDirectMessagePage }>,
	) => void;
	"direct-messages:send": (
		payload: { userId: string; content: string },
		ack: Ack<{ message: AdminDirectMessage }>,
	) => void;
}

export type WebsocketClient = Socket<ServerToClientEvents, ClientToServerEvents>;
type WebsocketFeature = "player" | "purge-job" | "direct-messages";

/** A request the server refused, or one that could not be sent. `status` follows the HTTP status codes. */
export class WebsocketRequestError extends Error {
	public readonly status: number;

	public constructor(status: number, message: string) {
		super(message);
		this.name = "WebsocketRequestError";
		this.status = status;
	}
}

let client: WebsocketClient | undefined;
const holders = new Map<WebsocketFeature, number>();

/** One connection is shared by everything on the page; it opens with the first user and closes with the last. */
export function acquireWebsocket(feature: WebsocketFeature): WebsocketClient {
	client ??= io(apiBaseURL, {
		path: WEBSOCKET_PATH,
		// Matches the server, which only accepts WebSocket
		transports: ["websocket"],
		// The session cookie authenticates the handshake
		withCredentials: true,
		autoConnect: false,
		auth: (callback) => callback({ features: [...holders.keys()] }),
	});
	const shouldConnect = holders.size === 0;
	holders.set(feature, (holders.get(feature) ?? 0) + 1);
	if (shouldConnect) {
		client.connect();
	}
	return client;
}

/** The shared connection, or undefined while nothing on the page uses it. */
export function getWebsocket(): WebsocketClient | undefined {
	return holders.size > 0 ? client : undefined;
}

export function releaseWebsocket(feature: WebsocketFeature): void {
	const count = holders.get(feature);
	if (count === undefined) throw new Error(`WebSocket feature ${feature} was not acquired`);
	if (count === 1) holders.delete(feature);
	else holders.set(feature, count - 1);
	if (holders.size === 0) {
		client?.disconnect();
	}
}

/** Sends one event and resolves with its acknowledgement's data, or rejects with a `WebsocketRequestError`. */
async function request<Event extends keyof ClientToServerEvents, Data extends object>({
	socket,
	run,
	unavailableMessage = "Not connected to the player. Reconnecting…",
	timeoutMessage = "The player did not answer in time.",
}: {
	socket: WebsocketClient;
	event: Event;
	run: () => Promise<WebsocketResult<Data>>;
	unavailableMessage?: string;
	timeoutMessage?: string;
}): Promise<Data> {
	if (!socket.connected) {
		throw new WebsocketRequestError(503, unavailableMessage);
	}
	let result: WebsocketResult<Data>;
	try {
		result = await run();
	} catch {
		throw new WebsocketRequestError(504, timeoutMessage);
	}
	if (!result.ok) {
		throw new WebsocketRequestError(result.status, result.error);
	}
	return result;
}

export async function subscribeToPlayer({
	socket,
	sessionId,
}: {
	socket: WebsocketClient;
	sessionId: string;
}): Promise<PlayerSession> {
	const { state } = await request({
		socket,
		event: "player:subscribe",
		run: () => socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("player:subscribe", { sessionId }),
	});
	return state;
}

export async function controlPlayer({
	socket,
	sessionId,
	control,
}: {
	socket: WebsocketClient;
	sessionId: string;
	control: PlayerControlAction;
}): Promise<string | undefined> {
	const { notice } = await request({
		socket,
		event: "player:control",
		run: () => socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("player:control", { sessionId, control }),
	});
	return notice;
}

export async function fetchPlayerSuggestions({
	socket,
	sessionId,
	query,
}: {
	socket: WebsocketClient;
	sessionId: string;
	query: string;
}): Promise<PlayerSuggestion[]> {
	const { suggestions } = await request({
		socket,
		event: "player:suggestions",
		run: () => socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("player:suggestions", { sessionId, query }),
	});
	return suggestions;
}

export async function subscribeToPurgeMessageJob({
	socket,
	jobId,
}: {
	socket: WebsocketClient;
	jobId: string;
}): Promise<PurgeMessageJobState> {
	const { state } = await request({
		socket,
		event: "purge-job:subscribe",
		run: () => socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("purge-job:subscribe", { jobId }),
	});
	return state;
}

const directMessageUnavailable = "Not connected to the conversation. Reconnecting…";

export async function subscribeToDirectMessages(socket: WebsocketClient, userId: string): Promise<DirectMessageBot> {
	const { bot } = await request({
		socket,
		event: "direct-messages:subscribe",
		unavailableMessage: directMessageUnavailable,
		timeoutMessage: "The conversation did not answer in time.",
		run: () => socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("direct-messages:subscribe", { userId }),
	});
	return bot;
}

export async function fetchDirectMessageHistory({
	socket,
	userId,
	before,
}: {
	socket: WebsocketClient;
	userId: string;
	before?: string;
}): Promise<AdminDirectMessagePage> {
	const result = await request({
		socket,
		event: "direct-messages:history",
		unavailableMessage: directMessageUnavailable,
		timeoutMessage: "The conversation did not answer in time.",
		run: () =>
			socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("direct-messages:history", {
				userId,
				...(before ? { before } : {}),
			}),
	});
	return result.page;
}

export async function sendDirectMessage({
	socket,
	userId,
	content,
}: {
	socket: WebsocketClient;
	userId: string;
	content: string;
}): Promise<AdminDirectMessage> {
	const result = await request({
		socket,
		event: "direct-messages:send",
		unavailableMessage: directMessageUnavailable,
		timeoutMessage: "Delivery status is unknown. Check the conversation before retrying.",
		run: () => socket.timeout(REQUEST_TIMEOUT_MS).emitWithAck("direct-messages:send", { userId, content }),
	});
	return result.message;
}
