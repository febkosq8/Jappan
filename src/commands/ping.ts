import { EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";

import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { getConfig } from "../services/config.js";
import type { Config } from "../services/config.js";

const commandData = {
	name: "ping",
	description: "Get latency information about the bot",
	isDBDependant: false,
} satisfies BotCommandData;

const config = getConfig();

function createPingEmbed(config: Config, botLatency: string, apiLatency: string): EmbedBuilder {
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
				value: botLatency,
			},
			{
				name: ":satellite: Gateway Latency",
				value: apiLatency,
			},
		);
}

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(`${config.BOT_NAME} : ${commandData.description}`)
		.setContexts([InteractionContextType.Guild, InteractionContextType.BotDM, InteractionContextType.PrivateChannel]),
	execute: async (interaction) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		let botLatency = "Calculating...";
		let apiLatency = "Calculating...";
		let replyEmbed = createPingEmbed(config, botLatency, apiLatency);
		const message = await interaction.editReply({ embeds: [replyEmbed] });
		botLatency = `${message.createdTimestamp - interaction.createdTimestamp} ms`;
		const apiPing = interaction.client.ws.ping;
		apiLatency = apiPing < 0 ? "Unavailable" : `${apiPing} ms`;
		replyEmbed = createPingEmbed(config, botLatency, apiLatency);
		await interaction.editReply({
			embeds: [replyEmbed],
		});
	},
};

export default command;
