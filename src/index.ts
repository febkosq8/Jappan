import "dotenv/config";
import { disconnectBot, isBotConnected, startBot as startDiscordBot } from "./bot.js";
import { loadConfig } from "./services/config.js";
import { connectDatabase, disconnectDatabase, isDatabaseConnected } from "./services/database.js";
import { logger } from "./services/logger.js";

export async function handleShutdown(signal: string, exitCode = 0): Promise<void> {
	logger.info("BOT", "Shutdown requested", { signal });
	try {
		if (isBotConnected()) {
			await disconnectBot();
		}
		if (isDatabaseConnected()) {
			await disconnectDatabase();
		}
	} finally {
		process.exit(exitCode);
	}
}

export async function startBot(): Promise<void> {
	process.once("SIGINT", () => void handleShutdown("SIGINT"));
	process.once("SIGTERM", () => void handleShutdown("SIGTERM"));
	loadConfig();
	await connectDatabase();
	await startDiscordBot();
}

startBot().catch((error: unknown) => {
	const message = error instanceof Error ? error.message : String(error);
	logger.error("BOT", "Startup failed", { message });
	void handleShutdown("STARTUP_FAILURE", 1);
});
