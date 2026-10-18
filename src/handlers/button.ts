import type { ButtonInteraction } from "discord.js";
import { MessageFlags } from "discord.js";

import { formatInteractionLogDetails } from "../helpers/discord.js";
import { getButtonHandler } from "../services/buttonLoader.js";
import type { Config } from "../services/config.js";
import { logger } from "../services/logger.js";

export async function handleButtonInteraction({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	const startedAt = performance.now();
	const handler = getButtonHandler(interaction.customId);
	if (!handler) {
		logger.warn("BUTTONS", "Unknown button interaction", formatInteractionLogDetails(interaction));
		await interaction.reply({ content: "⛔ This button is no longer available.", flags: MessageFlags.Ephemeral });
		return;
	}

	try {
		await handler({ interaction, config });
		logger.info("BUTTONS", "Button interaction executed successfully", {
			...formatInteractionLogDetails(interaction),
			durationMs: Math.round(performance.now() - startedAt),
		});
	} catch (error: unknown) {
		logger.error("BUTTONS", "Button interaction failed", {
			...formatInteractionLogDetails(interaction),
			customId: interaction.customId,
			error,
		});
		if (!interaction.replied && !interaction.deferred) {
			await interaction.reply({
				content: "⛔ There was an error handling this button.",
				flags: MessageFlags.Ephemeral,
			});
		}
	}
}
