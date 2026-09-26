import type { GuildDocument } from "../models/guild.js";
import { getGuildSettings } from "./guild.js";

export async function setAuditLog(
	guildId: string,
	guildName: string,
	enabled: boolean,
	channelId: string | null,
	fullVerbosity: boolean,
): Promise<GuildDocument> {
	const storedGuildData = await getGuildSettings({ guildId, guildName });
	storedGuildData.auditLog.enabled = enabled;
	storedGuildData.auditLog.channelId = channelId;
	storedGuildData.auditLog.fullVerbosity = enabled && fullVerbosity;
	return storedGuildData.save();
}

export async function getAuditLogStatus(guildId: string, guildName: string): Promise<GuildDocument> {
	return getGuildSettings({ guildId, guildName });
}
