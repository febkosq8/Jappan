import type { GuildDocument } from "../models/guild.js";
import { getGuildSettings } from "./guild.js";

export async function setAuditLog(
	guildId: string,
	guildName: string,
	enabled: boolean,
	channelId: string | null,
	fullVerbosity: boolean,
): Promise<GuildDocument> {
	const storedGuild = await getGuildSettings({ guildId, guildName });
	storedGuild.auditLog.enabled = enabled;
	storedGuild.auditLog.channelId = channelId;
	storedGuild.auditLog.fullVerbosity = enabled && fullVerbosity;
	return storedGuild.save();
}

export async function getAuditLogStatus(guildId: string, guildName: string): Promise<GuildDocument> {
	return getGuildSettings({ guildId, guildName });
}
