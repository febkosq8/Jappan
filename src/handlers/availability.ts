import type { RequestHandler } from "express";

import { isBotConnected } from "../bot.js";
import { documentMiddlewareResponses } from "../helpers/middleware.js";
import { isDatabaseConnected } from "../services/database.js";

const databaseUnavailable = "Database is unavailable";
const discordUnavailable = "Discord is unavailable";

export const requireDatabase: RequestHandler = documentMiddlewareResponses(
	(_request, response, next) => {
		if (!isDatabaseConnected()) {
			response.status(503).json({ error: databaseUnavailable });
			return;
		}
		next();
	},
	{ 503: databaseUnavailable },
);

export const requireDiscord: RequestHandler = documentMiddlewareResponses(
	(_request, response, next) => {
		if (!isBotConnected()) {
			response.status(503).json({ error: discordUnavailable });
			return;
		}
		next();
	},
	{ 503: discordUnavailable },
);
