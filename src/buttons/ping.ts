import { EmbedBuilder, MessageFlags } from "discord.js";
import type { ButtonInteraction } from "discord.js";

import type { Config } from "../services/config.js";

export async function handlePing({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	const loadingEmbed = new EmbedBuilder()
		.setColor("Blue")
		.setAuthor({ name: `${config.BOT_NAME} : Ping`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.addFields(
			{ name: ":robot: Bot Latency", value: "Calculating..." },
			{ name: ":satellite: Gateway Latency", value: "Calculating..." },
		);
	const message = await interaction.editReply({ embeds: [loadingEmbed] });
	const botLatency = `${message.createdTimestamp - interaction.createdTimestamp} ms`;
	const apiLatency = interaction.client.ws.ping < 0 ? "Unavailable" : `${interaction.client.ws.ping} ms`;
	const embed = new EmbedBuilder()
		.setColor("Blue")
		.setAuthor({ name: `${config.BOT_NAME} : Ping`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.addFields(
			{ name: ":robot: Bot Latency", value: botLatency },
			{ name: ":satellite: Gateway Latency", value: apiLatency },
		);
	await interaction.editReply({ embeds: [embed] });
}
