import { WEBSOCKET_ROOM_PREFIX, type WebsocketServer, type WebsocketSocket } from "../helpers/websocket.js";
import DirectMessageConversationModel from "../models/directMessageConversation.js";
import { getDirectMessageBotUserId, notifyAdminsOfDirectMessage, onDirectMessageChanged } from "./directMessages.js";
import { logger } from "./logger.js";

const ROOM_PREFIX = WEBSOCKET_ROOM_PREFIX.directMessages;
const INBOX_ROOM_PREFIX = WEBSOCKET_ROOM_PREFIX.directMessageInbox;
let server: WebsocketServer | undefined;
let stopListening: (() => void) | undefined;

function room(botUserId: string, userId: string): string {
	return `${ROOM_PREFIX}${botUserId}:${userId}`;
}

function inboxRoom(botUserId: string): string {
	return `${INBOX_ROOM_PREFIX}${botUserId}`;
}

export async function subscribeToDirectMessageInbox(socket: WebsocketSocket): Promise<boolean> {
	const botUserId = getDirectMessageBotUserId();
	if (!socket.connected || !socket.data.user.isAdmin) return false;
	await socket.join(inboxRoom(botUserId));
	return socket.connected && socket.data.user.isAdmin;
}

export async function unsubscribeFromDirectMessageInbox(socket: WebsocketSocket): Promise<void> {
	for (const joinedRoom of socket.rooms) {
		if (joinedRoom.startsWith(INBOX_ROOM_PREFIX)) await socket.leave(joinedRoom);
	}
}

export function isDirectMessageInboxSubscriber(socket: WebsocketSocket): boolean {
	return socket.rooms.has(inboxRoom(getDirectMessageBotUserId()));
}

export function isDirectMessageSubscriber({ socket, userId }: { socket: WebsocketSocket; userId: string }): boolean {
	return socket.rooms.has(room(getDirectMessageBotUserId(), userId));
}

export async function subscribeToDirectMessages({
	socket,
	userId,
}: {
	socket: WebsocketSocket;
	userId: string;
}): Promise<boolean> {
	const botUserId = getDirectMessageBotUserId();
	const conversation = await DirectMessageConversationModel.exists({ botUserId, userId });
	if (!conversation || !socket.connected || !socket.data.user.isAdmin) return false;
	await socket.join(room(botUserId, userId));
	return true;
}

export async function unsubscribeFromDirectMessages({
	socket,
	userId,
}: {
	socket: WebsocketSocket;
	userId: string;
}): Promise<void> {
	for (const joinedRoom of socket.rooms) {
		if (joinedRoom.startsWith(ROOM_PREFIX) && joinedRoom.endsWith(`:${userId}`)) await socket.leave(joinedRoom);
	}
}

export function startDirectMessageWebsocket(websocketServer: WebsocketServer): void {
	server = websocketServer;
	stopListening ??= onDirectMessageChanged((change) => {
		const { botUserId, userId, kind } = change;
		const activeServer = server;
		if (!activeServer) return;
		const inboxSocketIds = activeServer.sockets.adapter.rooms.get(inboxRoom(botUserId));
		if (kind === "received") {
			const pageOpen = inboxSocketIds
				? [...inboxSocketIds].some((id) => {
						const socket = activeServer.sockets.sockets.get(id);
						return socket?.connected && socket.data.user.isAdmin;
					})
				: false;
			if (!pageOpen) {
				void notifyAdminsOfDirectMessage(change.sender).catch((error: unknown) => {
					logger.error("DISCORD", "Failed to notify admins of direct message", { userId, error });
				});
			}
		}
		if (inboxSocketIds) {
			for (const id of inboxSocketIds) {
				const socket = activeServer.sockets.sockets.get(id);
				if (!socket) continue;
				if (!socket.data.user.isAdmin) {
					void unsubscribeFromDirectMessageInbox(socket).catch((error: unknown) => {
						logger.error("WEBSOCKET", "Failed to remove direct message inbox subscription", { error });
					});
					socket.emit("direct-messages:inbox-revoked", {
						status: 403,
						error: "Bot administrator access required",
					});
					continue;
				}
				socket.emit("direct-messages:inbox-changed", { userId });
			}
		}
		if (kind !== "message" && kind !== "received") return;
		const socketIds = activeServer.sockets.adapter.rooms.get(room(botUserId, userId));
		if (!socketIds) return;
		for (const id of socketIds) {
			const socket = activeServer.sockets.sockets.get(id);
			if (!socket) continue;
			if (!socket.data.user.isAdmin) {
				void unsubscribeFromDirectMessages({ socket, userId }).catch((error: unknown) => {
					logger.error("WEBSOCKET", "Failed to remove direct message subscription", { userId, error });
				});
				socket.emit("direct-messages:revoked", {
					userId,
					status: 403,
					error: "Bot administrator access required",
				});
				continue;
			}
			socket.emit("direct-messages:changed", { userId });
		}
	});
}

export function stopDirectMessageWebsocket(): void {
	stopListening?.();
	stopListening = undefined;
	server = undefined;
}
