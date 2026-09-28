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
import { isDatabaseConnected } from "../services/database.js";

const commandData = {
	name: "about",
	description: "Get to know more about this bot",
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
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply();
		const uptime =
			interaction.client.uptime === null
				? "Unknown"
				: `<t:${Math.floor((Date.now() - interaction.client.uptime) / 1000)}:R>`;
		const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setCustomId("Ping").setLabel("Ping Stats").setStyle(ButtonStyle.Primary),
			new ButtonBuilder().setCustomId("Help").setLabel("Help Docs").setStyle(ButtonStyle.Primary),
			new ButtonBuilder()
				.setLabel("Status Updates")
				.setURL("https://discord.gg/3mRbVCjvmz")
				.setStyle(ButtonStyle.Link),
			new ButtonBuilder().setLabel("Website").setURL(config.BOT_WEBSITE).setStyle(ButtonStyle.Link),
		);
		const embed = new EmbedBuilder()
			.setColor("Blue")
			.setTitle(`Find help regarding ${config.BOT_NAME} here`)
			.setAuthor({ name: `${config.BOT_NAME} : About`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
			.setDescription("I am a simple Discord bot made to make someone's life easier.")
			.addFields(
				{ name: "Features", value: "Application (/) commands, moderation tools, and utility commands" },
				{
					name: "Status",
					value: `Server active since ${uptime}\nDatabase: ${isDatabaseConnected() ? "Connected" : "Unavailable"}`,
				},
				{ name: "Know More", value: "Interact below" },
			)
			.setTimestamp();
		await interaction.editReply({ embeds: [embed], components: [buttons] });
	},
};

export default command;
