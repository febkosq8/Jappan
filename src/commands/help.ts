import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { createHelpMessage } from "../helpers/help.js";

const commandData = {
	name: "help",
	description: "List all available commands",
	category: "general",
	isDBDependant: false,
	hasSubCommands: false,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.EmbedLinks,
	],
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply();
		await interaction.editReply(createHelpMessage(config));
	},
};

export default command;
