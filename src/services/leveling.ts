import { EmbedBuilder, userMention } from "discord.js";

import type { GuildDocument } from "../models/guild.js";
import GuildMemberStateModel, { type GuildMemberStateDocument } from "../models/guildMemberState.js";
import type { Config } from "./config.js";
import { getGuildSettings } from "./guild.js";

export interface LeaderboardPage {
	readonly entries: GuildMemberStateDocument[];
	readonly page: number;
	readonly pageCount: number;
}

export interface LevelingStatus {
	readonly guildId: GuildDocument["guildId"];
	readonly guildName: GuildDocument["guildName"];
	readonly leveling: GuildDocument["leveling"];
}

export async function setLeveling(
	guildId: string,
	guildName: string,
	enabled: boolean,
	threshold: number | null,
	roleId: string | null,
): Promise<GuildDocument> {
	const guild = await getGuildSettings(guildId, guildName);
	guild.leveling.enabled = enabled;
	guild.leveling.threshold = enabled ? threshold : null;
	guild.leveling.roleId = enabled ? roleId : null;
	return guild.save();
}

export async function getLevelingStatus(guildId: string, guildName: string): Promise<LevelingStatus> {
	const guild = await getGuildSettings(guildId, guildName);
	return { guildId: guild.guildId, guildName: guild.guildName, leveling: guild.leveling };
}

export async function getLeaderboard(
	guildId: string,
	page: number,
	pageSize = 20,
): Promise<{
	entries: GuildMemberStateDocument[];
	page: number;
	pageCount: number;
}> {
	const total = await GuildMemberStateModel.countDocuments().where("guildId", guildId).exec();
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const currentPage = Math.min(Math.max(page, 1), pageCount);
	const entries = await GuildMemberStateModel.find()
		.where("guildId", guildId)
		.sort({ "leveling.points": -1, userId: 1 })
		.skip((currentPage - 1) * pageSize)
		.limit(pageSize)
		.exec();

	return { entries, page: currentPage, pageCount };
}

export function createLeaderboardEmbed(guildName: string, config: Config, leaderboard: LeaderboardPage): EmbedBuilder {
	const value = leaderboard.entries.length
		? leaderboard.entries
				.map(
					(entry, index) =>
						`${(leaderboard.page - 1) * 20 + index + 1}. ${userMention(entry.userId)} - ${entry.leveling.points} points`,
				)
				.join("\n")
		: "No member stats were found.";

	return new EmbedBuilder()
		.setColor("Orange")
		.setAuthor({ name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setTitle(`Leaderboard: ${guildName}`)
		.setDescription("Members ranked by activity points.")
		.addFields({ name: "Member Stats", value })
		.setFooter({ text: `Page ${leaderboard.page} of ${leaderboard.pageCount}` })
		.setTimestamp();
}
