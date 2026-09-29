import "dotenv/config";
import { startBot as startDiscordBot } from "./bot.js";
import { getBotVersion } from "./helpers/utils.js";
import { getConfig, loadConfig } from "./services/config.js";
import { connectDatabase } from "./services/database.js";
import { logger } from "./services/logger.js";
import { handleShutdown } from "./services/shutdown.js";

let processFailureCount = 0;

function handleProcessFailure(type: "Uncaught exception" | "Unhandled promise rejection", error: unknown): void {
	processFailureCount += 1;
	const shutdownThreshold = getConfig("SHUTDOWN_THREASHOLD");
	logger.error("BOT", type, {
		error,
		processFailureCount,
		shutdownThreshold,
	});

	if (processFailureCount >= shutdownThreshold) {
		void handleShutdown(`PROCESS_${type === "Uncaught exception" ? "EXCEPTION" : "REJECTION"}`, 1);
	}
}

export async function startBot(): Promise<void> {
	loadConfig();
	logger.info("BOT", `Initialization started v${getBotVersion()}`);
	process.once("SIGINT", () => void handleShutdown("SIGINT"));
	process.once("SIGTERM", () => void handleShutdown("SIGTERM"));
	process.on("uncaughtException", (error: Error) => {
		handleProcessFailure("Uncaught exception", error);
	});
	process.on("unhandledRejection", (reason: unknown) => {
		handleProcessFailure("Unhandled promise rejection", reason);
	});
	await connectDatabase();
	await startDiscordBot();
}

startBot().catch((error: unknown) => {
	logger.error("BOT", "Startup failed", { error });
	void handleShutdown("STARTUP_FAILURE", 1);
});
