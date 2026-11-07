import type { RequestHandler } from "express";

import { isBotConnected } from "../bot.js";
import { documentUnavailable } from "../helpers/middleware.js";
import { isDatabaseConnected } from "../services/database.js";

export const requireDatabase: RequestHandler = documentUnavailable((_request, response, next) => {
	if (!isDatabaseConnected()) {
		response.status(503).json({ error: "Database is unavailable" });
		return;
	}
	next();
}, "Database unavailable");

export const requireDiscord: RequestHandler = documentUnavailable((_request, response, next) => {
	if (!isBotConnected()) {
		response.status(503).json({ error: "Discord is unavailable" });
		return;
	}
	next();
}, "Discord unavailable");
