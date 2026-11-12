import { formatUser } from "../helpers/discord.js";
import type { WebsocketServer } from "../helpers/websocket.js";
import { registerClearMessageJobSocketHandlers } from "./clearMessageJobWebsocket.js";
import { logger } from "../services/logger.js";
import {
	handleClearMessageSocketDisconnecting,
	startClearMessageJobWebsocket,
} from "../services/clearMessageJobWebsocket.js";
import { handlePlayerSocketDisconnecting, startPlayerWebsocket } from "../services/playerWebsocket.js";
import { registerPlayerSocketHandlers } from "./playerWebsocket.js";

/** Wires every websocket feature onto a new connection. Add a feature's `register...SocketHandlers` call here. */
export function registerWebsocketHandlers(server: WebsocketServer): void {
	startPlayerWebsocket(server);
	startClearMessageJobWebsocket(server);
	server.on("connection", (socket) => {
		const user = formatUser(socket.data.user);
		logger.info("WEBSOCKET", "Client connected", { socket: socket.id, user });
		registerPlayerSocketHandlers(socket);
		registerClearMessageJobSocketHandlers(socket);
		socket.on("disconnecting", () => {
			handlePlayerSocketDisconnecting(socket);
			handleClearMessageSocketDisconnecting(socket);
		});
		socket.on("disconnect", (reason) => {
			logger.info("WEBSOCKET", "Client disconnected", { socket: socket.id, user, reason });
		});
	});
}
