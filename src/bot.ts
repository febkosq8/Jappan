import { Client, Events, GatewayIntentBits, Partials } from "discord.js";

import { loadCommands } from "./commandLoader.js";
import { getConfig } from "./config.js";
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

	discordClient = client;
	return client;
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

export async function startBot(): Promise<void> {
	const client = createDiscordClient();
	const commands = await loadCommands();

	client.once(Events.ClientReady, async (readyClient) => {
		try {
			logger.info("COMMANDS", "Updating Discord commands", { count: commands.size });
			await readyClient.application.commands.set(commands.map((command) => command.data.toJSON()));
			logger.success("COMMANDS", "Discord commands updated", { count: commands.size });
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error("COMMANDS", "Failed to update Discord commands", { message });
		}
	});

	client.on(Events.InteractionCreate, async (interaction) => {
		if (!interaction.isChatInputCommand()) {
			return;
		}

		const command = commands.get(interaction.commandName);
		if (!command) {
			logger.warn("COMMANDS", "Unknown command", { command: interaction.commandName });
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error("COMMANDS", "Command failed", {
				command: interaction.commandName,
				message,
			});

			if (interaction.replied || interaction.deferred) {
				await interaction.followUp("There was an error while running this command.");
			} else {
				await interaction.reply("There was an error while running this command.");
			}
		}
	});

	logger.info("DISCORD", "Connecting to Discord");
	await client.login(getConfig("DISCORD_TOKEN"));
}
