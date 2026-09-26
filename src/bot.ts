import { Client, Events, GatewayIntentBits } from "discord.js";

import { logger } from "./logger.js";

export function createDiscordClient(): Client {
	const client = new Client({
		intents: [GatewayIntentBits.Guilds],
	});

	client.once(Events.ClientReady, (readyClient) => {
		logger.success("DISCORD", "Client ready", {
			user: readyClient.user.tag,
			guilds: readyClient.guilds.cache.size,
		});
	});

	client.on(Events.Error, (error) => {
		logger.error("DISCORD", "Client error", {
			name: error.name,
			message: error.message,
			stack: error.stack,
		});
	});

	return client;
}
