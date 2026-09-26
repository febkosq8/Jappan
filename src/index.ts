import "dotenv/config";
import { pathToFileURL } from "node:url";
import { createDiscordClient } from "./bot.js";
import { getConfig, loadConfig } from "./config.js";
import { logger } from "./logger.js";

export async function startBot(): Promise<void> {
	loadConfig();
	const client = createDiscordClient();

	const shutdown = (signal: string): void => {
		logger.info("BOT", "Shutdown requested", { signal });
		client.destroy();
	};

	process.once("SIGINT", () => shutdown("SIGINT"));
	process.once("SIGTERM", () => shutdown("SIGTERM"));

	await client.login(getConfig("DISCORD_TOKEN"));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	startBot().catch((error: unknown) => {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("BOT", "Startup failed", { message });
		process.exitCode = 1;
	});
}
