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
	const storedGuild = await getGuildSettings({ guildId, guildName });
	storedGuild.warnings.timeoutThreshold = timeoutThreshold;
	storedGuild.warnings.timeoutDurationHours = timeoutDurationHours;
	storedGuild.warnings.banThreshold = banThreshold;
	storedGuild.warnings.auditChannelId = auditChannelId;
	return storedGuild.save();
}

export async function getWarningSettings(guildId: string, guildName: string): Promise<GuildDocument> {
	return getGuildSettings({ guildId, guildName });
}

export async function getWarningCount(guildId: string, userId: string): Promise<number> {
	const state = await getGuildMemberState(guildId, userId);
	return state?.warnings.count ?? 0;
}

export async function issueWarning(
	guildId: string,
	userId: string,
	username: string,
): Promise<GuildMemberStateDocument> {
	const state = await getOrCreateGuildMemberState(guildId, userId, username);
	state.warnings.count += 1;
	await state.save();
	return state;
}

export async function overrideWarningCount(
	guildId: string,
	userId: string,
	username: string,
	count: number,
): Promise<GuildMemberStateDocument> {
	const state = await getOrCreateGuildMemberState(guildId, userId, username);
	state.warnings.count = count;
	await state.save();
	return state;
}
