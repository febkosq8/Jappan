import { PermissionFlagsBits } from "discord.js";
import type { Guild } from "discord.js";

import type { LogDetails } from "./logger.js";
import { logger } from "../services/logger.js";

export interface SendGuildMessageOptions {
	guild: Guild;
	content: string;
	failureMessage: string;
	details?: LogDetails;
}

export async function sendGuildMessage({
	guild,
	content,
	failureMessage,
	details,
}: SendGuildMessageOptions): Promise<boolean> {
	const botMember = await guild.members.fetchMe().catch(() => null);
	const channels = [guild.systemChannel, ...guild.channels.cache.values()];
	for (const channel of channels) {
		if (
			!channel?.isTextBased() ||
			(botMember &&
				!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]))
		) {
			continue;
		}

		try {
			await channel.send(content);
			return true;
		} catch (error: unknown) {
			logger.error("DISCORD", failureMessage, {
				...details,
				guildId: guild.id,
				channelId: channel.id,
				error,
			});
		}
	}

	return false;
}
