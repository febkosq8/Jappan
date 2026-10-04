import type { Express } from "express";

import { healthRouteHandler } from "../routes/health.js";
import { logger } from "../services/logger.js";

export function registerHttpHandlers(app: Express): void {
	app.use((request, _response, next) => {
		logger.info("HTTP", "HTTP request received", {
			method: request.method,
			url: request.originalUrl,
		});
		next();
	});
	app.get("/health", healthRouteHandler);
}
