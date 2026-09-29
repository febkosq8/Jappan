import type { AutocompleteInteraction } from "discord.js";

import { formatInteractionLogDetails } from "../helpers/discord.js";
import { getCommands } from "../services/commandLoader.js";
import type { Config } from "../services/config.js";
import { logger } from "../services/logger.js";

function isUnknownInteractionError(error: unknown): boolean {
	return typeof error === "object" && error !== null && "code" in error && error.code === 10062;
}

export async function handleAutocompleteInteraction({
	interaction,
	config: _config,
}: {
	interaction: AutocompleteInteraction;
	config: Config;
}): Promise<void> {
	const command = getCommands().get(interaction.commandName);
	if (!command) {
		logger.warn(
			"AUTOCOMPLETE",
			"Unknown application command for autocomplete",
			formatInteractionLogDetails(interaction),
		);
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
		if (isUnknownInteractionError(error)) {
			logger.info(
				"DISCORD",
				"Autocomplete interaction expired before it could be answered",
				formatInteractionLogDetails(interaction),
			);
			return;
		}

		logger.error("AUTOCOMPLETE", "Application command autocomplete failed", {
			...formatInteractionLogDetails(interaction),
			error,
		});

		if (!interaction.responded) {
			try {
				await interaction.respond([]);
			} catch (fallbackError: unknown) {
				if (isUnknownInteractionError(fallbackError)) {
					logger.debug(
						"AUTOCOMPLETE",
						"Autocomplete interaction expired before fallback response",
						formatInteractionLogDetails(interaction),
					);
					return;
				}
				throw fallbackError;
			}
		}
	}
}
