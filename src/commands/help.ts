import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	InteractionContextType,
	SlashCommandBuilder,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { getConfig } from "../services/config.js";

const commandData = {
	name: "help",
	description: "List all available commands",
} satisfies BotCommandData;

const config = getConfig();

const command: BotCommand = {
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(`${config.BOT_NAME} : ${commandData.description}`)
		.setContexts([InteractionContextType.Guild]),
	execute: async (interaction) => {
		await interaction.deferReply();
		const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("GeneralHelp").setLabel("General Commands").setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId("MusicHelp").setLabel("Music Commands").setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId("LevelHelp").setLabel("Level Commands").setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId("FunHelp").setLabel("Fun Commands").setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId("ModHelp").setLabel("Moderator Commands").setStyle(ButtonStyle.Primary),
		);
		const embed = new EmbedBuilder()
			.setColor("Blue")
			.setTitle(`Find help regarding ${config.BOT_NAME} here`)
			.setAuthor({ name: `${config.BOT_NAME} : Docs`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
			.setDescription("Select a topic below to proceed.");
		await interaction.editReply({ embeds: [embed], components: [buttons] });
	},
};

export default command;
