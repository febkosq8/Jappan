import type { Guild, GuildMember, Interaction, Message, User, VoiceState } from "discord.js";
import {
	EmbedBuilder,
	PermissionFlagsBits,
	chatInputApplicationCommandMention,
	roleMention,
	underline,
} from "discord.js";

import { formatUserMention } from "../helpers/discord.js";
import { getOrCreateGuildData, isActiveGuild, sendGuildMessage } from "../helpers/guild.js";
import type { GuildDocument } from "../models/guild.js";
import GuildMemberStateModel, { type GuildMemberStateDocument } from "../models/guildMemberState.js";
import { getCommandId } from "./commandLoader.js";
import type { Config } from "./config.js";
import { incrementGuildMemberLevelingPoints } from "./guildMemberState.js";
import { logger } from "./logger.js";

export interface LeaderboardPage {
	readonly entries: GuildMemberStateDocument[];
	readonly page: number;
	readonly pageCount: number;
}

export interface LeaderboardMemberPosition {
	readonly entry: GuildMemberStateDocument;
	readonly rank: number;
}

export interface LeaderboardPreview {
	readonly entries: GuildMemberStateDocument[];
	readonly member: LeaderboardMemberPosition | undefined;
}

export const LEADERBOARD_PAGE_SIZE = 20;

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
	const storedGuildData = await getOrCreateGuildData({ guildId, guildName });
	storedGuildData.leveling.enabled = enabled;
	storedGuildData.leveling.threshold = enabled ? threshold : null;
	storedGuildData.leveling.roleId = enabled ? roleId : null;
	return storedGuildData.save();
}

export async function getLevelingStatus(guild: Guild): Promise<LevelingStatus> {
	const storedGuildData = await getOrCreateGuildData({ guild });
	return {
		guildId: storedGuildData.guildId,
		guildName: storedGuildData.guildName,
		leveling: storedGuildData.leveling,
	};
}

async function getEnabledLevelingSettings(guild: Guild): Promise<GuildDocument | null> {
	if (!isActiveGuild(guild)) return null;
	const storedGuildData = await getOrCreateGuildData({ guild });
	return isActiveGuild(guild) && storedGuildData.leveling.enabled ? storedGuildData : null;
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
		await awardLevelingPoints({
			guild: interaction.guild,
			user: interaction.user,
			member,
			points,
			storedGuildData,
		});
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to award leveling points for interaction", {
			guildId: interaction.guild.id,
			userId: interaction.user.id,
			error,
		});
	}
}

const voiceJoinTimes = new Map<string, number>();
const levelingRewardOperations = new Map<string, Promise<void>>();

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

interface AwardLevelingRewardOptions {
	guild: Guild;
	user: User;
	member: GuildMember;
	points: number;
	previousPoints: number;
	threshold: number;
	roleId: string;
	notificationChannel?: Message["channel"] | undefined;
}

async function awardLevelingPoints({
	guild,
	user,
	member,
	points,
	notificationChannel,
	storedGuildData,
}: AwardLevelingPointsOptions): Promise<void> {
	if (!isActiveGuild(guild)) return;
	const resolvedGuildData = storedGuildData ?? (await getOrCreateGuildData({ guild }));
	if (!isActiveGuild(guild) || !resolvedGuildData.leveling.enabled) {
		return;
	}

	const { state: storedMemberStateData, previousPoints } = await incrementGuildMemberLevelingPoints({
		guildId: guild.id,
		userId: user.id,
		username: user.username,
		points,
	});

	const { roleId, threshold } = resolvedGuildData.leveling;
	if (!roleId || !threshold || storedMemberStateData.leveling.points < threshold || !member) {
		return;
	}

	const rewardKey = `${guild.id}:${user.id}`;
	const previousOperation = levelingRewardOperations.get(rewardKey) ?? Promise.resolve();
	const currentOperation = previousOperation.then(() =>
		awardLevelingReward({
			guild,
			user,
			member,
			points: storedMemberStateData.leveling.points,
			previousPoints,
			threshold,
			roleId,
			notificationChannel,
		}),
	);
	levelingRewardOperations.set(rewardKey, currentOperation);

	try {
		await currentOperation;
	} finally {
		if (levelingRewardOperations.get(rewardKey) === currentOperation) {
			levelingRewardOperations.delete(rewardKey);
		}
	}
}

async function awardLevelingReward({
	guild,
	user,
	member,
	previousPoints,
	threshold,
	roleId,
	notificationChannel,
}: AwardLevelingRewardOptions): Promise<void> {
	if (!isActiveGuild(guild)) return;
	const rewardRole = await guild.roles.fetch(roleId);
	if (!isActiveGuild(guild)) return;
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
	if (!isActiveGuild(guild)) return;
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
			reason: `the bot lacks the guild-level ${underline("Manage Roles")} permission`,
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
	if (notificationChannel?.isSendable()) {
		await notificationChannel.send({
			content: `${formatUserMention(user)} reached ${threshold} leveling points and earned ${rewardRole}.`,
			allowedMentions: { parse: [] },
		});
	}
}

interface DisableLevelingRewardOptions {
	guild: Guild;
	roleId: string;
	reason: string;
}

