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

	let storedGuild = await GuildModel.findOne({ guildId: resolvedGuildId }).exec();
	if (!storedGuild) {
		storedGuild = await GuildModel.create({ guildId: resolvedGuildId, guildName: resolvedGuildName });
	}

	if (storedGuild.guildName !== resolvedGuildName) {
		storedGuild.guildName = resolvedGuildName;
		await storedGuild.save();
	}

	return storedGuild;
}
