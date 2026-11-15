import type { WebsocketServer, WebsocketSocket } from "../helpers/websocket.js";
import { getDirectMessageBotUserId, onDirectMessageChanged } from "./directMessages.js";

const ROOM_PREFIX = "direct-messages:";
let server: WebsocketServer | undefined;
let stopListening: (() => void) | undefined;

function room(): string {
	return `${ROOM_PREFIX}${getDirectMessageBotUserId()}`;
}

export function isDirectMessageSubscriber(socket: WebsocketSocket): boolean {
	return socket.rooms.has(room());
}

export async function subscribeToDirectMessages(socket: WebsocketSocket): Promise<void> {
	await socket.join(room());
}

export async function unsubscribeFromDirectMessages(socket: WebsocketSocket): Promise<void> {
	for (const joinedRoom of socket.rooms) {
		if (joinedRoom.startsWith(ROOM_PREFIX)) await socket.leave(joinedRoom);
	}
}

export function startDirectMessageWebsocket(websocketServer: WebsocketServer): void {
	server = websocketServer;
	stopListening ??= onDirectMessageChanged(({ botUserId, userId }) => {
		const activeServer = server;
		if (!activeServer) return;
		const socketIds = activeServer.sockets.adapter.rooms.get(`${ROOM_PREFIX}${botUserId}`);
		if (!socketIds) return;
		for (const id of socketIds) {
			const socket = activeServer.sockets.sockets.get(id);
			if (!socket) continue;
			if (!socket.data.user.isAdmin) {
				void unsubscribeFromDirectMessages(socket);
				socket.emit("direct-messages:revoked", { status: 403, error: "Bot administrator access required" });
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
