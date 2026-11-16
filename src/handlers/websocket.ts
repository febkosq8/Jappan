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
import { registerDirectMessageSocketHandlers } from "./directMessageWebsocket.js";
import { startDirectMessageWebsocket } from "../services/directMessageWebsocket.js";

const websocketFeatures = new Set(["player", "purge-job", "direct-messages"]);

/** Wires every websocket feature onto a new connection. Add a feature's `register...SocketHandlers` call here. */
export function registerWebsocketHandlers(server: WebsocketServer): void {
	startPlayerWebsocket(server);
	startPurgeMessageJobWebsocket(server);
	startDirectMessageWebsocket(server);
	server.on("connection", (socket) => {
		const user = formatUser(socket.data.user);
		const requestedFeatures: unknown = socket.handshake.auth.features;
		const feature =
			Array.isArray(requestedFeatures) &&
			requestedFeatures.length > 0 &&
			requestedFeatures.length <= websocketFeatures.size &&
			requestedFeatures.every((value: unknown) => typeof value === "string" && websocketFeatures.has(value))
				? [...new Set(requestedFeatures)].join(",")
				: "unknown";
		logger.info("WEBSOCKET", "Client connected", { feature, socket: socket.id, user });
		registerPlayerSocketHandlers(socket);
		registerPurgeMessageJobSocketHandlers(socket);
		registerDirectMessageSocketHandlers(socket);
		socket.on("disconnecting", () => {
			handlePlayerSocketDisconnecting(socket);
			handlePurgeMessageSocketDisconnecting(socket);
		});
		socket.on("disconnect", (reason) => {
			logger.info("WEBSOCKET", "Client disconnected", {
				feature,
				socket: socket.id,
				user,
				reason,
			});
		});
	});
}