async function disableLevelingReward({ guild, roleId, reason }: DisableLevelingRewardOptions): Promise<void> {
	try {
		if (!isActiveGuild(guild)) return;
		const storedGuildData = await getOrCreateGuildData({ guild });
		if (!isActiveGuild(guild) || storedGuildData.leveling.roleId !== roleId) {
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
		const commandMention = commandId
			? chatInputApplicationCommandMention("level", "on", commandId)
			: "the command menu";
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
	query?: string;
	fieldFilters?: Readonly<Record<string, string>>;
	clampPage?: boolean;
}

export async function getLeaderboard({
	guildId,
	page,
	pageSize = LEADERBOARD_PAGE_SIZE,
	query,
	fieldFilters = {},
	clampPage = true,
}: GetLeaderboardOptions): Promise<{
	entries: GuildMemberStateDocument[];
	page: number;
	pageCount: number;
	total: number;
}> {
	const escapedQuery = query?.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	const filters = Object.entries(fieldFilters);
	const fieldFilterConditions = filters.map(([field, value]) => {
		const escapedValue = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		switch (field) {
			case "userId":
				return { userId: { $regex: escapedValue, $options: "i" } };
			case "username":
				return { username: { $regex: escapedValue, $options: "i" } };
			case "points":
				return {
					$expr: {
						$regexMatch: {
							input: { $toString: "$leveling.points" },
							regex: escapedValue,
							options: "i",
						},
					},
				};
			default:
				throw new Error(`Unsupported leaderboard filter field: ${field}`);
		}
	});
	const filter = {
		guildId,
		...(filters.length > 0
			? { $and: fieldFilterConditions }
			: escapedQuery
				? {
						$or: [
							{ userId: { $regex: escapedQuery, $options: "i" } },
							{ username: { $regex: escapedQuery, $options: "i" } },
							{
								$expr: {
									$regexMatch: {
										input: { $toString: "$leveling.points" },
										regex: escapedQuery,
										options: "i",
									},
								},
							},
						],
					}
				: {}),
	};
	const total = await GuildMemberStateModel.countDocuments(filter).exec();
	const pageCount = pageSize === 0 ? Number(total > 0) : Math.max(1, Math.ceil(total / pageSize));
	const currentPage = pageSize === 0 ? 1 : clampPage ? Math.min(Math.max(page, 1), pageCount) : page;
	if (pageSize > 0 && !clampPage && currentPage > pageCount) {
		return { entries: [], page: currentPage, pageCount, total };
	}
	const entriesQuery = GuildMemberStateModel.find(filter)
		.sort({ "leveling.points": -1, userId: 1 })
		.select({ userId: 1, username: 1, "leveling.points": 1 });
	if (pageSize > 0) {
		entriesQuery.skip((currentPage - 1) * pageSize).limit(pageSize);
	}
	const entries = await entriesQuery.exec();

	return { entries, page: currentPage, pageCount, total };
}

interface GetLeaderboardPreviewOptions {
	guildId: string;
	userId: string;
}

export async function getLeaderboardPreview({
	guildId,
	userId,
}: GetLeaderboardPreviewOptions): Promise<LeaderboardPreview> {
	const [entries, member] = await Promise.all([
		GuildMemberStateModel.find({ guildId })
			.sort({ "leveling.points": -1, userId: 1 })
			.limit(3)
			.select({ userId: 1, username: 1, "leveling.points": 1 })
			.exec(),
		GuildMemberStateModel.findOne({ guildId, userId })
			.select({ userId: 1, username: 1, "leveling.points": 1 })
			.exec(),
	]);

	if (!member) {
		return { entries, member: undefined };
	}

	const membersAhead = await GuildMemberStateModel.countDocuments({
		guildId,
		$or: [
			{ "leveling.points": { $gt: member.leveling.points } },
			{ "leveling.points": member.leveling.points, userId: { $lt: userId } },
		],
	}).exec();

	return { entries, member: { entry: member, rank: membersAhead + 1 } };
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
						`${(leaderboard.page - 1) * LEADERBOARD_PAGE_SIZE + index + 1}. <@${entry.userId}> - ${entry.leveling.points} points`,
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

interface CreateLeaderboardPreviewEmbedOptions {
	guildName: string;
	config: Config;
	leaderboard: LeaderboardPreview;
}

export function createLeaderboardPreviewEmbed({
	guildName,
	config,
	leaderboard,
}: CreateLeaderboardPreviewEmbedOptions): EmbedBuilder {
	const entries = leaderboard.entries.map(
		(entry, index) => `${index + 1}. <@${entry.userId}> - ${entry.leveling.points} points`,
	);
	if (leaderboard.member && !leaderboard.entries.some((entry) => entry.userId === leaderboard.member?.entry.userId)) {
		entries.push("...");
		entries.push(
			`${leaderboard.member.rank}. <@${leaderboard.member.entry.userId}> - ${leaderboard.member.entry.leveling.points} points`,
		);
	}

	return new EmbedBuilder()
		.setColor("Orange")
		.setAuthor({ name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setTitle(`Leaderboard: ${guildName}`)
		.setDescription("Members ranked by activity points.")
		.addFields({ name: "Member Stats", value: entries.length ? entries.join("\n") : "No member stats were found." })
		.setTimestamp();
}
