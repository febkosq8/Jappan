import { Events } from "discord.js";

import { getClient } from "../bot.js";
import { getCommands } from "../commandLoader.js";
import { logger } from "../logger.js";

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
			logger.info("COMMANDS", "Updating Discord commands", { count: commands.size });
			await readyClient.application.commands.set(commands.map((command) => command.data.toJSON()));
			logger.success("COMMANDS", "Discord commands updated", { count: commands.size });
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error("COMMANDS", "Failed to update Discord commands", { message });
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
}
