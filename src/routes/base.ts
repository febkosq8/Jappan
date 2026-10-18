import { Router, type Router as ExpressRouter } from "express";

import { getConfig } from "../services/config.js";
import { logger } from "../services/logger.js";

const router: ExpressRouter = Router();

router.get("/", (_request, response) => {
	try {
		const address = getConfig("BOT_WEBSITE");
		return response.header("Location", address).status(307).send(`Redirecting to '${address}'`);
	} catch (error) {
		logger.error("HTTP", "Failed to return homepage", {
			error: error instanceof Error ? error.message : String(error),
		});
		return response.status(500).json({ error: "Something went wrong while returning homepage" });
	}
});

export default router;
