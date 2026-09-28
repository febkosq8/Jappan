import type { ButtonInteraction, ChatInputCommandInteraction, Client, Message } from "discord.js";
import { EmbedBuilder, MessageFlags, bold, italic } from "discord.js";

import type { Config } from "../../services/config.js";

type PingInteraction = ButtonInteraction | ChatInputCommandInteraction;
type PingSource = PingInteraction | Message;

interface ExecutePingOptions {
	readonly interaction?: PingInteraction;
	readonly message?: Message;
	readonly config: Config;
}

interface PingResult {
	readonly botLatency: number;
	readonly gatewayLatency: number;
}

type LatencyDisplayValue = number | "Calculating...";

function isMessage(source: PingSource): source is Message {
	return "author" in source;
}

function formatLatencyValue(latency: LatencyDisplayValue): string {
	if (typeof latency === "string") {
		return `🟠 ${bold(latency)}`;
	}

	let indicator = "🟠";
	if (latency > 1000) {
		indicator = "⚠️";
	} else if (latency >= 500) {
		indicator = "🟡";
	} else if (latency >= 0) {
		indicator = "🟢";
	}
	const value = latency < 0 ? "Unavailable" : `${latency} ms`;
	return `${indicator} ${bold(value)}`;
}

export async function calculatePing({
	interactionCreatedTimestamp,
	replyCreatedTimestamp,
	client,
	waitTillReady = false,
}: {
	interactionCreatedTimestamp: number;
	replyCreatedTimestamp: number;
	client: Client;
	waitTillReady: boolean;
}): Promise<{ botLatency: number; gatewayLatency: number }> {
	const botLatency = replyCreatedTimestamp - interactionCreatedTimestamp;
	while (waitTillReady && !client.isReady()) {
		await new Promise((resolve) => setTimeout(resolve, 100));
	}

	return {
		botLatency,
		gatewayLatency: client.ws.ping,
	};
}

export function createPingEmbed({
	config,
	botLatency,
	gatewayLatency,
}: {
	config: Config;
	botLatency: LatencyDisplayValue;
	gatewayLatency: LatencyDisplayValue;
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
				value: `${italic("Time from your command to the bot's reply.")}\n${formatLatencyValue(botLatency)}`,
			},
			{
				name: ":satellite: Gateway Latency",
				value: `${italic("Time for the bot's connection to reach Discord and return.")}\n${formatLatencyValue(gatewayLatency)}`,
			},
		)
		.setTimestamp();
}

export async function executePing({ interaction, message, config }: ExecutePingOptions): Promise<PingResult> {
	const source = interaction ?? message;
	if (!source) {
		throw new Error("Ping requires an interaction or message source");
	}

	let botLatency: LatencyDisplayValue = "Calculating...";
	let gatewayLatency: LatencyDisplayValue = "Calculating...";
	if (isMessage(source)) {
		({ botLatency, gatewayLatency } = await calculatePing({
			interactionCreatedTimestamp: source.createdTimestamp,
			replyCreatedTimestamp: Date.now(),
			client: source.client,
			waitTillReady: true,
		}));
		await source.author.send({ embeds: [createPingEmbed({ config, botLatency, gatewayLatency })] });
		return { botLatency, gatewayLatency };
	}

	let replyEmbed = createPingEmbed({ config, botLatency, gatewayLatency });
	await source.deferReply({ flags: MessageFlags.Ephemeral });
	const reply = await source.editReply({ embeds: [replyEmbed] });
	({ botLatency, gatewayLatency } = await calculatePing({
		interactionCreatedTimestamp: source.createdTimestamp,
		replyCreatedTimestamp: reply.createdTimestamp,
		client: source.client,
		waitTillReady: false,
	}));
	replyEmbed = createPingEmbed({ config, botLatency, gatewayLatency });
	await source.editReply({ embeds: [replyEmbed] });
	return { botLatency, gatewayLatency };
}
