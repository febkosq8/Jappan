import type { ButtonInteraction, ChatInputCommandInteraction } from "discord.js";
import { EmbedBuilder, MessageFlags, italic } from "discord.js";

import type { Config } from "../../services/config.js";

type PingInteraction = ButtonInteraction | ChatInputCommandInteraction;

function createPingEmbed({
	config,
	botLatency,
	apiLatency,
}: {
	config: Config;
	botLatency: string;
	apiLatency: string;
}): EmbedBuilder {
	return new EmbedBuilder()
		.setColor("Blue")
		.setAuthor({
			name: `${config.BOT_NAME} : Ping`,
			iconURL: config.BOT_PFP,
			url: config.BOT_WEBSITE,
		})
		.addFields(
			{
				name: ":robot: Bot Latency",
				value: `${italic("Time from your command to the bot's reply.")}\n${botLatency}`,
			},
			{
				name: ":satellite: Gateway Latency",
				value: `${italic("Time for the bot's connection to reach Discord and return.")}\n${apiLatency}`,
			},
		)
		.setTimestamp();
}

export async function executePing({
	interaction,
	config,
}: {
	interaction: PingInteraction;
	config: Config;
}): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	let botLatency = "Calculating...";
	let apiLatency = "Calculating...";
	let replyEmbed = createPingEmbed({ config, botLatency, apiLatency });
	const message = await interaction.editReply({ embeds: [replyEmbed] });
	botLatency = `${message.createdTimestamp - interaction.createdTimestamp} ms`;
	apiLatency = interaction.client.ws.ping < 0 ? "Unavailable" : `${interaction.client.ws.ping} ms`;
	replyEmbed = createPingEmbed({ config, botLatency, apiLatency });
	await interaction.editReply({ embeds: [replyEmbed] });
}
