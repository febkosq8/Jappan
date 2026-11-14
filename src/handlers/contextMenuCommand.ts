import type {
	MessageContextMenuCommandInteraction,
	InteractionReplyOptions,
	UserContextMenuCommandInteraction,
} from "discord.js";
import { MessageFlags } from "discord.js";

import { formatInteractionLogDetails } from "../helpers/discord.js";
import { getContextMenuCommand } from "../services/commandLoader.js";
import type { Config } from "../services/config.js";
import { logger } from "../services/logger.js";

export async function handleContextMenuCommandInteraction({
	interaction,
	config,
}: {
	interaction: MessageContextMenuCommandInteraction | UserContextMenuCommandInteraction;
	config: Config;
}): Promise<void> {
	const startedAt = performance.now();
	const command = getContextMenuCommand(interaction.commandName);
	const getExecutionLogDetails = () => ({
		...formatInteractionLogDetails(interaction),
		durationMs: Math.round(performance.now() - startedAt),
	});

	if (!command) {
		logger.warn("SLASH_COMMANDS", "Unknown context menu command", getExecutionLogDetails());
		return;
	}

	try {
		await command.execute({ interaction, config });
		logger.info("SLASH_COMMANDS", "Context menu command executed successfully", getExecutionLogDetails());
	} catch (error: unknown) {
		logger.error("SLASH_COMMANDS", "Context menu command failed", {
			...getExecutionLogDetails(),
			error,
		});

		try {
			const response: InteractionReplyOptions = {
				content: "⛔ There was an error while running this context menu command.",
				flags: MessageFlags.Ephemeral,
			};
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp(response);
			} else {
				await interaction.reply(response);
			}
		} catch (responseError: unknown) {
			logger.warn("SLASH_COMMANDS", "Failed to send context menu command error response", {
				...getExecutionLogDetails(),
				error: responseError,
			});
		}
	}
}
