import { Client, GatewayIntentBits, Partials } from "discord.js";

import { loadCommands } from "./commandLoader.js";
import { getConfig } from "./config.js";
import { registerDiscordHandlers } from "./handlers/discord.js";
import { logger } from "./logger.js";

let discordClient: Client | undefined;

export function createDiscordClient(): Client {
	const client = new Client({
		intents: [
			GatewayIntentBits.Guilds,
			GatewayIntentBits.GuildMembers,
			GatewayIntentBits.GuildModeration,
			GatewayIntentBits.GuildInvites,
			GatewayIntentBits.GuildVoiceStates,
			GatewayIntentBits.GuildPresences,
			GatewayIntentBits.GuildMessages,
			GatewayIntentBits.DirectMessages,
			GatewayIntentBits.MessageContent,
		],
		partials: [Partials.Message, Partials.Channel, Partials.Reaction],
	});

	discordClient = client;
	return client;
}

export async function startBot(): Promise<void> {
	const client = createDiscordClient();
	await loadCommands();
	registerDiscordHandlers();

	logger.info("DISCORD", "Connecting to Discord");
	await client.login(getConfig("DISCORD_TOKEN"));
}

export function getClient(): Client {
	if (!discordClient) {
		throw new Error("Discord client has not been created");
	}
	return discordClient;
}

export function shutdownBot(signal: string): void {
	logger.info("DISCORD", "Shutdown requested", { signal });
	getClient().destroy();
}
