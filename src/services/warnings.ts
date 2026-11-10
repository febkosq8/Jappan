import { EmbedBuilder, type GuildMember } from "discord.js";

import type { GuildDocument } from "../models/guild.js";
import GuildMemberStateModel, { type GuildMemberStateDocument } from "../models/guildMemberState.js";
import { getOrCreateGuildData } from "../helpers/guild.js";
import { getGuildMemberState, getOrCreateGuildMemberState } from "./guildMemberState.js";

export interface WarningSettings {
	readonly guildId: GuildDocument["guildId"];
	readonly guildName: GuildDocument["guildName"];
	readonly warnings: GuildDocument["warnings"];
}

export interface WarningIssueResult {
	readonly warningCount: number;
	readonly action: "none" | "banned" | "timed_out" | "ban_failed" | "timeout_failed";
}

export async function setWarningSettings({
	guildId,
	guildName,
	timeoutThreshold,
	timeoutDurationHours,
	banThreshold,
	auditChannelId,
}: {
	guildId: string;
	guildName: string;
	timeoutThreshold: number | null;
	timeoutDurationHours: number | null;
	banThreshold: number | null;
	auditChannelId: string | null;
}): Promise<WarningSettings> {
	if (timeoutThreshold !== null && banThreshold !== null && banThreshold <= timeoutThreshold) {
		throw new Error("Ban threshold must be greater than the timeout threshold");
	}

	const storedGuildData = await getOrCreateGuildData({ guildId, guildName });
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
	const storedGuildData = await getOrCreateGuildData({ guildId, guildName });
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

export async function getWarnedMembers(guildId: string) {
	return GuildMemberStateModel.find({ guildId, "warnings.count": { $gte: 1 } })
		.select({ _id: 0, userId: 1, username: 1, "warnings.count": 1 })
		.sort({ "warnings.count": -1, userId: 1 })
		.lean()
		.exec();
}

export async function issueWarning({
	guildId,
	userId,
	username,
}: {
	guildId: string;
	userId: string;
	username: string;
}): Promise<GuildMemberStateDocument> {
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

export async function issueWarningForMember({
	guild,
	member,
	issuerId,
	reason,
}: {
	guild: GuildMember["guild"];
	member: GuildMember;
	issuerId: string;
	reason: string;
}): Promise<WarningIssueResult> {
	const storedMemberStateData = await issueWarning({
		guildId: guild.id,
		userId: member.id,
		username: member.user.username,
	});
	const storedGuildData = await getWarningSettings(guild.id, guild.name);
	const warningCount = storedMemberStateData.warnings.count;

	if (storedGuildData.warnings.auditChannelId) {
		const auditChannel = await guild.channels.fetch(storedGuildData.warnings.auditChannelId);
		if (auditChannel?.isTextBased()) {
			await auditChannel.send({
				embeds: [
					new EmbedBuilder()
						.setColor("DarkButNotBlack")
						.setTitle("Warning Issued")
						.setAuthor({ name: "Warning Audit" })
						.addFields(
							{ name: "User", value: `<@${member.id}>`, inline: true },
							{ name: "Total Warnings", value: `${warningCount}`, inline: true },
							{ name: "Reason", value: reason },
							{ name: "Issued By", value: `<@${issuerId}>` },
						)
						.setTimestamp(),
				],
			});
		}
	}

	if (storedGuildData.warnings.banThreshold && warningCount >= storedGuildData.warnings.banThreshold) {
		if (!member.bannable) return { warningCount, action: "ban_failed" };
		await member.ban({ reason: `Warning threshold reached: ${reason}` });
		return { warningCount, action: "banned" };
	}

	if (
		storedGuildData.warnings.timeoutThreshold &&
		storedGuildData.warnings.timeoutDurationHours &&
		warningCount >= storedGuildData.warnings.timeoutThreshold
	) {
		if (!member.moderatable) return { warningCount, action: "timeout_failed" };
		await member.timeout(
			storedGuildData.warnings.timeoutDurationHours * 60 * 60 * 1000,
			`Warning threshold reached: ${reason}`,
		);
		return { warningCount, action: "timed_out" };
	}

	return { warningCount, action: "none" };
}

export async function overrideWarningCount({
	guildId,
	userId,
	username,
	count,
}: {
	guildId: string;
	userId: string;
	username: string;
	count: number;
}): Promise<GuildMemberStateDocument> {
	const storedMemberStateData = await getOrCreateGuildMemberState({ guildId, userId, username });
	storedMemberStateData.warnings.count = count;
	await storedMemberStateData.save();
	return storedMemberStateData;
}
