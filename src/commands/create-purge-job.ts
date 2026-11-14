import {
	ApplicationCommandType,
	ContextMenuCommandBuilder,
	InteractionContextType,
	PermissionFlagsBits,
} from "discord.js";

import type { BotCommandData } from "../helpers/command.js";
import type { BotContextMenuCommand } from "../services/commandLoader.js";
import { showPurgeMessageJobModal } from "./purge-messages.js";

const commandData = {
	name: "Create purge job",
	description: "Create a preview-and-confirm purge job from a selected message.",
	category: "moderator",
	defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.EmbedLinks,
		PermissionFlagsBits.ReadMessageHistory,
		PermissionFlagsBits.ManageMessages,
	],
	usageNotes: [
		"In Discord, right-click a message, choose Apps, then Create purge job.",
		"The form is prefilled with the message author and content; choose a message limit and channel scope.",
		"Preview the purge job and confirm it on its dashboard page before messages are deleted.",
	],
} satisfies BotCommandData;

const command: BotContextMenuCommand = {
	commandData,
	data: new ContextMenuCommandBuilder()
		.setName(commandData.name)
		.setType(ApplicationCommandType.Message)
		.setDefaultMemberPermissions(commandData.defaultMemberPermissions)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction }) => {
		if (!interaction.isMessageContextMenuCommand()) {
			throw new Error("Create purge job requires a message context menu interaction");
		}

		await showPurgeMessageJobModal({ interaction });
	},
};

export default command;
