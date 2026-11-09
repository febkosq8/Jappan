import type { Server, Socket } from "socket.io";
import type { AuthSession } from "../services/auth.js";
import type { PlayerSessionState } from "./playerSessionState.js";

/** Path the Socket.IO server is mounted on, under the same API prefix as the HTTP routes. */
export const WEBSOCKET_PATH = "/api/v1/websocket";

/** Events one connection may send per window; a slow typist or a button-masher stays well under it. */
const RATE_LIMIT_MAX_EVENTS = 40;
const RATE_LIMIT_WINDOW_MS = 10_000;

/** What every acknowledgement carries: either the requested data or the HTTP-style status of the refusal. */
export type WebsocketResult<Data extends object = Record<never, never>> =
	({ readonly ok: true } & Data) | { readonly ok: false; readonly status: number; readonly error: string };

export type WebsocketAck<Data extends object = Record<never, never>> = (result: WebsocketResult<Data>) => void;

export interface PlayerSuggestionPayload {
	readonly kind: "track" | "playlist" | "savedPlaylist";
	readonly title: string;
	readonly value: string;
}

/**
 * Events the browser sends. Payloads are `unknown` because they are untrusted and validated with zod on arrival.
 * Event names are prefixed by feature (`player:`) so more features can share the one connection.
 */
export interface ClientToServerEvents {
	"player:subscribe": (payload: unknown, ack?: WebsocketAck<{ state: PlayerSessionState }>) => void;
	"player:unsubscribe": (payload: unknown, ack?: WebsocketAck) => void;
	"player:control": (payload: unknown, ack?: WebsocketAck<{ readonly notice?: string }>) => void;
	"player:suggestions": (
		payload: unknown,
		ack?: WebsocketAck<{ suggestions: readonly PlayerSuggestionPayload[] }>,
	) => void;
}

export interface ServerToClientEvents {
	/** The latest state of a subscribed player session, from the receiving user's point of view. */
	"player:state": (state: PlayerSessionState) => void;
	/** The session no longer exists. */
	"player:ended": (payload: { readonly sessionId: string }) => void;
	/** The user can no longer view the session (for example they left its server). */
	"player:revoked": (payload: {
		readonly sessionId: string;
		readonly status: number;
		readonly error: string;
	}) => void;
}

export interface WebsocketSocketData {
	authSession: AuthSession;
	/** Discord account linked to the signed-in user, if any. */
	discordAccountId: string | null;
	/** Start of the current rate-limit window, in epoch milliseconds. */
	rateWindowStartMs: number;
	/** Events received in the current rate-limit window. */
	rateWindowCount: number;
}

export type WebsocketServer = Server<
	ClientToServerEvents,
	ServerToClientEvents,
	Record<never, never>,
	WebsocketSocketData
>;
export type WebsocketSocket = Socket<
	ClientToServerEvents,
	ServerToClientEvents,
	Record<never, never>,
	WebsocketSocketData
>;

/** Counts one incoming event against the socket's window and returns true when it is over the limit. */
export function consumeSocketRateLimit(socket: WebsocketSocket): boolean {
	const now = Date.now();
	if (now - socket.data.rateWindowStartMs >= RATE_LIMIT_WINDOW_MS) {
		socket.data.rateWindowStartMs = now;
		socket.data.rateWindowCount = 0;
	}
	socket.data.rateWindowCount += 1;
	return socket.data.rateWindowCount > RATE_LIMIT_MAX_EVENTS;
}
