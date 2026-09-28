import { Client, GatewayIntentBits, Partials } from "discord.js";

import { registerDiscordHandlers, registerExtendedDiscordHandlers } from "./handlers/discord.js";
import { loadButtons } from "./services/buttonLoader.js";
import { loadCommands } from "./services/commandLoader.js";
import { getConfig } from "./services/config.js";
import { logger } from "./services/logger.js";
import { initializePlayer } from "./services/player.js";

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
	await loadButtons();
	registerDiscordHandlers();
	registerExtendedDiscordHandlers();
	initializePlayer(client);

	logger.info("DISCORD", "Connecting to Discord");
	await client.login(getConfig("DISCORD_TOKEN"));
}

export function getClient(): Client {
	if (!discordClient) {
		throw new Error("Discord client has not been created");
	}
	return discordClient;
}

export function isBotConnected(): boolean {
	return discordClient?.isReady() ?? false;
}

export async function disconnectBot(): Promise<void> {
	const client = discordClient;
	if (client?.isReady()) {
		client.destroy();
		logger.info("DISCORD", "Discord client disconnected");
	}
}
