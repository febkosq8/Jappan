import type { WebsocketServer } from "../helpers/websocket.js";
import { logger } from "../services/logger.js";
import { startPlayerWebsocket } from "../services/playerWebsocket.js";
import { registerPlayerSocketHandlers } from "./playerWebsocket.js";

/** Wires every websocket feature onto a new connection. Add a feature's `register...SocketHandlers` call here. */
export function registerWebsocketHandlers(server: WebsocketServer): void {
	startPlayerWebsocket(server);
	server.on("connection", (socket) => {
		const user = socket.data.discordAccountId ?? socket.data.authSession.user.id;
		logger.debug("WEBSOCKET", "Client connected", { user });
		registerPlayerSocketHandlers(socket);
		socket.on("disconnect", (reason) => {
			logger.debug("WEBSOCKET", "Client disconnected", { user, reason });
		});
	});
}
