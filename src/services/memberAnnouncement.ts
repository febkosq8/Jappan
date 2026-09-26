import { channelMention } from "discord.js";

import GuildModel, { type GuildDocument } from "../models/guild.js";

export type MemberAnnouncementEvent = "in" | "out";

async function getGuildSettings(guildId: string, guildName: string): Promise<GuildDocument> {
	let guild = await GuildModel.findOne().where("guildId", guildId).exec();
	if (!guild) {
		guild = await GuildModel.create({ guildId, guildName });
	}

	if (guild.guildName !== guildName) {
		guild.guildName = guildName;
		await guild.save();
	}

	return guild;
}

export async function setMemberAnnouncement(
	guildId: string,
	guildName: string,
	event: MemberAnnouncementEvent,
	enabled: boolean,
	channelId?: string,
): Promise<GuildDocument> {
	const guild = await getGuildSettings(guildId, guildName);
	if (event === "in") {
		guild.memberAnnouncements.joinEnabled = enabled;
		guild.memberAnnouncements.joinChannelId = enabled ? (channelId ?? null) : null;
	} else {
		guild.memberAnnouncements.leaveEnabled = enabled;
		guild.memberAnnouncements.leaveChannelId = enabled ? (channelId ?? null) : null;
	}

	return guild.save();
}

export async function getMemberAnnouncementStatus(guildId: string, guildName: string): Promise<GuildDocument> {
	return getGuildSettings(guildId, guildName);
}

export function getAnnouncementChannelMention(channelId: string | null): string | null {
	return channelId ? channelMention(channelId) : null;
}
