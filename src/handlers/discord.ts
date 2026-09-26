import { Events, InteractionType } from "discord.js";
import type { Interaction } from "discord.js";

import { getClient } from "../bot.js";
import { getCommands } from "../services/commandLoader.js";
import { logger } from "../services/logger.js";
import { handleAutocomplete } from "./autocomplete.js";
import { handleSlashCommand } from "./slashCommand.js";

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
			logger.info("SLASH_COMMANDS", `Starting to update #${commands.size} Application (/) commands`);
			await readyClient.application.commands.set(commands.map((command) => command.data.toJSON()));
			logger.success("SLASH_COMMANDS", `#${commands.size} Application (/) commands updated`);
		} catch (error: unknown) {
			const message = error instanceof Error ? error.message : String(error);
			logger.error("SLASH_COMMANDS", "Failed to update Application (/) commands", { message });
		}
	});

	client.on(Events.Error, (error) => {
		logger.error("DISCORD", "Client error", {
			name: error.name,
			message: error.message,
			stack: error.stack,
		});
	});

	client.on(Events.InteractionCreate, (interaction: Interaction) => {
		logger.info("DISCORD", "Interaction received", {
			type: InteractionType[interaction.type],
			typeId: interaction.type,
			command: "commandName" in interaction ? interaction.commandName : undefined,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
		});

		if (interaction.isAutocomplete()) {
			void handleAutocomplete(interaction);
			return;
		}

		if (!interaction.isChatInputCommand()) {
			return;
		}

		void handleSlashCommand(interaction);
	});
}
