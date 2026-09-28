import "dotenv/config";
import { startBot as startDiscordBot } from "./bot.js";
import { loadConfig } from "./services/config.js";
import { connectDatabase } from "./services/database.js";
import { logger } from "./services/logger.js";
import { handleShutdown } from "./services/shutdown.js";

export async function startBot(): Promise<void> {
	process.once("SIGINT", () => void handleShutdown("SIGINT"));
	process.once("SIGTERM", () => void handleShutdown("SIGTERM"));
	loadConfig();
	await connectDatabase();
	await startDiscordBot();
}

startBot().catch((error: unknown) => {
	logger.error("BOT", "Startup failed", { error });
	void handleShutdown("STARTUP_FAILURE", 1);
});
