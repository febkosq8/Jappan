import {
	EmbedBuilder,
	PermissionFlagsBits,
	chatInputApplicationCommandMention,
	roleMention,
	userMention,
} from "discord.js";
import type { Guild, GuildMember, Interaction, Message, User, VoiceState } from "discord.js";

import type { GuildDocument } from "../models/guild.js";
import GuildMemberStateModel, { type GuildMemberStateDocument } from "../models/guildMemberState.js";
import { sendGuildMessage } from "../helpers/guildHelper.js";
import { getCommandId } from "./commandLoader.js";
import type { Config } from "./config.js";
import { getGuildSettings } from "./guild.js";
import { getOrCreateGuildMemberState } from "./guildMemberState.js";
import { logger } from "./logger.js";

export interface LeaderboardPage {
	readonly entries: GuildMemberStateDocument[];
	readonly page: number;
	readonly pageCount: number;
}

export interface LevelingStatus {
	readonly guildId: GuildDocument["guildId"];
	readonly guildName: GuildDocument["guildName"];
	readonly leveling: GuildDocument["leveling"];
}

interface SetLevelingOptions {
	guildId: string;
	guildName: string;
	enabled: boolean;
	threshold: number | null;
	roleId: string | null;
}

export async function setLeveling({
	guildId,
	guildName,
	enabled,
	threshold,
	roleId,
}: SetLevelingOptions): Promise<GuildDocument> {
	const storedGuildData = await getGuildSettings({ guildId, guildName });
	storedGuildData.leveling.enabled = enabled;
	storedGuildData.leveling.threshold = enabled ? threshold : null;
	storedGuildData.leveling.roleId = enabled ? roleId : null;
	return storedGuildData.save();
}

export async function getLevelingStatus(guild: Guild): Promise<LevelingStatus> {
	const storedGuildData = await getGuildSettings({ guild });
	return { guildId: storedGuildData.guildId, guildName: storedGuildData.guildName, leveling: storedGuildData.leveling };
}

async function getEnabledLevelingSettings(guild: Guild): Promise<GuildDocument | null> {
	const storedGuildData = await getGuildSettings({ guild });
	return storedGuildData.leveling.enabled ? storedGuildData : null;
}

export async function handleLevelingMessage(message: Message): Promise<void> {
	if (!message.guild || message.author.bot) {
		return;
	}

	try {
		const storedGuildData = await getEnabledLevelingSettings(message.guild);
		if (!storedGuildData) {
			return;
		}

		const points = Math.max(1, Math.min(message.content.trim().length, 12));
		await awardLevelingPoints({
			guild: message.guild,
			user: message.author,
			member: message.member,
			points,
			notificationChannel: message.channel,
			storedGuildData,
		});
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to award leveling points for message", {
			message,
			guildId: message.guild.id,
			userId: message.author.id,
			error,
		});
	}
}

export async function handleLevelingInteraction(interaction: Interaction): Promise<void> {
	if (!interaction.guild || interaction.user.bot) {
		return;
	}

	try {
		const storedGuildData = await getEnabledLevelingSettings(interaction.guild);
		if (!storedGuildData) {
			return;
		}

		const activityLength = interaction.isButton()
			? interaction.customId.length
			: interaction.isChatInputCommand()
				? interaction.commandName.length
				: 1;
		const points = Math.max(1, Math.min(activityLength, 12));
		const member = await interaction.guild.members.fetch(interaction.user.id);
		await awardLevelingPoints({ guild: interaction.guild, user: interaction.user, member, points, storedGuildData });
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to award leveling points for interaction", {
			guildId: interaction.guild.id,
			userId: interaction.user.id,
			error,
		});
	}
}

const voiceJoinTimes = new Map<string, number>();

export async function handleLevelingVoiceState(oldState: VoiceState, newState: VoiceState): Promise<void> {
	const guild = newState.guild;
	const member = newState.member ?? oldState.member;
	let points = 0;
	if (member?.user.bot) {
		return;
	}

	try {
		const storedGuildData = await getEnabledLevelingSettings(guild);
		if (!storedGuildData) {
			return;
		}

		const key = `${guild.id}:${newState.id}`;
		if (!oldState.channelId && newState.channelId) {
			voiceJoinTimes.set(key, Date.now());
			return;
		}

		if (!oldState.channelId || oldState.channelId === newState.channelId) {
			return;
		}

		const joinedAt = voiceJoinTimes.get(key) ?? Date.now();
		voiceJoinTimes.delete(key);
		points = Math.max(1, Math.round(((Date.now() - joinedAt) / 60_000) * 0.25));
		const storedMember = member ?? (await guild.members.fetch(newState.id));
		await awardLevelingPoints({ guild, user: storedMember.user, member: storedMember, points, storedGuildData });
		if (newState.channelId) {
			voiceJoinTimes.set(key, Date.now());
		}
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to award leveling points for voice activity", {
			guildId: guild.id,
			userId: newState.id,
			points,
			error,
		});
	}
}

interface AwardLevelingPointsOptions {
	guild: Guild;
	user: User;
	member: GuildMember | null;
	points: number;
	notificationChannel?: Message["channel"];
	storedGuildData?: GuildDocument;
}

