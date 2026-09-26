import type { GuildDocument } from "../models/guild.js";
import GuildMemberStateModel, { type GuildMemberStateDocument } from "../models/guildMemberState.js";
import { getGuildSettings } from "./guild.js";

export async function setWarningSettings(
	guildId: string,
	guildName: string,
	timeoutThreshold: number | null,
	timeoutDurationHours: number | null,
	banThreshold: number | null,
	auditChannelId: string | null,
): Promise<GuildDocument> {
	const guild = await getGuildSettings(guildId, guildName);
	guild.warnings.timeoutThreshold = timeoutThreshold;
	guild.warnings.timeoutDurationHours = timeoutDurationHours;
	guild.warnings.banThreshold = banThreshold;
	guild.warnings.auditChannelId = auditChannelId;
	return guild.save();
}

export async function getWarningSettings(guildId: string, guildName: string): Promise<GuildDocument> {
	return getGuildSettings(guildId, guildName);
}

export async function getWarningCount(guildId: string, userId: string): Promise<number> {
	const state = await GuildMemberStateModel.findOne().where("guildId", guildId).where("userId", userId).exec();
	return state?.warnings.count ?? 0;
}

export async function issueWarning(
	guildId: string,
	userId: string,
	username: string,
): Promise<GuildMemberStateDocument> {
	let state = await GuildMemberStateModel.findOne().where("guildId", guildId).where("userId", userId).exec();
	if (!state) {
		state = await GuildMemberStateModel.create({ guildId, userId, username, warnings: { count: 1 } });
	} else {
		state.username = username;
		state.warnings.count += 1;
		await state.save();
	}
	return state;
}

export async function overrideWarningCount(
	guildId: string,
	userId: string,
	username: string,
	count: number,
): Promise<GuildMemberStateDocument> {
	let state = await GuildMemberStateModel.findOne().where("guildId", guildId).where("userId", userId).exec();
	if (!state) {
		state = await GuildMemberStateModel.create({ guildId, userId, username, warnings: { count } });
	} else {
		state.username = username;
		state.warnings.count = count;
		await state.save();
	}
	return state;
}
