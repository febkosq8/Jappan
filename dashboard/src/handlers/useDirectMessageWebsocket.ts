import { useEffect, useRef, useState } from "react";

import { acquireWebsocket, releaseWebsocket, subscribeToDirectMessages, WebsocketRequestError } from "./websocket";

type Status = "connecting" | "connected" | "disconnected";
type Callbacks = {
	onChange: (userId?: string) => Promise<void>;
	onAccessProblem: (status: 401 | 403) => void;
};

export default function useDirectMessageWebsocket({ enabled, ...callbacks }: Callbacks & { enabled: boolean }) {
	const [status, setStatus] = useState<Status>("connecting");
	const callbacksRef = useRef(callbacks);
	useEffect(() => {
		callbacksRef.current = callbacks;
	});

	useEffect(() => {
		if (!enabled) return;
		const client = acquireWebsocket();
		let active = true;
		let subscribed = false;
		let retryTimer: number | undefined;
		let refreshTimer: number | undefined;
		let refreshing = false;
		let pending = false;
		const changedUsers = new Set<string>();

		const refresh = async () => {
			if (!active || !subscribed || refreshing) return;
			refreshing = true;
			try {
				while (active && subscribed && pending) {
					pending = false;
					const users = [...changedUsers];
					changedUsers.clear();
					if (users.length === 0) await callbacksRef.current.onChange();
					else for (const userId of users) await callbacksRef.current.onChange(userId);
				}
			} finally {
				refreshing = false;
			}
		};
		const scheduleRefresh = (userId?: string) => {
			pending = true;
			if (userId) changedUsers.add(userId);
			window.clearTimeout(refreshTimer);
			refreshTimer = window.setTimeout(() => void refresh(), 150);
		};
		const subscribe = () => {
			if (!active) return;
			subscribed = false;
			setStatus("connecting");
			subscribeToDirectMessages(client)
				.then(() => {
					if (!active) return;
					subscribed = true;
					setStatus("connected");
					scheduleRefresh();
				})
				.catch((error: unknown) => {
					if (!active) return;
					setStatus("disconnected");
					if (error instanceof WebsocketRequestError && (error.status === 401 || error.status === 403)) {
						callbacksRef.current.onAccessProblem(error.status);
					} else if (client.connected) {
						retryTimer = window.setTimeout(subscribe, 5000);
					}
				});
		};
		const onDisconnect = (reason: string) => {
			subscribed = false;
			setStatus("disconnected");
			if (reason === "io server disconnect") retryTimer = window.setTimeout(() => client.connect(), 1000);
		};
		const onConnectError = (error: Error & { data?: { status?: number } }) => {
			subscribed = false;
			setStatus("disconnected");
			if (error.data?.status === 401 || error.data?.status === 403) {
				callbacksRef.current.onAccessProblem(error.data.status);
			} else if (!client.active) {
				retryTimer = window.setTimeout(() => client.connect(), 5000);
			}
		};
		const onChanged = ({ userId }: { userId: string }) => scheduleRefresh(userId);
		const onRevoked = ({ status: code }: { status: number }) => {
			subscribed = false;
			setStatus("disconnected");
			if (code === 401 || code === 403) callbacksRef.current.onAccessProblem(code);
		};
		client.on("connect", subscribe);
		client.on("disconnect", onDisconnect);
		client.on("connect_error", onConnectError);
		client.on("direct-messages:changed", onChanged);
		client.on("direct-messages:revoked", onRevoked);
		if (client.connected) subscribe();
		return () => {
			active = false;
			window.clearTimeout(retryTimer);
			window.clearTimeout(refreshTimer);
			client.off("connect", subscribe);
			client.off("disconnect", onDisconnect);
			client.off("connect_error", onConnectError);
			client.off("direct-messages:changed", onChanged);
			client.off("direct-messages:revoked", onRevoked);
			if (client.connected && subscribed) client.emit("direct-messages:unsubscribe", {}, () => undefined);
			releaseWebsocket();
		};
	}, [enabled]);

	return status;
}
