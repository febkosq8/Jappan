import type { Request, Response } from "express";

import { isBotConnected } from "../bot.js";
import { isDatabaseConnected } from "../services/database.js";
import { isPlayerAvailable } from "../services/player.js";

export function healthRouteHandler(_request: Request, response: Response) {
	const services = {
		db: isDatabaseConnected(),
		discord: isBotConnected(),
		player: isPlayerAvailable(),
	};
	const healthy = Object.values(services).every(Boolean);

	return response.status(200).json({ healthy, services });
}
