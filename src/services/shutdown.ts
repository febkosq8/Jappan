import { disconnectBot, isBotConnected } from "../bot.js";
import { disconnectDatabase, isDatabaseConnected } from "./database.js";
import { logger } from "./logger.js";
import { shutdownPlayer } from "./player.js";

let shutdownPromise: Promise<void> | undefined;

export function handleShutdown(signal: string, exitCode = 0): Promise<void> {
	if (shutdownPromise) {
		return shutdownPromise;
	}

	shutdownPromise = (async () => {
		logger.info("BOT", "Shutdown requested", { signal });
		try {
			if (isBotConnected()) {
				await shutdownPlayer();
				await disconnectBot();
			}
			if (isDatabaseConnected()) {
				await disconnectDatabase();
			}
		} finally {
			logger.info("BOT", "Calling process.exit", { exitCode });
			process.exit(exitCode);
		}
	})();

	return shutdownPromise;
}
