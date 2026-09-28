import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	InteractionContextType,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { getCommands } from "../services/commandLoader.js";

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
		const helpSections = [
			{ id: "GeneralHelp", label: "General Commands", category: "general" },
			{ id: "MusicHelp", label: "Music Commands", category: "music" },
			{ id: "LevelHelp", label: "Level Commands", category: "level" },
			{ id: "FunHelp", label: "Fun Commands", category: "fun" },
			{ id: "ModHelp", label: "Moderator Commands", category: "moderator" },
		].filter(({ category }) => getCommands().some((command) => command.commandData.category === category));
		const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
			helpSections.map(({ id, label }) =>
				new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Primary),
			),
		);
		const embed = new EmbedBuilder()
			.setColor("Blue")
			.setTitle(`Find help regarding ${config.BOT_NAME} here`)
			.setAuthor({ name: `${config.BOT_NAME} : Docs`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
			.setDescription("Select a topic below to proceed.")
			.setTimestamp();
		await interaction.editReply({ embeds: [embed], components: [buttons] });
	},
};

export default command;
