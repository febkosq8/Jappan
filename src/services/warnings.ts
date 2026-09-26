import type { GuildDocument } from "../models/guild.js";
import type { GuildMemberStateDocument } from "../models/guildMemberState.js";
import { getGuildSettings } from "./guild.js";
import { getGuildMemberState, getOrCreateGuildMemberState } from "./guildMemberState.js";

export async function setWarningSettings(
	guildId: string,
	guildName: string,
	timeoutThreshold: number | null,
	timeoutDurationHours: number | null,
	banThreshold: number | null,
	auditChannelId: string | null,
): Promise<GuildDocument> {
	const storedGuildData = await getGuildSettings({ guildId, guildName });
	storedGuildData.warnings.timeoutThreshold = timeoutThreshold;
	storedGuildData.warnings.timeoutDurationHours = timeoutDurationHours;
	storedGuildData.warnings.banThreshold = banThreshold;
	storedGuildData.warnings.auditChannelId = auditChannelId;
	return storedGuildData.save();
}

export async function getWarningSettings(guildId: string, guildName: string): Promise<GuildDocument> {
	return getGuildSettings({ guildId, guildName });
}

export async function getWarningCount(guildId: string, userId: string): Promise<number> {
	const storedMemberStateData = await getGuildMemberState(guildId, userId);
	return storedMemberStateData?.warnings.count ?? 0;
}

export async function issueWarning(
	guildId: string,
	userId: string,
	username: string,
): Promise<GuildMemberStateDocument> {
	const storedMemberStateData = await getOrCreateGuildMemberState(guildId, userId, username);
	storedMemberStateData.warnings.count += 1;
	await storedMemberStateData.save();
	return storedMemberStateData;
}

export async function overrideWarningCount(
	guildId: string,
	userId: string,
	username: string,
	count: number,
): Promise<GuildMemberStateDocument> {
	const storedMemberStateData = await getOrCreateGuildMemberState(guildId, userId, username);
	storedMemberStateData.warnings.count = count;
	await storedMemberStateData.save();
	return storedMemberStateData;
}
