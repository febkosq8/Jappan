import { Events, InteractionType } from "discord.js";
import type { Interaction } from "discord.js";

import { getClient } from "../bot.js";
import { getCommands, getGlobalCommands, setRegisteredCommandIds } from "../services/commandLoader.js";
import { getConfig } from "../services/config.js";
import { initializeGuild } from "../services/guild.js";
import { logger } from "../services/logger.js";
import { handleAutocompleteInteraction } from "./autocomplete.js";
import { handleButtonInteraction } from "./button.js";
import { handleSlashCommandInteraction } from "./slashCommand.js";
import { handleMemberJoinAnnouncement, handleMemberLeaveAnnouncement } from "../services/memberAnnouncement.js";
import { handleLevelingInteraction, handleLevelingMessage, handleLevelingVoiceState } from "../services/leveling.js";
import { handleVoiceRegionState } from "../services/voiceRegion.js";
import { handleAdminDeploymentMessage } from "../services/adminDeployment.js";
import {
	handleAuditMemberAdd,
	handleAuditMemberBanAdd,
	handleAuditMemberBanRemove,
	handleAuditMemberRemove,
	handleAuditMemberUpdate,
	handleAuditChannelCreate,
	handleAuditChannelDelete,
	handleAuditChannelUpdate,
	handleAuditRoleCreate,
	handleAuditRoleDelete,
	handleAuditRoleUpdate,
	handleAuditThreadCreate,
	handleAuditThreadDelete,
	handleAuditThreadUpdate,
	handleAuditInviteCreate,
	handleAuditInviteDelete,
	handleAuditLogEntryCreate,
	handleAuditMessageBulkDelete,
	handleAuditMessageDelete,
	handleAuditMessageUpdate,
	handleAuditUserUpdate,
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
			const globalCommands = getGlobalCommands();
			logger.info("SLASH_COMMANDS", `Starting to update #${globalCommands.size} global Application (/) commands`);
			const registeredCommands = await readyClient.application.commands.set(
				globalCommands.map((command) => command.data.toJSON()),
			);
			setRegisteredCommandIds(registeredCommands);
			logger.success("SLASH_COMMANDS", `#${globalCommands.size} global Application (/) commands updated`);
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
	const debugEvents = {
		GuildMemberAdd: { event: Events.GuildMemberAdd, argumentNames: ["member"] },
		GuildMemberRemove: { event: Events.GuildMemberRemove, argumentNames: ["member"] },
		MessageCreate: { event: Events.MessageCreate, argumentNames: ["message"] },
		InteractionCreate: { event: Events.InteractionCreate, argumentNames: ["interaction"] },
		VoiceStateUpdate: { event: Events.VoiceStateUpdate, argumentNames: ["oldState", "newState"] },
		MessageDelete: { event: Events.MessageDelete, argumentNames: ["message"] },
		MessageBulkDelete: { event: Events.MessageBulkDelete, argumentNames: ["messages"] },
		MessageUpdate: { event: Events.MessageUpdate, argumentNames: ["oldMessage", "newMessage"] },
		InviteCreate: { event: Events.InviteCreate, argumentNames: ["invite"] },
		InviteDelete: { event: Events.InviteDelete, argumentNames: ["invite"] },
		GuildAuditLogEntryCreate: { event: Events.GuildAuditLogEntryCreate, argumentNames: ["auditEntry", "guild"] },
		UserUpdate: { event: Events.UserUpdate, argumentNames: ["oldUser", "newUser"] },
		GuildMemberUpdate: { event: Events.GuildMemberUpdate, argumentNames: ["oldMember", "newMember"] },
		GuildBanAdd: { event: Events.GuildBanAdd, argumentNames: ["ban"] },
		GuildBanRemove: { event: Events.GuildBanRemove, argumentNames: ["ban"] },
		ChannelCreate: { event: Events.ChannelCreate, argumentNames: ["channel"] },
		ChannelUpdate: { event: Events.ChannelUpdate, argumentNames: ["oldChannel", "newChannel"] },
		ChannelDelete: { event: Events.ChannelDelete, argumentNames: ["channel"] },
		GuildRoleCreate: { event: Events.GuildRoleCreate, argumentNames: ["role"] },
		GuildRoleUpdate: { event: Events.GuildRoleUpdate, argumentNames: ["oldRole", "newRole"] },
		GuildRoleDelete: { event: Events.GuildRoleDelete, argumentNames: ["role"] },
		ThreadCreate: { event: Events.ThreadCreate, argumentNames: ["thread"] },
		ThreadUpdate: { event: Events.ThreadUpdate, argumentNames: ["oldThread", "newThread"] },
		ThreadDelete: { event: Events.ThreadDelete, argumentNames: ["thread"] },
	};
	for (const [eventName, debugEvent] of Object.entries(debugEvents)) {
		if (!enabledEvents.includes(eventName)) {
			continue;
		}
		logger.success("DISCORD", "Debug Discord event handlers registered", { eventName });
		client.on(debugEvent.event as string, (...args: unknown[]) => {
			const namedArgs = Object.fromEntries(
				args.map((argument, index) => [debugEvent.argumentNames[index] ?? `arg${index + 1}`, argument]),
			);
			logger.debug("DISCORD", `Events.${eventName}`, namedArgs);
		});
	}
}

