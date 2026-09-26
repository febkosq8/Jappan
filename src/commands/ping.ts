import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import { executePing } from "../helpers/shared/ping.js";
import type { BotCommand, BotCommandData } from "../services/commandLoader.js";

const commandData = {
	name: "ping",
	description: "Get latency information about the bot",
	category: "general",
	isDBDependant: false,
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
		.setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
	execute: executePing,
};

export default command;
