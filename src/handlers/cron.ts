import type { Client } from "discord.js";

import { updatePresence } from "./discord.js";
import { runPlayerHealthCheck } from "../services/player.js";
import { registerCronJob } from "../services/cron.js";

export function registerCronHandlers(client: Client): void {
	registerCronJob({
		name: "player-health-check",
		description: "Check whether the music player is healthy",
		cronTime: "0 0 */12 * * *",
		humanCronTime: "Every 12 hours",
		task: runPlayerHealthCheck,
	});
	registerCronJob({
		name: "discord-presence-update",
		description: "Refresh the bot presence with current server and user counts",
		cronTime: "0 0 */6 * * *",
		humanCronTime: "Every 6 hours",
		task: () => updatePresence(client),
	});
}
