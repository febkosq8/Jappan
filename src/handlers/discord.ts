import { Events, InteractionType } from "discord.js";
import type { Interaction } from "discord.js";

import { getClient } from "../bot.js";
import { getCommands, setRegisteredCommandIds } from "../services/commandLoader.js";
import { getConfig } from "../services/config.js";
import { logger } from "../services/logger.js";
import { handleAutocompleteInteraction } from "./autocomplete.js";
import { handleButtonInteraction } from "./button.js";
import { handleSlashCommandInteraction } from "./slashCommand.js";
import { handleMemberJoinAnnouncement, handleMemberLeaveAnnouncement } from "../services/memberAnnouncement.js";
import { handleLevelingInteraction, handleLevelingMessage, handleLevelingVoiceState } from "../services/leveling.js";
import {
	handleAuditMemberAdd,
	handleAuditMemberRemove,
	handleAuditMessageBulkDelete,
	handleAuditMessageDelete,
	handleAuditMessageUpdate,
	handleAuditVoiceState,
} from "../services/auditLog.js";

export function registerDiscordHandlers(): void {
	const client = getClient();
	const commands = getCommands();
	const config = getConfig();

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
			logger.error("SLASH_COMMANDS", "Failed to update Application (/) commands", { error });
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
			void handleAutocompleteInteraction({ interaction, config });
			return;
		}

		if (interaction.isButton()) {
			void handleButtonInteraction({ interaction, config });
			return;
		}

		if (interaction.isChatInputCommand()) {
			void handleSlashCommandInteraction({ interaction, config });
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

	logger.success("DISCORD", "Core Discord event handlers registered");
}

function registerEventDebugHandlers(client: ReturnType<typeof getClient>, enabledEvents: readonly string[]): void {
	const events = {
		GuildMemberAdd: Events.GuildMemberAdd,
		GuildMemberRemove: Events.GuildMemberRemove,
		MessageCreate: Events.MessageCreate,
		InteractionCreate: Events.InteractionCreate,
		VoiceStateUpdate: Events.VoiceStateUpdate,
		MessageDelete: Events.MessageDelete,
		MessageBulkDelete: Events.MessageBulkDelete,
		MessageUpdate: Events.MessageUpdate,
	} as const;
	for (const [eventName, event] of Object.entries(events)) {
		if (!enabledEvents.includes(eventName)) {
			continue;
		}
		logger.success("DISCORD", "Debug Discord event handlers registered", { eventName });
		client.on(event as string, (...args: unknown[]) => {
			logger.debug("DISCORD", `Events.${eventName}`, { args });
		});
	}
}

export function registerExtendedDiscordHandlers(): void {
	const client = getClient();
	const config = getConfig();

	client.on(Events.GuildMemberAdd, (member) => {
		void handleMemberJoinAnnouncement(member);
		void handleAuditMemberAdd(member);
	});

	client.on(Events.GuildMemberRemove, (member) => {
		void handleMemberLeaveAnnouncement(member);
		void handleAuditMemberRemove(member);
	});

	client.on(Events.MessageCreate, (message) => {
		void handleLevelingMessage(message);
	});

	client.on(Events.InteractionCreate, (interaction) => {
		void handleLevelingInteraction(interaction);
	});

	client.on(Events.VoiceStateUpdate, (oldState, newState) => {
		void handleLevelingVoiceState(oldState, newState);
		void handleAuditVoiceState(oldState, newState);
	});

	client.on(Events.MessageDelete, (message) => {
		void handleAuditMessageDelete(message);
	});

	client.on(Events.MessageUpdate, (oldMessage, newMessage) => {
		void handleAuditMessageUpdate(oldMessage, newMessage);
	});

	client.on(Events.MessageBulkDelete, (messages) => {
		void handleAuditMessageBulkDelete(messages);
	});

	logger.success("DISCORD", "Extended Discord event handlers registered");
	if (config.ENABLE_EVENTS_DEBUG.length > 0) {
		registerEventDebugHandlers(client, config.ENABLE_EVENTS_DEBUG);
	}
}
