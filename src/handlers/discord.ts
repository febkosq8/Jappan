import { Events, InteractionType } from "discord.js";
import type { Interaction } from "discord.js";

import { getClient } from "../bot.js";
import { getCommands, setRegisteredCommandIds } from "../services/commandLoader.js";
import { getConfig } from "../services/config.js";
import { logger } from "../services/logger.js";
import { handleAutocomplete } from "./autocomplete.js";
import { handleSlashCommand } from "./slashCommand.js";

export function registerDiscordHandlers(): void {
	const client = getClient();
	const commands = getCommands();

	client.once(Events.ClientReady, (readyClient) => {
		const config = getConfig();
		config.BOT_NAME = readyClient.user.username;
		config.BOT_PFP = readyClient.user.displayAvatarURL({ size: 256 });
		logger.success("DISCORD", "Client ready", {
			user: readyClient.user.tag,
			guilds: readyClient.guilds.cache.size,
			commands: commands.size,
			users: readyClient.users.cache.size,
		});
	});

	client.once(Events.ClientReady, async (readyClient) => {
		try {
			logger.info("SLASH_COMMANDS", `Starting to update #${commands.size} Application (/) commands`);
			const registeredCommands = await readyClient.application.commands.set(
				commands.map((command) => command.data.toJSON()),
			);
			setRegisteredCommandIds(registeredCommands);
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
			customId: interaction.isMessageComponent() ? interaction.customId : undefined,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
		});

		if (interaction.isAutocomplete()) {
			void handleAutocomplete(interaction);
			return;
		}

		if (interaction.isChatInputCommand()) {
			void handleSlashCommand(interaction);
			return;
		}
		logger.warn("DISCORD", "Unhandled interaction", {
			type: InteractionType[interaction.type],
			typeId: interaction.type,
			customId: interaction.isMessageComponent() ? interaction.customId : undefined,
			user: `${interaction.user.tag} <${interaction.user.id}>`,
		});
		return;
	});
}
