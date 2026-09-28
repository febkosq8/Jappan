import type { ButtonInteraction, ChatInputCommandInteraction, Message } from "discord.js";
import { EmbedBuilder, MessageFlags, italic } from "discord.js";

import type { Config } from "../../services/config.js";

type PingInteraction = ButtonInteraction | ChatInputCommandInteraction;
type PingSource = PingInteraction | Message;

interface ExecutePingOptions {
	readonly interaction?: PingInteraction;
	readonly message?: Message;
	readonly config: Config;
}

interface PingResult {
	readonly botLatency: string;
	readonly gatewayLatency: string;
}

function isMessage(source: PingSource): source is Message {
	return "author" in source;
}

export function calculatePing({
	interactionCreatedTimestamp,
	replyCreatedTimestamp,
	gatewayPing,
}: {
	interactionCreatedTimestamp: number;
	replyCreatedTimestamp: number;
	gatewayPing: number;
}): { botLatency: string; gatewayLatency: string } {
	return {
		botLatency: `${replyCreatedTimestamp - interactionCreatedTimestamp} ms`,
		gatewayLatency: gatewayPing < 0 ? "Unavailable" : `${gatewayPing} ms`,
	};
}

export function createPingEmbed({
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

export async function executePing({ interaction, message, config }: ExecutePingOptions): Promise<PingResult> {
	const source = interaction ?? message;
	if (!source) {
		throw new Error("Ping requires an interaction or message source");
	}

	let botLatency = "Calculating...";
	let apiLatency = "Calculating...";
	let replyEmbed = createPingEmbed({ config, botLatency, apiLatency });
	if (isMessage(source)) {
		const reply = await source.author.send({ embeds: [replyEmbed] });
		({ botLatency, gatewayLatency: apiLatency } = calculatePing({
			interactionCreatedTimestamp: source.createdTimestamp,
			replyCreatedTimestamp: reply.createdTimestamp,
			gatewayPing: source.client.ws.ping,
		}));
		await reply.edit({ embeds: [createPingEmbed({ config, botLatency, apiLatency })] });
		return { botLatency, gatewayLatency: apiLatency };
	}

	await source.deferReply({ flags: MessageFlags.Ephemeral });
	const reply = await source.editReply({ embeds: [replyEmbed] });
	({ botLatency, gatewayLatency: apiLatency } = calculatePing({
		interactionCreatedTimestamp: source.createdTimestamp,
		replyCreatedTimestamp: reply.createdTimestamp,
		gatewayPing: source.client.ws.ping,
	}));
	replyEmbed = createPingEmbed({ config, botLatency, apiLatency });
	await source.editReply({ embeds: [replyEmbed] });
	return { botLatency, gatewayLatency: apiLatency };
}
