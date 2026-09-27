import { PermissionFlagsBits } from "discord.js";
import type { Guild, MessageCreateOptions } from "discord.js";

import type { LogDetails } from "./logger.js";
import { logger } from "../services/logger.js";

export interface SendGuildMessageOptions {
	guild: Guild;
	content: string | MessageCreateOptions;
	failureMessage: string;
	details?: LogDetails;
}

export interface SentGuildMessage {
	channelId: string;
	channelName: string;
	messageType: "embed" | "normal";
}

export async function sendGuildMessage({
	guild,
	content,
	failureMessage,
	details,
}: SendGuildMessageOptions): Promise<SentGuildMessage | null> {
	const botMember = await guild.members.fetchMe().catch(() => null);
	const channels = [guild.systemChannel, ...guild.channels.cache.values()];
	const requiresEmbedLinks = typeof content !== "string" && Boolean(content.embeds?.length);
	const messageType = requiresEmbedLinks ? "embed" : "normal";
	const requiredPermissions = [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		...(requiresEmbedLinks ? [PermissionFlagsBits.EmbedLinks] : []),
	];
	for (const channel of channels) {
		if (!channel?.isTextBased()) {
			continue;
		}
		if (botMember && !channel.permissionsFor(botMember)?.has(requiredPermissions)) {
			continue;
		}

		try {
			await channel.send(content);
			return {
				channelId: channel.id,
				channelName: channel.name ?? "unknown",
				messageType,
			};
		} catch (error: unknown) {
			logger.error("DISCORD", failureMessage, {
				...details,
				guildId: guild.id,
				channelId: channel.id,
				error,
			});
		}
	}

	return null;
}
