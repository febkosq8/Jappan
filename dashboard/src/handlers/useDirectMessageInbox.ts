import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import {
	acquireWebsocket,
	fetchDirectMessageUnreadCount,
	releaseWebsocket,
	subscribeToDirectMessageInbox,
	WebsocketRequestError,
} from "./websocket";

export type InboxStatus =
	| { status: "connecting"; unreadCount: null }
	| { status: "error"; unreadCount: null; error: unknown }
	| { status: "connected"; unreadCount: number };
export type InboxConnection = InboxStatus & { retry: () => void };

export default function useDirectMessageInbox(enabled: boolean): InboxConnection {
	const queryClient = useQueryClient();
	const [state, setState] = useState<InboxStatus>({ status: "connecting", unreadCount: null });
	const [attempt, setAttempt] = useState(0);
	const retry = useCallback(() => setAttempt((previous) => previous + 1), []);

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

		const refreshLists = async () => {
			const lists = { queryKey: ["admin", "direct-messages", "conversations"] };
			const selected = { queryKey: ["admin", "direct-messages", "conversation"] };
			await Promise.all([queryClient.cancelQueries(lists), queryClient.cancelQueries(selected)]);
			if (!active) return;
			await Promise.all([queryClient.invalidateQueries(lists), queryClient.invalidateQueries(selected)]);
		};
		const fail = (error: unknown) => {
			setState({ status: "error", unreadCount: null, error });
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
				.then(async (unreadCount) => {
					if (!active || !socket.connected || currentSubscription !== subscriptionVersion) return;
					subscribed = true;
					window.clearTimeout(refreshTimer);
					await refreshLists();
					if (!active || !socket.connected || currentSubscription !== subscriptionVersion) return;
					if (requestVersion === version) setState({ status: "connected", unreadCount });
					else void refreshCount(version);
				})
				.catch((error: unknown) => {
					if (active && currentSubscription === subscriptionVersion) fail(error);
				});
		};
		const onChanged = () => {
			const requestVersion = ++version;
			window.clearTimeout(refreshTimer);
			refreshTimer = window.setTimeout(() => {
				void refreshLists();
				if (subscribed) void refreshCount(requestVersion);
			}, 150);
		};
		const onDisconnect = (reason: string) => {
			subscribed = false;
			version++;
			subscriptionVersion++;
			window.clearTimeout(refreshTimer);
			window.clearTimeout(retryTimer);
			void queryClient.cancelQueries({ queryKey: ["admin", "direct-messages", "conversations"] });
			void queryClient.cancelQueries({ queryKey: ["admin", "direct-messages", "conversation"] });
			setState({ status: "connecting", unreadCount: null });
			if (reason === "io server disconnect") retryTimer = window.setTimeout(() => socket.connect(), 1000);
		};
		const onConnectError = (error: Error & { data?: { status?: number } }) => {
			subscribed = false;
			version++;
			subscriptionVersion++;
			setState({
				status: "error",
				unreadCount: null,
				error: new WebsocketRequestError(error.data?.status ?? 503, error.message),
			});
			window.clearTimeout(retryTimer);
			if (error.data?.status !== 401 && error.data?.status !== 403 && !socket.active) {
				retryTimer = window.setTimeout(() => socket.connect(), 5000);
			}
		};
		const onRevoked = ({ status, error }: { status: number; error: string }) => {
			subscribed = false;
			version++;
			subscriptionVersion++;
			window.clearTimeout(refreshTimer);
			window.clearTimeout(retryTimer);
			void queryClient.cancelQueries({ queryKey: ["admin", "direct-messages", "conversations"] });
			void queryClient.cancelQueries({ queryKey: ["admin", "direct-messages", "conversation"] });
			setState({ status: "error", unreadCount: null, error: new WebsocketRequestError(status, error) });
		};
		socket.on("connect", subscribe);
		socket.on("disconnect", onDisconnect);
		socket.on("connect_error", onConnectError);
		socket.on("direct-messages:inbox-changed", onChanged);
		socket.on("direct-messages:inbox-revoked", onRevoked);
		if (socket.connected) subscribe();
		else if (!socket.active) socket.connect();
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
	}, [attempt, enabled, queryClient]);

	return { ...state, retry };
}
