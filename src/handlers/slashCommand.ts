import { MessageFlags, quote, underline } from "discord.js";
import type { ChatInputCommandInteraction } from "discord.js";

import { getCommand } from "../services/commandLoader.js";
import type { Config } from "../services/config.js";
import { isDatabaseConnected } from "../services/database.js";
import { logger } from "../services/logger.js";
import { getMissingBotPermissions } from "../helpers/shared/permissions.js";

export async function handleSlashCommandInteraction({
	interaction,
	config,
}: {
	interaction: ChatInputCommandInteraction;
	config: Config;
}): Promise<void> {
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
		const missingPermissions = getMissingBotPermissions(interaction, command.commandData.requiredBotPermissions);
		if (missingPermissions.length > 0) {
			logger.warn("SLASH_COMMANDS", "Application (/) command rejected because bot lacks permissions", {
				command: interaction.commandName,
				user: `${interaction.user.tag} <${interaction.user.id}>`,
				missingPermissions,
				durationMs: Math.round(performance.now() - startedAt),
			});
			await interaction.reply({
				content: `:error: I need these permissions to run this command: ${missingPermissions
					.map((permission) => underline(permission))
					.join(", ")}.`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (command.commandData.isDBDependant && !isDatabaseConnected()) {
			logger.warn("SLASH_COMMANDS", "Application (/) command rejected because database is unavailable", {
				command: interaction.commandName,
				user: `${interaction.user.tag} <${interaction.user.id}>`,
				durationMs: Math.round(performance.now() - startedAt),
			});
			await interaction.reply({
				content: ":error: The bot is temporarily unavailable. Please try again later.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await command.execute({ interaction, config });
		logger.info("SLASH_COMMANDS", "Application (/) command executed successfully", {
			command: interaction.commandName,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
			durationMs: Math.round(performance.now() - startedAt),
		});
	} catch (error: unknown) {
		logger.error("SLASH_COMMANDS", "Application (/) command failed", {
			command: interaction.commandName,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
			durationMs: Math.round(performance.now() - startedAt),
			error,
		});

		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: ":error: There was an error while running this Application (/) command.",
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.reply({
				content: ":error: There was an error while running this Application (/) command.",
				flags: MessageFlags.Ephemeral,
			});
		}
	}
}
