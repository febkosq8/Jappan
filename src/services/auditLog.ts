import GuildModel, { type GuildDocument } from "../models/guild.js";

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

export async function setAuditLog(
	guildId: string,
	guildName: string,
	enabled: boolean,
	channelId: string | null,
	fullVerbosity: boolean,
): Promise<GuildDocument> {
	const guild = await getGuildSettings(guildId, guildName);
	guild.auditLog.enabled = enabled;
	guild.auditLog.channelId = channelId;
	guild.auditLog.fullVerbosity = enabled && fullVerbosity;
	return guild.save();
}

export async function getAuditLogStatus(guildId: string, guildName: string): Promise<GuildDocument> {
	return getGuildSettings(guildId, guildName);
}
