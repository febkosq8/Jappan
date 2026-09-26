import type { AutocompleteInteraction } from "discord.js";

import { getCommands } from "../services/commandLoader.js";
import type { Config } from "../services/config.js";
import { logger } from "../services/logger.js";

export async function handleAutocomplete({
	interaction,
	config: _config,
}: {
	interaction: AutocompleteInteraction;
	config: Config;
}): Promise<void> {
	const command = getCommands().get(interaction.commandName);
	if (!command) {
		logger.warn("AUTOCOMPLETE", "Unknown application command for autocomplete", {
			command: interaction.commandName,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
		});
		await interaction.respond([]);
		return;
	}

	if (!command.autocomplete) {
		await interaction.respond([]);
		return;
	}

	try {
		await command.autocomplete(interaction);
	} catch (error: unknown) {
		const message = error instanceof Error ? error.message : String(error);
		logger.error("AUTOCOMPLETE", "Application command autocomplete failed", {
			command: interaction.commandName,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
			message,
		});

		if (!interaction.responded) {
			await interaction.respond([]);
		}
	}
}
