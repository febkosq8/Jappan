import type { ChatInputCommandInteraction } from "discord.js";
import { MessageFlags, underline } from "discord.js";

import { formatInteractionLogDetails } from "../helpers/discord.js";
import { getMissingBotPermissions } from "../helpers/shared/permissions.js";
import { getCommand } from "../services/commandLoader.js";
import type { Config } from "../services/config.js";
import { isDatabaseConnected } from "../services/database.js";
import { logger } from "../services/logger.js";

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
		logger.warn("SLASH_COMMANDS", "Unknown Application (/) command", formatInteractionLogDetails(interaction));
		return;
	}
	const postExecute = command.postExecute;
	const getExecutionLogDetails = () => ({
		...formatInteractionLogDetails(interaction),
		durationMs: Math.round(performance.now() - startedAt),
	});
	try {
		const hasSubCommands = command.commandData.hasSubCommands ?? false;
		const subcommand = hasSubCommands ? interaction.options.getSubcommand() : undefined;
		const subcommandData = subcommand
			? command.commandData.subCommands?.find((entry) => entry.name === subcommand)
			: undefined;
		const requiredBotPermissions = [
			...(command.commandData.requiredBotPermissions ?? []),
			...(subcommandData?.requiredBotPermissions ?? []),
		];
		const missingPermissions = getMissingBotPermissions(interaction, requiredBotPermissions);
		if (missingPermissions.length > 0) {
			logger.warn("SLASH_COMMANDS", "Application (/) command rejected because bot lacks permissions", {
				...getExecutionLogDetails(),
				missingPermissions,
			});
			await interaction.reply({
				content: `⛔ I need these permissions to run this command: ${missingPermissions
					.map((permission) => underline(permission))
					.join(", ")}.`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (command.commandData.isDBDependant && !isDatabaseConnected()) {
			logger.warn("SLASH_COMMANDS", "Application (/) command rejected because database is unavailable", {
				...getExecutionLogDetails(),
			});
			await interaction.reply({
				content: "⛔ The bot is temporarily unavailable. Please try again later.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await command.execute({ interaction, config });
		logger.info(
			"SLASH_COMMANDS",
			postExecute
				? "Application (/) command executed successfully; running postExecute"
				: "Application (/) command executed successfully",
			getExecutionLogDetails(),
		);
		if (postExecute) {
			await postExecute({ interaction, config });
			logger.info(
				"SLASH_COMMANDS",
				"Application (/) command postExecute completed successfully",
				getExecutionLogDetails(),
			);
		}
	} catch (error: unknown) {
		logger.error("SLASH_COMMANDS", "Application (/) command failed", {
			...getExecutionLogDetails(),
			error,
		});

		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({
				content: "⛔ There was an error while running this Application (/) command.",
				flags: MessageFlags.Ephemeral,
			});
		} else {
			await interaction.reply({
				content: "⛔ There was an error while running this Application (/) command.",
				flags: MessageFlags.Ephemeral,
			});
		}
	}
}
