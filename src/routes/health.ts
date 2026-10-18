import { Router, type Router as ExpressRouter } from "express";

import { isBotConnected } from "../bot.js";
import { isDatabaseConnected } from "../services/database.js";
import { logger } from "../services/logger.js";
import { isPlayerAvailable } from "../services/player.js";

const router: ExpressRouter = Router();

router.get("/db", (_request, response) => {
	try {
		const healthy = isDatabaseConnected();
		return response.status(200).json({ healthy });
	} catch (error) {
		logger.error("HTTP", "Failed to return db health check", {
			error: error instanceof Error ? error.message : String(error),
		});
		return response.status(500).json({ error: "Something went wrong while returning db health check" });
	}
});
router.get("/discord", (_request, response) => {
	try {
		const healthy = isBotConnected();
		return response.status(200).json({ healthy });
	} catch (error) {
		logger.error("HTTP", "Failed to return discord health check", {
			error: error instanceof Error ? error.message : String(error),
		});
		return response.status(500).json({ error: "Something went wrong while returning discord health check" });
	}
});
router.get("/player", (_request, response) => {
	try {
		const healthy = isPlayerAvailable();
		return response.status(200).json({ healthy });
	} catch (error) {
		logger.error("HTTP", "Failed to return player health check", {
			error: error instanceof Error ? error.message : String(error),
		});
		return response.status(500).json({ error: "Something went wrong while returning player health check" });
	}
});
router.get("/", (_request, response) => {
	try {
		const services = {
			db: isDatabaseConnected(),
			discord: isBotConnected(),
			player: isPlayerAvailable(),
		};
		const healthy = Object.values(services).every(Boolean);
		return response.status(200).json({ healthy, services });
	} catch (error) {
		logger.error("HTTP", "Failed to return health check", {
			error: error instanceof Error ? error.message : String(error),
		});
		return response.status(500).json({ error: "Something went wrong while returning health check" });
	}
});

export default router;
