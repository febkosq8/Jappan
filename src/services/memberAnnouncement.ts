import type { GuildDocument } from "../models/guild.js";
import { getGuildSettings } from "./guild.js";

export type MemberAnnouncementEvent = "in" | "out" | "both";

export async function setMemberAnnouncement(
	guildId: string,
	guildName: string,
	event: MemberAnnouncementEvent,
	enabled: boolean,
	channelId?: string,
): Promise<GuildDocument> {
	const guild = await getGuildSettings(guildId, guildName);
	if (event === "in" || event === "both") {
		guild.memberAnnouncements.joinEnabled = enabled;
		guild.memberAnnouncements.joinChannelId = enabled ? (channelId ?? null) : null;
	}
	if (event === "out" || event === "both") {
		guild.memberAnnouncements.leaveEnabled = enabled;
		guild.memberAnnouncements.leaveChannelId = enabled ? (channelId ?? null) : null;
	}

	return guild.save();
}

export async function getMemberAnnouncementStatus(guildId: string, guildName: string): Promise<GuildDocument> {
	return getGuildSettings(guildId, guildName);
}
