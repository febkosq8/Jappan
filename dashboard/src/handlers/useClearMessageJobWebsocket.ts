import { useEffect, useRef, useState } from "react";

import type { ClearMessageJobState } from "./APIHandler";
import {
	acquireWebsocket,
	getWebsocket,
	releaseWebsocket,
	subscribeToClearMessageJob,
	WebsocketRequestError,
} from "./websocket";

const RETRY_DELAY_MS = 5000;
const SERVER_DISCONNECT_RECONNECT_DELAY_MS = 1000;

export type ClearMessageJobWebsocketStatus = "connecting" | "connected" | "disconnected";

interface ClearMessageJobWebsocketCallbacks {
	onState: (state: ClearMessageJobState) => void;
	onAccessProblem: () => void;
}

export default function useClearMessageJobWebsocket({
	jobId,
	enabled,
	...callbacks
}: ClearMessageJobWebsocketCallbacks & { jobId: string; enabled: boolean }) {
	const [status, setStatus] = useState<ClearMessageJobWebsocketStatus>("connecting");
	const callbacksRef = useRef<ClearMessageJobWebsocketCallbacks>(callbacks);
	useEffect(() => {
		callbacksRef.current = callbacks;
	});

	useEffect(() => {
		if (!enabled || jobId === "") return;
		const client = acquireWebsocket();
		let retryTimer: number | undefined;
		let active = true;
		setStatus("connecting");

		const subscribe = () => {
			if (!active) return;
			subscribeToClearMessageJob({ socket: client, jobId })
				.then((state) => {
					if (active) {
						setStatus("connected");
						callbacksRef.current.onState(state);
					}
				})
				.catch((error: unknown) => {
					if (!active) return;
					setStatus("disconnected");
					if (error instanceof WebsocketRequestError && [401, 403, 404].includes(error.status)) {
						callbacksRef.current.onAccessProblem();
					}
				});
		};
		const handleDisconnect = (reason: string) => {
			setStatus("disconnected");
			if (reason === "io server disconnect") {
				retryTimer = window.setTimeout(() => client.connect(), SERVER_DISCONNECT_RECONNECT_DELAY_MS);
			}
		};
		const handleConnectError = (error: Error & { data?: { status?: number } }) => {
			setStatus("disconnected");
			if (error.data?.status === 401 || error.data?.status === 403) {
				callbacksRef.current.onAccessProblem();
				return;
			}
			if (!client.active) retryTimer = window.setTimeout(() => client.connect(), RETRY_DELAY_MS);
		};
		const handleState = (state: ClearMessageJobState) => {
			if (state.jobId === jobId) callbacksRef.current.onState(state);
		};
		const handleRevoked = (payload: { jobId: string }) => {
			if (payload.jobId === jobId) {
				setStatus("disconnected");
				callbacksRef.current.onAccessProblem();
			}
		};

		client.on("connect", subscribe);
		client.on("disconnect", handleDisconnect);
		client.on("connect_error", handleConnectError);
		client.on("clear-job:state", handleState);
		client.on("clear-job:revoked", handleRevoked);
		if (client.connected) subscribe();

		return () => {
			active = false;
			window.clearTimeout(retryTimer);
			client.off("connect", subscribe);
			client.off("disconnect", handleDisconnect);
			client.off("connect_error", handleConnectError);
			client.off("clear-job:state", handleState);
			client.off("clear-job:revoked", handleRevoked);
			if (client.connected) {
				getWebsocket()?.emit("clear-job:unsubscribe", { jobId }, () => undefined);
			}
			releaseWebsocket();
		};
	}, [jobId, enabled]);

	return { status };
}
