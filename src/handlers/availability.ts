import type { RequestHandler } from "express";

import { isBotConnected } from "../bot.js";
import { isDatabaseConnected } from "../services/database.js";

export const requireDatabase: RequestHandler = (_request, response, next) => {
	if (!isDatabaseConnected()) {
		response.status(503).json({ error: "Database is unavailable" });
		return;
	}
	next();
};

export const requireDiscord: RequestHandler = (_request, response, next) => {
	if (!isBotConnected()) {
		response.status(503).json({ error: "Discord is unavailable" });
		return;
	}
	next();
};
