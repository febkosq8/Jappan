import { disconnectBot, isBotConnected } from "../bot.js";
import { disconnectDatabase, isDatabaseConnected } from "./database.js";
import { stopCronJobs } from "./cron.js";
import { logger } from "./logger.js";
import { shutdownPlayer } from "./player.js";

let shutdownPromise: Promise<void> | undefined;
const shutdownTimeoutMilliseconds = 60_000;

export function handleShutdown(signal: string, exitCode = 0): Promise<void> {
	if (shutdownPromise) {
		return shutdownPromise;
	}

	shutdownPromise = (async () => {
		logger.info("BOT", "Shutdown requested", { signal });
		let timeoutHandle: NodeJS.Timeout | undefined;
		try {
			await Promise.race([
				(async () => {
					stopCronJobs();
					if (isBotConnected()) {
						await shutdownPlayer();
						await disconnectBot();
					}
					if (isDatabaseConnected()) {
						await disconnectDatabase();
					}
				})(),
				new Promise<never>((_, reject) => {
					timeoutHandle = setTimeout(
						() => reject(new Error(`Shutdown timed out after ${shutdownTimeoutMilliseconds}ms`)),
						shutdownTimeoutMilliseconds,
					);
					timeoutHandle.unref();
				}),
			]);
		} catch (error: unknown) {
			logger.error("BOT", "Shutdown cleanup failed", {
				error,
				timeoutMilliseconds: shutdownTimeoutMilliseconds,
			});
		} finally {
			if (timeoutHandle) {
				clearTimeout(timeoutHandle);
			}
			logger.info("BOT", "Calling process.exit", { exitCode });
			process.exit(exitCode);
		}
	})();

	return shutdownPromise;
}
