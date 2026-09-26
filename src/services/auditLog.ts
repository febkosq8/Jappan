import type { GuildDocument } from "../models/guild.js";
import { getGuildSettings } from "./guild.js";

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
