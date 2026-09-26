import type { ChatInputCommandInteraction } from "discord.js";

import { getCommand } from "../services/commandLoader.js";
import { isDatabaseConnected } from "../services/database.js";
import { logger } from "../services/logger.js";

export async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
	const startedAt = performance.now();
	const command = getCommand(interaction.commandName);
	if (!command) {
		logger.warn("SLASH_COMMANDS", "Unknown Application (/) command", {
			command: interaction.commandName,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
		});
		return;
	}
	try {
		if (command.commandData.isDBDependant && !isDatabaseConnected()) {
			logger.warn("SLASH_COMMANDS", "Application (/) command rejected because database is unavailable", {
				command: interaction.commandName,
				user: `${interaction.user.tag} <${interaction.user.id}>`,
				durationMs: Math.round(performance.now() - startedAt),
			});
			await interaction.reply({
				content: "The bot is temporarily unavailable. Please try again later.",
				ephemeral: true,
			});
			return;
		}

		await command.execute(interaction);
		logger.info("SLASH_COMMANDS", "Application (/) command executed successfully", {
			command: interaction.commandName,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
			durationMs: Math.round(performance.now() - startedAt),
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("SLASH_COMMANDS", "Application (/) command failed", {
			command: interaction.commandName,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
			durationMs: Math.round(performance.now() - startedAt),
			message,
		});

		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: "There was an error while running this Application (/) command.",
				ephemeral: true,
			});
		} else {
			await interaction.reply({
				content: "There was an error while running this Application (/) command.",
				ephemeral: true,
			});
		}
	}
}
