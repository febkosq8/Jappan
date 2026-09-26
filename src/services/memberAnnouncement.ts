import GuildModel, { type GuildDocument } from "../models/guild.js";

export type MemberAnnouncementEvent = "in" | "out" | "both";

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
