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
		"Right-click a message and choose Apps → Create purge job.",
		"Set the scope and limit, then review and confirm the purge from the dashboard.",
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
