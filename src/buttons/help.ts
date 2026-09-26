import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";
import type { ButtonInteraction } from "discord.js";

import type { Config } from "../services/config.js";

export async function handleHelp({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
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
	await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed], components: [buttons] });
}