export function registerExtendedDiscordHandlers(): void {
	const client = getClient();
	const config = getConfig();

	client.on(Events.GuildCreate, (guild) => {
		void initializeGuild(guild);
	});

	client.on(Events.GuildMemberAdd, (member) => {
		void handleMemberJoinAnnouncement(member);
		void handleAuditMemberAdd(member);
	});

	client.on(Events.GuildMemberRemove, (member) => {
		void handleMemberLeaveAnnouncement(member);
		void handleAuditMemberRemove(member);
	});

	client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
		void handleAuditMemberUpdate(oldMember, newMember);
	});

	client.on(Events.ChannelCreate, (channel) => {
		if (channel.isDMBased() || channel.isThread()) {
			return;
		}
		void handleAuditChannelCreate(channel);
	});

	client.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
		if (oldChannel.isDMBased() || newChannel.isDMBased() || oldChannel.isThread() || newChannel.isThread()) {
			return;
		}
		void handleAuditChannelUpdate(oldChannel, newChannel);
	});

	client.on(Events.ChannelDelete, (channel) => {
		if (channel.isDMBased() || channel.isThread()) {
			return;
		}
		void handleAuditChannelDelete(channel);
	});

	client.on(Events.GuildRoleCreate, (role) => {
		void handleAuditRoleCreate(role);
	});

	client.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
		void handleAuditRoleUpdate(oldRole, newRole);
	});

	client.on(Events.GuildRoleDelete, (role) => {
		void handleAuditRoleDelete(role);
	});

	client.on(Events.ThreadCreate, (thread) => {
		void handleAuditThreadCreate(thread);
	});

	client.on(Events.ThreadUpdate, (oldThread, newThread) => {
		void handleAuditThreadUpdate(oldThread, newThread);
	});

	client.on(Events.ThreadDelete, (thread) => {
		void handleAuditThreadDelete(thread);
	});

	client.on(Events.GuildBanAdd, (ban) => {
		void handleAuditMemberBanAdd(ban);
	});

	client.on(Events.GuildBanRemove, (ban) => {
		void handleAuditMemberBanRemove(ban);
	});

	client.on(Events.InviteCreate, (invite) => {
		void handleAuditInviteCreate(invite);
	});

	client.on(Events.InviteDelete, (invite) => {
		void handleAuditInviteDelete(invite);
	});

	client.on(Events.GuildAuditLogEntryCreate, (auditEntry, guild) => {
		void handleAuditLogEntryCreate(auditEntry, guild);
	});

	client.on(Events.MessageCreate, (message) => {
		if (message.content.startsWith("!")) {
			void handleAdminDeploymentMessage(message, config);
			return;
		}
		void handleLevelingMessage(message);
	});

	client.on(Events.InteractionCreate, (interaction) => {
		void handleLevelingInteraction(interaction);
	});

	client.on(Events.VoiceStateUpdate, (oldState, newState) => {
		void handleLevelingVoiceState(oldState, newState);
		void handleVoiceRegionState(oldState, newState);
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

	client.on(Events.UserUpdate, (oldUser, newUser) => {
		void handleAuditUserUpdate(oldUser, newUser);
	});

	logger.success("DISCORD", "Extended Discord event handlers registered");
	if (config.ENABLE_EVENTS_DEBUG.length > 0) {
		registerEventDebugHandlers(client, config.ENABLE_EVENTS_DEBUG);
	}
}
