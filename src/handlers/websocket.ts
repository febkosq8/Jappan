import { formatUser } from "../helpers/discord.js";
import { WEBSOCKET_ROOM_PREFIX, type WebsocketServer } from "../helpers/websocket.js";
import { registerPurgeMessageJobSocketHandlers } from "./purgeMessageJobWebsocket.js";
import { logger } from "../services/logger.js";
import {
	handlePurgeMessageSocketDisconnecting,
	startPurgeMessageJobWebsocket,
} from "../services/purgeMessageJobWebsocket.js";
import { handlePlayerSocketDisconnecting, startPlayerWebsocket } from "../services/playerWebsocket.js";
import { registerPlayerSocketHandlers } from "./playerWebsocket.js";
import { registerDirectMessageSocketHandlers } from "./directMessageWebsocket.js";
import { startDirectMessageWebsocket } from "../services/directMessageWebsocket.js";

const featureRoomPrefixes = [
	[WEBSOCKET_ROOM_PREFIX.player, "player"],
	[WEBSOCKET_ROOM_PREFIX.purgeJob, "purge-job"],
	[WEBSOCKET_ROOM_PREFIX.directMessages, "direct-messages"],
	[WEBSOCKET_ROOM_PREFIX.directMessageInbox, "direct-messages"],
] as const;

/** Wires every websocket feature onto a new connection. Add a feature's `register...SocketHandlers` call here. */
export function registerWebsocketHandlers(server: WebsocketServer): void {
	startPlayerWebsocket(server);
	startPurgeMessageJobWebsocket(server);
	startDirectMessageWebsocket(server);
	const logRoomChange = (room: string, socketId: string, action: "joined" | "left") => {
		const feature = featureRoomPrefixes.find(([prefix]) => room.startsWith(prefix))?.[1];
		if (!feature) return;
		const socket = server.sockets.sockets.get(socketId);
		logger.info("WEBSOCKET", `Client ${action} feature room`, {
			feature,
			room,
			socket: socketId,
			...(socket && { user: formatUser(socket.data.user) }),
		});
	};
	server.sockets.adapter.on("join-room", (room, socketId) => logRoomChange(room, socketId, "joined"));
	server.sockets.adapter.on("leave-room", (room, socketId) => logRoomChange(room, socketId, "left"));
	server.on("connection", (socket) => {
		const user = formatUser(socket.data.user);
		logger.info("WEBSOCKET", "Client connected", { socket: socket.id, user });
		registerPlayerSocketHandlers(socket);
		registerPurgeMessageJobSocketHandlers(socket);
		registerDirectMessageSocketHandlers(socket);
		socket.on("disconnecting", () => {
			handlePlayerSocketDisconnecting(socket);
			handlePurgeMessageSocketDisconnecting(socket);
		});
		socket.on("disconnect", (reason) => {
			logger.info("WEBSOCKET", "Client disconnected", {
				socket: socket.id,
				user,
				reason,
			});
		});
	});
}
