import "dotenv/config";
import { pathToFileURL } from "node:url";
import { shutdownBot, startBot as startDiscordBot } from "./bot.js";
import { loadConfig } from "./services/config.js";
import { logger } from "./services/logger.js";

export async function startBot(): Promise<void> {
	loadConfig();
	process.once("SIGINT", () => shutdownBot("SIGINT"));
	process.once("SIGTERM", () => shutdownBot("SIGTERM"));
	await startDiscordBot();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	startBot().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("BOT", "Startup failed", { message });
		process.exitCode = 1;
	});
}
