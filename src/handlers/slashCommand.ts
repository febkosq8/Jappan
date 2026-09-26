import type { ChatInputCommandInteraction } from "discord.js";

import { getCommands } from "../services/commandLoader.js";
import { logger } from "../services/logger.js";

export async function handleSlashCommand(interaction: ChatInputCommandInteraction): Promise<void> {
	const commands = getCommands();
	const command = commands.get(interaction.commandName);
	if (!command) {
		logger.warn("SLASH_COMMANDS", "Unknown Application (/) command", {
			command: interaction.commandName,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
		});
		return;
	}
	const startedAt = performance.now();
	try {
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
