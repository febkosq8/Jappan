import {
	ApplicationCommandType,
	ContextMenuCommandBuilder,
	InteractionContextType,
	PermissionFlagsBits,
} from "discord.js";

import type { BotContextMenuCommand } from "../services/commandLoader.js";
import { showPurgeMessageJobModal } from "./purge-messages.js";

const command: BotContextMenuCommand = {
	data: new ContextMenuCommandBuilder()
		.setName("Create purge job")
		.setType(ApplicationCommandType.Message)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction }) => {
		if (!interaction.isMessageContextMenuCommand()) {
			throw new Error("Create purge job requires a message context menu interaction");
		}

		await showPurgeMessageJobModal({ interaction });
	},
};

export default command;
