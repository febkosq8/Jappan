import { Events } from "discord.js";

import { getClient } from "../bot.js";
import { getCommands } from "../services/commandLoader.js";
import { logger } from "../services/logger.js";

export function registerDiscordHandlers(): void {
	const client = getClient();
	const commands = getCommands();

	client.once(Events.ClientReady, (readyClient) => {
		logger.success("DISCORD", "Client ready", {
			user: readyClient.user.tag,
			guilds: readyClient.guilds.cache.size,
		});
	});

	client.once(Events.ClientReady, async (readyClient) => {
		try {
			logger.info("SLASH_COMMANDS", `Starting to update #${commands.size} application slash commands`);
			await readyClient.application.commands.set(commands.map((command) => command.data.toJSON()));
			logger.success("SLASH_COMMANDS", `#${commands.size} application slash commands updated`);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error("SLASH_COMMANDS", "Failed to update application slash commands", { message });
		}
	});

	client.on(Events.Error, (error) => {
		logger.error("DISCORD", "Client error", {
			name: error.name,
			message: error.message,
			stack: error.stack,
		});
	});

	client.on(Events.InteractionCreate, async (interaction) => {
		if (!interaction.isChatInputCommand()) {
			return;
		}

		const command = commands.get(interaction.commandName);
		if (!command) {
			logger.warn("SLASH_COMMANDS", "Unknown application slash command", { command: interaction.commandName });
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error("SLASH_COMMANDS", "Application slash command failed", {
				command: interaction.commandName,
				message,
			});

			if (interaction.replied || interaction.deferred) {
				await interaction.followUp("There was an error while running this application slash command.");
			} else {
				await interaction.reply("There was an error while running this application slash command.");
			}
		}
	});
}
