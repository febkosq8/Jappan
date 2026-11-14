import { formatUser } from "../helpers/discord.js";
import type { WebsocketServer } from "../helpers/websocket.js";
import { registerPurgeMessageJobSocketHandlers } from "./purgeMessageJobWebsocket.js";
import { logger } from "../services/logger.js";
import {
	handlePurgeMessageSocketDisconnecting,
	startPurgeMessageJobWebsocket,
} from "../services/purgeMessageJobWebsocket.js";
import { handlePlayerSocketDisconnecting, startPlayerWebsocket } from "../services/playerWebsocket.js";
import { registerPlayerSocketHandlers } from "./playerWebsocket.js";

/** Wires every websocket feature onto a new connection. Add a feature's `register...SocketHandlers` call here. */
export function registerWebsocketHandlers(server: WebsocketServer): void {
	startPlayerWebsocket(server);
	startPurgeMessageJobWebsocket(server);
	server.on("connection", (socket) => {
		const user = formatUser(socket.data.user);
		logger.info("WEBSOCKET", "Client connected", { socket: socket.id, user });
		registerPlayerSocketHandlers(socket);
		registerPurgeMessageJobSocketHandlers(socket);
		socket.on("disconnecting", () => {
			handlePlayerSocketDisconnecting(socket);
			handlePurgeMessageSocketDisconnecting(socket);
		});
		socket.on("disconnect", (reason) => {
			logger.info("WEBSOCKET", "Client disconnected", { socket: socket.id, user, reason });
		});
	});
}
