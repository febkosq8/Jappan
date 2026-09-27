import type { GuildDocument } from "../models/guild.js";
import GuildMemberStateModel, { type GuildMemberStateDocument } from "../models/guildMemberState.js";
import { getGuildSettings } from "./guild.js";
import { getGuildMemberState, getOrCreateGuildMemberState } from "./guildMemberState.js";

export interface WarningSettings {
	readonly guildId: GuildDocument["guildId"];
	readonly guildName: GuildDocument["guildName"];
	readonly warnings: GuildDocument["warnings"];
}

export async function setWarningSettings(
	guildId: string,
	guildName: string,
	timeoutThreshold: number | null,
	timeoutDurationHours: number | null,
	banThreshold: number | null,
	auditChannelId: string | null,
): Promise<WarningSettings> {
	if (timeoutThreshold !== null && banThreshold !== null && banThreshold <= timeoutThreshold) {
		throw new Error("Ban threshold must be greater than the timeout threshold");
	}

	const storedGuildData = await getGuildSettings({ guildId, guildName });
	storedGuildData.warnings.timeoutThreshold = timeoutThreshold;
	storedGuildData.warnings.timeoutDurationHours = timeoutDurationHours;
	storedGuildData.warnings.banThreshold = banThreshold;
	storedGuildData.warnings.auditChannelId = auditChannelId;
	await storedGuildData.save();
	return {
		guildId: storedGuildData.guildId,
		guildName: storedGuildData.guildName,
		warnings: storedGuildData.warnings,
	};
}

export async function getWarningSettings(guildId: string, guildName: string): Promise<WarningSettings> {
	const storedGuildData = await getGuildSettings({ guildId, guildName });
	return {
		guildId: storedGuildData.guildId,
		guildName: storedGuildData.guildName,
		warnings: storedGuildData.warnings,
	};
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
	const storedMemberStateData = await GuildMemberStateModel.findOneAndUpdate(
		{ guildId, userId },
		{
			$set: { username },
			$inc: { "warnings.count": 1 },
			$setOnInsert: { guildId, userId },
		},
		{ returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
	).exec();

	if (!storedMemberStateData) {
		throw new Error("Failed to persist warning");
	}

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
