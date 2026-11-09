import { useCallback, useEffect, useRef, useState } from "react";
import type { PlayerControlAction, PlayerSession, PlayerSuggestion } from "./APIHandler";
import {
	acquireWebsocket,
	controlPlayer,
	fetchPlayerSuggestions,
	getWebsocket,
	releaseWebsocket,
	subscribeToPlayer,
	WebsocketRequestError,
} from "./websocket";

/** How long to wait before trying again after the server refused a connection for a temporary reason. */
const RETRY_DELAY_MS = 5000;
/**
 * The server ends a connection on purpose when its session ended. After a sign-in elsewhere in the same
 * browser, the new session cookie may still be on its way, so reconnecting at once would fail.
 */
const SERVER_DISCONNECT_RECONNECT_DELAY_MS = 1000;

export type PlayerWebsocketStatus = "connecting" | "connected" | "disconnected";

interface PlayerWebsocketCallbacks {
	/** A new state arrived, on subscribing and after every change. */
	onState: (state: PlayerSession) => void;
	/** The session no longer exists. */
	onEnded: () => void;
	/** The server refused or dropped the connection for a reason the HTTP endpoint can explain better. */
	onAccessProblem: () => void;
}

/**
 * Keeps one player session subscribed over the shared WebSocket. The HTTP endpoint loads the session first;
 * this pushes every later change and carries the controls. `status` is `connected` only once subscribed.
 */
export default function usePlayerWebsocket({
	sessionId,
	enabled,
	...callbacks
}: PlayerWebsocketCallbacks & { sessionId: string; enabled: boolean }) {
	const [status, setStatus] = useState<PlayerWebsocketStatus>("connecting");
	const callbacksRef = useRef<PlayerWebsocketCallbacks>(callbacks);
	useEffect(() => {
		callbacksRef.current = callbacks;
	});

	useEffect(() => {
		if (!enabled || sessionId === "") {
			return;
		}
		const client = acquireWebsocket();
		let retryTimer: number | undefined;
		let active = true;
		setStatus("connecting");

		const subscribe = () => {
			subscribeToPlayer({ socket: client, sessionId })
				.then((state) => {
					if (active) {
						setStatus("connected");
						callbacksRef.current.onState(state);
					}
				})
				.catch((error: unknown) => {
					if (!active) {
						return;
					}
					setStatus("disconnected");
					// 403 and 404 are explained by the HTTP endpoint, which the page then shows
					if (error instanceof WebsocketRequestError && [401, 403, 404].includes(error.status)) {
						callbacksRef.current.onAccessProblem();
					}
				});
		};
		const handleDisconnect = (reason: string) => {
			setStatus("disconnected");
			// The server ends a connection on purpose (for example when the session expired); reconnecting
			// either works or fails the handshake, which then reports why
			if (reason === "io server disconnect") {
				retryTimer = window.setTimeout(() => client.connect(), SERVER_DISCONNECT_RECONNECT_DELAY_MS);
			}
		};
		const handleConnectError = (error: Error & { data?: { status?: number } }) => {
			setStatus("disconnected");
			const refusal = error.data?.status;
			if (refusal === 401 || refusal === 403) {
				callbacksRef.current.onAccessProblem();
				return;
			}
			// A refusal from the server's middleware is not retried by the client itself
			if (!client.active) {
				retryTimer = window.setTimeout(() => client.connect(), RETRY_DELAY_MS);
			}
		};
		const handleState = (state: PlayerSession) => {
			if (state.sessionId === sessionId) {
				callbacksRef.current.onState(state);
			}
		};
		const handleEnded = (payload: { sessionId: string }) => {
			if (payload.sessionId === sessionId) {
				callbacksRef.current.onEnded();
			}
		};
		const handleRevoked = (payload: { sessionId: string }) => {
			if (payload.sessionId === sessionId) {
				setStatus("disconnected");
				callbacksRef.current.onAccessProblem();
			}
		};

		client.on("connect", subscribe);
		client.on("disconnect", handleDisconnect);
		client.on("connect_error", handleConnectError);
		client.on("player:state", handleState);
		client.on("player:ended", handleEnded);
		client.on("player:revoked", handleRevoked);
		if (client.connected) {
			subscribe();
		}

		return () => {
			active = false;
			window.clearTimeout(retryTimer);
			client.off("connect", subscribe);
			client.off("disconnect", handleDisconnect);
			client.off("connect_error", handleConnectError);
			client.off("player:state", handleState);
			client.off("player:ended", handleEnded);
			client.off("player:revoked", handleRevoked);
			if (client.connected) {
				client.emit("player:unsubscribe", { sessionId }, () => undefined);
			}
			releaseWebsocket();
		};
	}, [sessionId, enabled]);

	const control = useCallback(
		async (action: PlayerControlAction): Promise<string | undefined> => {
			const socket = getWebsocket();
			if (!socket) {
				throw new WebsocketRequestError(503, "Not connected to the player. Reconnecting…");
			}
			return controlPlayer({ socket, sessionId, control: action });
		},
		[sessionId],
	);

	const suggestions = useCallback(
		async (query: string): Promise<PlayerSuggestion[]> => {
			const socket = getWebsocket();
			if (!socket) {
				throw new WebsocketRequestError(503, "Not connected to the player. Reconnecting…");
			}
			return fetchPlayerSuggestions({ socket, sessionId, query });
		},
		[sessionId],
	);

	return { status, control, suggestions };
}
