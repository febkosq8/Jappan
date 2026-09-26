import type { Guild as DiscordGuild } from "discord.js";

import GuildModel, { type GuildDocument } from "../models/guild.js";

export interface GuildSettingsOptions {
	guildId?: string;
	guildName?: string;
	guild?: DiscordGuild;
}

export async function getGuildSettings({ guildId, guildName, guild }: GuildSettingsOptions): Promise<GuildDocument> {
	const resolvedGuildId = guild?.id ?? guildId;
	const resolvedGuildName = guild?.name ?? guildName;
	if (!resolvedGuildId || !resolvedGuildName) {
		throw new Error("Guild ID and guild name are required when guild is not provided");
	}

	let storedGuildData = await GuildModel.findOne({ guildId: resolvedGuildId }).exec();
	if (!storedGuildData) {
		storedGuildData = await GuildModel.create({ guildId: resolvedGuildId, guildName: resolvedGuildName });
	}

	if (storedGuildData.guildName !== resolvedGuildName) {
		storedGuildData.guildName = resolvedGuildName;
		await storedGuildData.save();
	}

	return storedGuildData;
}
