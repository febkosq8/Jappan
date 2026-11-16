import type { WebsocketServer, WebsocketSocket } from "../helpers/websocket.js";
import DirectMessageConversationModel from "../models/directMessageConversation.js";
import { getDirectMessageBotUserId, onDirectMessageChanged } from "./directMessages.js";
import { logger } from "./logger.js";

const ROOM_PREFIX = "direct-messages:";
let server: WebsocketServer | undefined;
let stopListening: (() => void) | undefined;

function room(botUserId: string, userId: string): string {
	return `${ROOM_PREFIX}${botUserId}:${userId}`;
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
	stopListening ??= onDirectMessageChanged(({ botUserId, userId }) => {
		const activeServer = server;
		if (!activeServer) return;
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
