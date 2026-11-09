import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

import type { Config } from "../services/config.js";

export function createHelpMessage(config: Config) {
	const commandsUrl = new URL("/commands", config.BOT_WEBSITE).href;
	const embed = new EmbedBuilder()
		.setColor("Blue")
		.setTitle("Command guide")
		.setAuthor({ name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setDescription("Browse all commands and their permissions.")
		.setTimestamp();
	const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setLabel("Browse commands").setURL(commandsUrl).setStyle(ButtonStyle.Link),
	);
	return { embeds: [embed], components: [buttons] };
}
