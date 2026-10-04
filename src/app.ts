import express from "express";
import type { Server } from "node:http";

import { registerHttpHandlers } from "./handlers/http.js";
import { getConfig } from "./services/config.js";
import { logger } from "./services/logger.js";

const app = express();
let server: Server | undefined;

registerHttpHandlers(app);

export function startApp(): Promise<void> {
	if (server) {
		return Promise.resolve();
	}

	const port = getConfig("PORT");
	app.use(express.json({ limit: "25mb" }));
	app.use(express.urlencoded({ limit: "25mb", extended: false }));
	app.disable("x-powered-by");
	app.disable("etag");
	return new Promise((resolve, reject) => {
		const httpServer = app.listen(port, () => {
			server = httpServer;
			logger.info("HTTP", "HTTP server listening", { port });
			resolve();
		});
		httpServer.once("error", reject);
	});
}

export function stopApp(): Promise<void> {
	const httpServer = server;
	server = undefined;
	if (!httpServer) {
		return Promise.resolve();
	}

	return new Promise((resolve, reject) => {
		httpServer.close((error) => {
			if (error) {
				reject(error);
				return;
			}
			resolve();
		});
	});
}
