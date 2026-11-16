import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
	acquireWebsocket,
	fetchDirectMessageUnreadCount,
	releaseWebsocket,
	subscribeToDirectMessageInbox,
	WebsocketRequestError,
} from "./websocket";

export type InboxStatus =
	{ status: "connecting" | "error"; unreadCount: null } | { status: "connected"; unreadCount: number };

export default function useDirectMessageInbox(enabled: boolean): InboxStatus {
	const queryClient = useQueryClient();
	const [state, setState] = useState<InboxStatus>({ status: "connecting", unreadCount: null });

	useEffect(() => {
		if (!enabled) return;
		setState({ status: "connecting", unreadCount: null });
		const socket = acquireWebsocket("direct-messages");
		let active = true;
		let subscribed = false;
		let version = 0;
		let subscriptionVersion = 0;
		let retryTimer: number | undefined;
		let refreshTimer: number | undefined;

		const refreshLists = () => {
			void queryClient.invalidateQueries({ queryKey: ["admin", "direct-messages", "conversations"] });
			void queryClient.invalidateQueries({ queryKey: ["admin", "direct-messages", "conversation"] });
		};
		const fail = (error: unknown) => {
			setState({ status: "error", unreadCount: null });
			if (!(error instanceof WebsocketRequestError && (error.status === 401 || error.status === 403))) {
				window.clearTimeout(retryTimer);
				if (socket.connected) retryTimer = window.setTimeout(subscribe, 5000);
			}
		};
		const refreshCount = async (requestVersion: number) => {
			try {
				const unreadCount = await fetchDirectMessageUnreadCount(socket);
				if (active && subscribed && requestVersion === version) {
					window.clearTimeout(retryTimer);
					setState({ status: "connected", unreadCount });
				}
			} catch (error: unknown) {
				if (active && requestVersion === version) fail(error);
			}
		};
		const subscribe = () => {
			if (!active || !socket.connected) return;
			subscribed = false;
			window.clearTimeout(retryTimer);
			const requestVersion = ++version;
			const currentSubscription = ++subscriptionVersion;
			setState({ status: "connecting", unreadCount: null });
			void subscribeToDirectMessageInbox(socket)
				.then((unreadCount) => {
					if (!active || !socket.connected || currentSubscription !== subscriptionVersion) return;
					subscribed = true;
					refreshLists();
					if (requestVersion === version) setState({ status: "connected", unreadCount });
					else void refreshCount(version);
				})
				.catch((error: unknown) => {
					if (active && currentSubscription === subscriptionVersion) fail(error);
				});
		};
		const onChanged = () => {
			const requestVersion = ++version;
			refreshLists();
			window.clearTimeout(refreshTimer);
			if (subscribed) refreshTimer = window.setTimeout(() => void refreshCount(requestVersion), 150);
		};
		const onDisconnect = (reason: string) => {
			subscribed = false;
			version++;
			subscriptionVersion++;
			window.clearTimeout(refreshTimer);
			window.clearTimeout(retryTimer);
			setState({ status: "connecting", unreadCount: null });
			if (reason === "io server disconnect") retryTimer = window.setTimeout(() => socket.connect(), 1000);
		};
		const onConnectError = (error: Error & { data?: { status?: number } }) => {
			subscribed = false;
			version++;
			subscriptionVersion++;
			setState({ status: "error", unreadCount: null });
			window.clearTimeout(retryTimer);
			if (error.data?.status !== 401 && error.data?.status !== 403 && !socket.active) {
				retryTimer = window.setTimeout(() => socket.connect(), 5000);
			}
		};
		const onRevoked = () => {
			subscribed = false;
			version++;
			subscriptionVersion++;
			window.clearTimeout(refreshTimer);
			window.clearTimeout(retryTimer);
			setState({ status: "error", unreadCount: null });
		};
		socket.on("connect", subscribe);
		socket.on("disconnect", onDisconnect);
		socket.on("connect_error", onConnectError);
		socket.on("direct-messages:inbox-changed", onChanged);
		socket.on("direct-messages:inbox-revoked", onRevoked);
		if (socket.connected) subscribe();
		return () => {
			active = false;
			version++;
			subscriptionVersion++;
			window.clearTimeout(refreshTimer);
			window.clearTimeout(retryTimer);
			socket.off("connect", subscribe);
			socket.off("disconnect", onDisconnect);
			socket.off("connect_error", onConnectError);
			socket.off("direct-messages:inbox-changed", onChanged);
			socket.off("direct-messages:inbox-revoked", onRevoked);
			if (socket.connected) socket.emit("direct-messages:inbox-unsubscribe", () => undefined);
			releaseWebsocket("direct-messages");
		};
	}, [enabled, queryClient]);

	return state;
}
