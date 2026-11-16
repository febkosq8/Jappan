import { useEffect, useRef, useState } from "react";

import {
	acquireWebsocket,
	releaseWebsocket,
	subscribeToDirectMessages,
	WebsocketRequestError,
	type DirectMessageBot,
} from "./websocket";

type Status = "connecting" | "connected" | "disconnected";
type Callbacks = {
	onSubscribed: () => void;
	onChange: () => Promise<void>;
	onAccessProblem: (status: 401 | 403) => void;
	onUnavailable: () => void;
};

export default function useDirectMessageWebsocket({
	enabled,
	userId,
	...callbacks
}: Callbacks & { enabled: boolean; userId: string }) {
	const [connection, setConnection] = useState<{ userId: string; status: Status; bot: DirectMessageBot | null }>({
		userId: "",
		status: "connecting",
		bot: null,
	});
	const callbacksRef = useRef(callbacks);
	useEffect(() => {
		callbacksRef.current = callbacks;
	});

	useEffect(() => {
		if (!enabled || !userId) return;
		const client = acquireWebsocket("direct-messages");
		let active = true;
		let subscribed = false;
		let retryTimer: number | undefined;
		let refreshTimer: number | undefined;
		let refreshing = false;
		let pending = false;
		let subscriptionVersion = 0;

		const refresh = async () => {
			if (!active || !subscribed || refreshing) return;
			refreshing = true;
			try {
				while (active && subscribed && pending) {
					pending = false;
					await callbacksRef.current.onChange();
				}
			} finally {
				refreshing = false;
			}
		};
		const scheduleRefresh = () => {
			pending = true;
			window.clearTimeout(refreshTimer);
			refreshTimer = window.setTimeout(() => void refresh(), 150);
		};
		const subscribe = () => {
			if (!active) return;
			const version = ++subscriptionVersion;
			subscribed = false;
			setConnection((previous) => ({
				userId,
				status: "connecting",
				bot: previous.userId === userId ? previous.bot : null,
			}));
			subscribeToDirectMessages(client, userId)
				.then((bot) => {
					if (!active || version !== subscriptionVersion || !client.connected) return;
					subscribed = true;
					callbacksRef.current.onSubscribed();
					setConnection({ userId, status: "connected", bot });
				})
				.catch((error: unknown) => {
					if (!active || version !== subscriptionVersion) return;
					setConnection((previous) => ({ ...previous, userId, status: "disconnected" }));
					if (error instanceof WebsocketRequestError && (error.status === 401 || error.status === 403)) {
						callbacksRef.current.onAccessProblem(error.status);
					} else if (error instanceof WebsocketRequestError && error.status === 404) {
						callbacksRef.current.onUnavailable();
					} else if (client.connected) {
						retryTimer = window.setTimeout(subscribe, 5000);
					}
				});
		};
		const onDisconnect = (reason: string) => {
			subscriptionVersion++;
			subscribed = false;
			setConnection((previous) => ({ ...previous, userId, status: "disconnected" }));
			if (reason === "io server disconnect") retryTimer = window.setTimeout(() => client.connect(), 1000);
		};
		const onConnectError = (error: Error & { data?: { status?: number } }) => {
			subscriptionVersion++;
			subscribed = false;
			setConnection((previous) => ({ ...previous, userId, status: "disconnected" }));
			if (error.data?.status === 401 || error.data?.status === 403) {
				callbacksRef.current.onAccessProblem(error.data.status);
			} else if (!client.active) {
				retryTimer = window.setTimeout(() => client.connect(), 5000);
			}
		};
		const onChanged = (payload: { userId: string }) => {
			if (payload.userId === userId) scheduleRefresh();
		};
		const onRevoked = ({ userId: revokedUserId, status: code }: { userId: string; status: number }) => {
			if (revokedUserId !== userId) return;
			subscriptionVersion++;
			subscribed = false;
			setConnection((previous) => ({ ...previous, userId, status: "disconnected" }));
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
			if (client.connected) client.emit("direct-messages:unsubscribe", { userId }, () => undefined);
			releaseWebsocket("direct-messages");
		};
	}, [enabled, userId]);

	return connection.userId === userId
		? { status: connection.status, bot: connection.bot }
		: { status: "connecting" as const, bot: null };
}