async function awardLevelingPoints({
	guild,
	user,
	member,
	points,
	notificationChannel,
	storedGuildData,
}: AwardLevelingPointsOptions): Promise<void> {
	const resolvedGuildData = storedGuildData ?? (await getGuildSettings({ guild }));
	if (!resolvedGuildData.leveling.enabled) {
		return;
	}

	const storedMemberStateData = await getOrCreateGuildMemberState(guild.id, user.id, user.username);
	const previousPoints = storedMemberStateData.leveling.points;
	storedMemberStateData.leveling.points += points;
	await storedMemberStateData.save();

	const { roleId, threshold } = resolvedGuildData.leveling;
	if (!roleId || !threshold || storedMemberStateData.leveling.points < threshold || !member) {
		return;
	}

	const rewardRole = await guild.roles.fetch(roleId);
	if (!rewardRole) {
		await disableLevelingReward({
			guild,
			roleId,
			reason: "the configured role no longer exists",
		});
		return;
	}
	if (member.roles.cache.has(rewardRole.id)) {
		return;
	}

	const botMember = await guild.members.fetchMe();
	if (rewardRole.managed) {
		await disableLevelingReward({
			guild,
			roleId,
			reason: "the configured role is managed by a Discord integration",
		});
		return;
	}
	if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
		await disableLevelingReward({
			guild,
			roleId,
			reason: "the bot lacks the guild-level Manage Roles permission",
		});
		return;
	}
	if (botMember.roles.highest.comparePositionTo(rewardRole) <= 0) {
		await disableLevelingReward({
			guild,
			roleId,
			reason: "the configured role is at or above the bot's highest role",
		});
		return;
	}
	if (!member.manageable) {
		if (member.id !== guild.ownerId) {
			logger.warn("DISCORD", "Skipped leveling reward for an unmanageable member", {
				guildId: guild.id,
				userId: user.id,
				roleId,
			});
		}
		return;
	}

	await member.roles.add(rewardRole, "Leveling reward threshold reached");
	if (previousPoints < threshold && notificationChannel?.isSendable()) {
		await notificationChannel.send(
			`${userMention(user.id)} reached ${threshold} leveling points and earned ${rewardRole}.`,
		);
	}
}

interface DisableLevelingRewardOptions {
	guild: Guild;
	roleId: string;
	reason: string;
}

async function disableLevelingReward({ guild, roleId, reason }: DisableLevelingRewardOptions): Promise<void> {
	try {
		const storedGuildData = await getGuildSettings({ guild });
		if (storedGuildData.leveling.roleId !== roleId) {
			return;
		}

		storedGuildData.leveling.roleId = null;
		storedGuildData.leveling.threshold = null;
		await storedGuildData.save();
		logger.warn("DISCORD", "Leveling reward configuration disabled", {
			guildId: guild.id,
			roleId,
			reason,
		});

		const commandId = getCommandId("level");
		const commandMention = commandId ? chatInputApplicationCommandMention("level", "on", commandId) : "`/level on`";
		const warningEmoji = "⚠️";
		const announcementEmoji = "📢";
		await sendGuildMessage({
			guild,
			content: `${warningEmoji} Leveling reward ${roleMention(roleId)} (role ID: \`${roleId}\`) was automatically disabled because ${reason}.\n${announcementEmoji} PSA for admins: please configure a new reward with ${commandMention}.`,
			failureMessage: "Failed to notify guild about disabled leveling reward",
			details: { roleId },
		});
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to disable unavailable leveling reward", {
			guildId: guild.id,
			roleId,
			error,
		});
	}
}

interface GetLeaderboardOptions {
	guildId: string;
	page: number;
	pageSize?: number;
}

export async function getLeaderboard({ guildId, page, pageSize = 20 }: GetLeaderboardOptions): Promise<{
	entries: GuildMemberStateDocument[];
	page: number;
	pageCount: number;
}> {
	const total = await GuildMemberStateModel.countDocuments({ guildId }).exec();
	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const currentPage = Math.min(Math.max(page, 1), pageCount);
	const entries = await GuildMemberStateModel.find({ guildId })
		.sort({ "leveling.points": -1, userId: 1 })
		.skip((currentPage - 1) * pageSize)
		.limit(pageSize)
		.exec();

	return { entries, page: currentPage, pageCount };
}

interface CreateLeaderboardEmbedOptions {
	guildName: string;
	config: Config;
	leaderboard: LeaderboardPage;
}

export function createLeaderboardEmbed({
	guildName,
	config,
	leaderboard,
}: CreateLeaderboardEmbedOptions): EmbedBuilder {
	const value = leaderboard.entries.length
		? leaderboard.entries
				.map(
					(entry, index) =>
						`${(leaderboard.page - 1) * 20 + index + 1}. ${userMention(entry.userId)} - ${entry.leveling.points} points`,
				)
				.join("\n")
		: "No member stats were found.";

	return new EmbedBuilder()
		.setColor("Orange")
		.setAuthor({ name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setTitle(`Leaderboard: ${guildName}`)
		.setDescription("Members ranked by activity points.")
		.addFields({ name: "Member Stats", value })
		.setFooter({ text: `Page ${leaderboard.page} of ${leaderboard.pageCount}` })
		.setTimestamp();
}
