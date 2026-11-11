import mongoose from "mongoose";
import { EmbedBuilder, PermissionFlagsBits, type GuildMember } from "discord.js";

import type { GuildDocument } from "../models/guild.js";
import GuildMemberStateModel, { type GuildMemberStateDocument } from "../models/guildMemberState.js";
import { getOrCreateGuildData } from "../helpers/guild.js";
import { getGuildMemberState } from "./guildMemberState.js";
import { logger } from "./logger.js";

export type WarningThresholdAction =
	"unknown" | "pending" | "none" | "banned" | "timed_out" | "ban_failed" | "timeout_failed";

export interface WarningRecord {
	readonly id: string;
	readonly issuedAt: Date | null;
	readonly reason: string;
	readonly issuerId: string | null;
	readonly thresholdAction: WarningThresholdAction;
}

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
	return storedMemberStateData?.warnings.length ?? 0;
}

export async function getWarningRecords(guildId: string, userId: string): Promise<WarningRecord[]> {
	const storedMemberStateData = await getGuildMemberState(guildId, userId);
	return (
		storedMemberStateData?.warnings.map((record) => ({
			id: record._id.toString(),
			issuedAt: record.issuedAt ?? null,
			reason: record.reason,
			issuerId: record.issuerId ?? null,
			thresholdAction: record.thresholdAction,
		})) ?? []
	);
}

export async function getWarnedMembers(guildId: string) {
	return GuildMemberStateModel.aggregate<{
		userId: string;
		username: string;
		warningCount: number;
	}>([
		{ $match: { guildId } },
		{
			$project: {
				_id: 0,
				userId: 1,
				username: 1,
				warningCount: { $size: { $ifNull: ["$warnings", []] } },
			},
		},
		{ $match: { warningCount: { $gte: 1 } } },
		{ $sort: { warningCount: -1, userId: 1 } },
	]).exec();
}

async function updateWarningThresholdAction({
	guildId,
	userId,
	warningId,
	action,
}: {
	guildId: string;
	userId: string;
	warningId: mongoose.Types.ObjectId;
	action: WarningThresholdAction;
}): Promise<void> {
	const result = await GuildMemberStateModel.updateOne(
		{ guildId, userId, "warnings._id": warningId },
		{ $set: { "warnings.$.thresholdAction": action } },
	).exec();
	if (result.matchedCount !== 1) {
		throw new Error("Failed to persist warning threshold action");
	}
}

export async function removeWarning({
	guildId,
	userId,
	warningId,
}: {
	guildId: string;
	userId: string;
	warningId: string;
}): Promise<boolean> {
	const storedMemberStateData = await GuildMemberStateModel.findOneAndUpdate(
		{
			guildId,
			userId,
			warnings: { $elemMatch: { _id: warningId, thresholdAction: { $ne: "pending" } } },
		},
		{ $pull: { warnings: { _id: warningId } } },
		{ returnDocument: "after" },
	).exec();
	return storedMemberStateData !== null;
}

async function issueWarning({
	guildId,
	userId,
	username,
	issuerId,
	reason,
}: {
	guildId: string;
	userId: string;
	username: string;
	issuerId: string;
	reason: string;
}): Promise<{ state: GuildMemberStateDocument; warningId: mongoose.Types.ObjectId }> {
	const warningId = new mongoose.Types.ObjectId();
	const storedMemberStateData = await GuildMemberStateModel.findOneAndUpdate(
		{ guildId, userId },
		{
			$set: { username },
			$push: {
				warnings: {
					_id: warningId,
					issuedAt: new Date(),
					reason: reason.slice(0, 500),
					issuerId,
					thresholdAction: "pending",
				},
			},
			$setOnInsert: { guildId, userId },
		},
		{ returnDocument: "after", upsert: true, setDefaultsOnInsert: true },
	).exec();

	if (!storedMemberStateData) {
		throw new Error("Failed to persist warning");
	}

	return { state: storedMemberStateData, warningId };
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
	const { state, warningId } = await issueWarning({
		guildId: guild.id,
		userId: member.id,
		username: member.user.username,
		issuerId,
		reason,
	});
	const warningCount = state.warnings.length;
	const logDetails = {
		guildId: guild.id,
		userId: member.id,
		issuerId,
		warningId: warningId.toString(),
		warningCount,
	};

	const thresholdReason = `Warning threshold reached: ${reason}`.slice(0, 500);
	let action: WarningIssueResult["action"] = "none";
	let attemptedAction: "ban" | "timeout" | null = null;
	let storedGuildData: WarningSettings;

	try {
		storedGuildData = await getWarningSettings(guild.id, guild.name);
		if (storedGuildData.warnings.banThreshold && warningCount >= storedGuildData.warnings.banThreshold) {
			attemptedAction = "ban";
			if (!member.bannable) {
				action = "ban_failed";
			} else {
				await member.ban({ reason: thresholdReason });
				action = "banned";
			}
		} else if (
			storedGuildData.warnings.timeoutThreshold &&
			storedGuildData.warnings.timeoutDurationHours &&
			warningCount >= storedGuildData.warnings.timeoutThreshold
		) {
			attemptedAction = "timeout";
			if (!member.moderatable) {
				action = "timeout_failed";
			} else {
				await member.timeout(storedGuildData.warnings.timeoutDurationHours * 60 * 60 * 1000, thresholdReason);
				action = "timed_out";
			}
		}
	} catch (error: unknown) {
		const failedAction =
			attemptedAction === null ? "unknown" : attemptedAction === "ban" ? "ban_failed" : "timeout_failed";
		logger.error("DISCORD", "Warning threshold action failed", {
			...logDetails,
			action: failedAction,
			error,
		});
		await updateWarningThresholdAction({
			guildId: guild.id,
			userId: member.id,
			warningId,
			action: failedAction,
		});
		throw error;
	}

	if (action === "ban_failed" || action === "timeout_failed") {
		const botMember = guild.members.me;
		logger.warn("DISCORD", "Warning threshold action blocked by permissions or role hierarchy", {
			...logDetails,
			action,
			isGuildOwner: member.id === guild.ownerId,
			isAdministrator: member.permissions.has(PermissionFlagsBits.Administrator),
			manageable: member.manageable,
			botHighestRoleId: botMember?.roles.highest.id,
			memberHighestRoleId: member.roles.highest.id,
			hasRequiredPermission:
				botMember?.permissions.has(
					action === "ban_failed" ? PermissionFlagsBits.BanMembers : PermissionFlagsBits.ModerateMembers,
				) ?? false,
		});
	}

	await updateWarningThresholdAction({ guildId: guild.id, userId: member.id, warningId, action });

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
							{
								name: "Threshold Action",
								value: action
									.replace(/_/gu, " ")
									.replace(/\b\w/gu, (character) => character.toUpperCase()),
							},
						)
						.setTimestamp(),
				],
			});
		}
	}

	return { warningCount, action };
}
