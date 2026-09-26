import { MessageFlags } from "discord.js";
import type { ButtonInteraction } from "discord.js";

import type { Config } from "../services/config.js";
import { logger } from "../services/logger.js";
import { handleFunHelp } from "../buttons/funHelp.js";
import { handleGeneralHelp } from "../buttons/generalHelp.js";
import { handleHelp } from "../buttons/help.js";
import { handleLevelHelp } from "../buttons/levelHelp.js";
import { handleModHelp } from "../buttons/modHelp.js";
import { handleMusicHelp } from "../buttons/musicHelp.js";
import { handlePing } from "../buttons/ping.js";

const buttonHandlers = {
	Ping: handlePing,
	Help: handleHelp,
	GeneralHelp: handleGeneralHelp,
	MusicHelp: handleMusicHelp,
	LevelHelp: handleLevelHelp,
	FunHelp: handleFunHelp,
	ModHelp: handleModHelp,
} as const;

export async function handleButton({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	const startedAt = performance.now();
	const handler = buttonHandlers[interaction.customId as keyof typeof buttonHandlers];
	if (!handler) {
		logger.warn("BUTTONS", "Unknown button interaction", {
			customId: interaction.customId,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
		});
		await interaction.reply({ content: "This button is no longer available.", flags: MessageFlags.Ephemeral });
		return;
	}

	try {
		await handler({ interaction, config });
		logger.info("BUTTONS", "Button interaction executed successfully", {
			customId: interaction.customId,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
			durationMs: Math.round(performance.now() - startedAt),
		});
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("BUTTONS", "Button interaction failed", {
			customId: interaction.customId,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
			message,
		});
		if (!interaction.replied && !interaction.deferred) {
			await interaction.reply({ content: "There was an error handling this button.", flags: MessageFlags.Ephemeral });
		}
	}
}
