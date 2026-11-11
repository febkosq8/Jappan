import type { Guild, VoiceChannel, VoiceState } from "discord.js";
import {
	ChannelType,
	DiscordAPIError,
	EmbedBuilder,
	PermissionFlagsBits,
	RESTJSONErrorCodes,
	channelMention,
	chatInputApplicationCommandMention,
	underline,
	userMention,
} from "discord.js";

import { createGuildDashboardLink } from "../helpers/dashboard.js";
import { isActiveGuild, sendGuildMessage } from "../helpers/guild.js";
import { formatVoiceRegion } from "../helpers/voiceRegion.js";
import type { GuildMemberStateDocument } from "../models/guildMemberState.js";
import GuildMemberStateModel from "../models/guildMemberState.js";
import { getCommandId } from "./commandLoader.js";
import { getConfig } from "./config.js";
import { getGuildMemberState, getOrCreateGuildMemberState } from "./guildMemberState.js";
import { logger } from "./logger.js";

export interface VoiceRegionLock {
	readonly userId: string;
	readonly userName: string;
	readonly channelId: string;
	readonly channelName: string;
	readonly region: string;
	readonly fallbackRegion: string | null;
}

export class VoiceRegionLockValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "VoiceRegionLockValidationError";
	}
}

export async function getVoiceRegionIds(guild: Guild): Promise<string[]> {
	const regions = await guild.client.fetchVoiceRegions();
	return Array.from(regions.values(), (region) => region.id);
}

export async function addVoiceRegionLock({
	guild,
	userId,
	userName,
	channelId,
	region,
}: {
	guild: Guild;
	userId: string;
	userName: string;
	channelId: string;
	region: string;
}): Promise<VoiceRegionLock> {
	const regions = await getVoiceRegionIds(guild);
	if (!regions.includes(region)) {
		throw new VoiceRegionLockValidationError(`\`${region}\` is not a valid Discord voice region.`);
	}

	const channel = await guild.channels.fetch(channelId).catch((error: unknown) => {
		if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownChannel) {
			throw new VoiceRegionLockValidationError("The selected channel is no longer a voice channel.");
		}
		throw error;
	});
	if (!channel || channel.type !== ChannelType.GuildVoice) {
		throw new VoiceRegionLockValidationError("The selected channel is no longer a voice channel.");
	}

	const botMember = await guild.members.fetchMe();
	if (!botMember.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
		throw new VoiceRegionLockValidationError(
			`I need \`Manage Channels\` permission in <#${channelId}> to lock its region.`,
		);
	}

	const storedMemberState = await getOrCreateGuildMemberState({ guildId: guild.id, userId, username: userName });
	storedMemberState.voiceRegionLock = { channelId, channelName: channel.name, region, fallbackRegion: null };
	await storedMemberState.save();
	return {
		userId,
		userName,
		channelId,
		channelName: channel.name,
		region,
		fallbackRegion: null,
	};
}

export async function removeVoiceRegionLock(guild: Guild, userId: string): Promise<boolean> {
	const storedMemberState = await getGuildMemberState(guild.id, userId);
	if (!isActiveGuild(guild) || !storedMemberState?.voiceRegionLock) {
		return false;
	}

	storedMemberState.voiceRegionLock = null;
	await storedMemberState.save();
	return true;
}

export async function getVoiceRegionLocks(guild: Guild): Promise<VoiceRegionLock[]> {
	const storedMemberStates = await getVoiceRegionLockStates(guild.id);
	return storedMemberStates.flatMap((state) => {
		if (!state.voiceRegionLock) {
			return [];
		}
		return [
			{
				userId: state.userId,
				userName: state.username,
				channelId: state.voiceRegionLock.channelId,
				channelName: state.voiceRegionLock.channelName,
				region: state.voiceRegionLock.region,
				fallbackRegion: state.voiceRegionLock.fallbackRegion ?? null,
			},
		];
	});
}

async function getVoiceRegionLockStates(guildId: string, channelId?: string): Promise<GuildMemberStateDocument[]> {
	const query = channelId
		? { guildId, "voiceRegionLock.channelId": channelId }
		: { guildId, voiceRegionLock: { $ne: null } };
	return GuildMemberStateModel.find(query).select({ userId: 1, username: 1, voiceRegionLock: 1 }).exec();
}

function hasOtherLockedMemberInChannel({
	channel,
	memberId,
	locks,
}: {
	channel: VoiceChannel;
	memberId: string;
	locks: readonly VoiceRegionLock[];
}): boolean {
	return channel.members.some(
		(member) =>
			member.id !== memberId && locks.some((lock) => lock.userId === member.id && lock.channelId === channel.id),
	);
}

function createVoiceRegionEmbed({
	userId,
	previousRegion,
	nextRegion,
	event,
}: {
	userId: string;
	previousRegion: string;
	nextRegion: string;
	event: "join" | "leave";
}): EmbedBuilder {
	const config = getConfig();
	return new EmbedBuilder()
		.setColor("Blue")
		.setAuthor({ name: `${config.BOT_NAME} : VC Region Lock`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setTitle(event === "join" ? "Voice region updated" : "Voice region restored")
		.setDescription(
			`🌐 \`${formatVoiceRegion(previousRegion)}\` → \`${formatVoiceRegion(nextRegion)}\`\n` +
				`${userMention(userId)} ${event === "join" ? "joined" : "left"} the voice channel.`,
		)
		.setTimestamp();
}

async function handleVoiceRegionLockDisable({
	guild,
	userId,
	channelId,
	reason,
}: {
	guild: Guild;
	userId: string;
	channelId: string;
	reason: string;
}): Promise<void> {
	if (!isActiveGuild(guild)) return;
	logger.warn("DISCORD", "Removed voice region lock because it cannot be processed", {
		guildId: guild.id,
		userId,
		channelId,
		reason,
	});
	await removeVoiceRegionLock(guild, userId);
	const commandId = getCommandId("lock-vc-region");
	const addLockCommand = commandId
		? chatInputApplicationCommandMention("lock-vc-region", "add", commandId)
		: "the command menu";
	await sendGuildMessage({
		guild,
		content: {
			content: `⚠️ The voice-region lock for ${userMention(userId)} in ${channelMention(channelId)} was automatically disabled because ${reason}.\n📢 PSA for admins: please configure a new lock with ${addLockCommand}.`,
			allowedMentions: { parse: [] },
		},
		failureMessage: "Failed to notify guild about disabled voice region lock",
		details: { userId, channelId, reason },
	});
}

export async function handleVoiceRegionState(oldState: VoiceState, newState: VoiceState): Promise<void> {
	const member = newState.member ?? oldState.member;
	if (!member || member.user.bot || !isActiveGuild(newState.guild)) {
		return;
	}

	try {
		const storedMemberState = await getGuildMemberState(newState.guild.id, member.id);
		if (!isActiveGuild(newState.guild)) return;
		const lock = storedMemberState?.voiceRegionLock;
		if (!lock) {
			return;
		}

		const channelChanged = oldState.channelId !== newState.channelId;
		const joinedLockedChannel = channelChanged && newState.channelId === lock.channelId;
		const leftLockedChannel = channelChanged && oldState.channelId === lock.channelId;
		if (!joinedLockedChannel && !leftLockedChannel) {
			return;
		}

		const channel = joinedLockedChannel ? newState.channel : oldState.channel;
		if (!channel || channel.type !== ChannelType.GuildVoice) {
			await handleVoiceRegionLockDisable({
				guild: newState.guild,
				userId: member.id,
				channelId: lock.channelId,
				reason: "the configured voice channel is no longer available",
			});
			return;
		}

		if (!member.guild.members.me?.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
			await handleVoiceRegionLockDisable({
				guild: newState.guild,
				userId: member.id,
				channelId: channel.id,
				reason: `I no longer have ${underline("Manage Channels")} permission there`,
			});
			return;
		}

		const locks = await getVoiceRegionLocks(newState.guild);
		if (!isActiveGuild(newState.guild)) return;

		if (joinedLockedChannel) {
			if (
				hasOtherLockedMemberInChannel({ channel, memberId: member.id, locks }) ||
				channel.rtcRegion === lock.region
			) {
				return;
			}

			const previousRegion = channel.rtcRegion ?? "automatic";
			lock.fallbackRegion = channel.rtcRegion;
			await channel.setRTCRegion(lock.region);
			if (!isActiveGuild(newState.guild)) return;
			await storedMemberState.save();
			logger.info("DISCORD", "Voice channel region locked", {
				guildId: newState.guild.id,
				userId: member.id,
				channelId: channel.id,
				region: lock.region,
			});
			await channel.send({
				embeds: [
					createVoiceRegionEmbed({
						userId: member.id,
						previousRegion,
						nextRegion: lock.region,
						event: "join",
					}),
				],
				components: [
					createGuildDashboardLink({
						config: getConfig(),
						guildId: newState.guild.id,
						section: "voice-region-locks",
					}),
				],
				allowedMentions: { parse: [] },
			});
			return;
		} else if (leftLockedChannel) {
			if (hasOtherLockedMemberInChannel({ channel, memberId: member.id, locks })) {
				return;
			}
			const fallbackState = (await getVoiceRegionLockStates(newState.guild.id, channel.id)).find(
				(state) => state.voiceRegionLock?.fallbackRegion,
			);
			if (!isActiveGuild(newState.guild)) return;
			if (!fallbackState?.voiceRegionLock?.fallbackRegion) {
				return;
			}

			const fallbackRegion = fallbackState.voiceRegionLock.fallbackRegion;
			const previousRegion = channel.rtcRegion ?? "automatic";
			await channel.setRTCRegion(fallbackRegion);
			if (!isActiveGuild(newState.guild)) return;
			fallbackState.voiceRegionLock.fallbackRegion = null;
			await fallbackState.save();
			logger.info("DISCORD", "Voice channel region restored", {
				guildId: newState.guild.id,
				userId: fallbackState.userId,
				channelId: channel.id,
				region: fallbackRegion,
			});
			await channel.send({
				embeds: [
					createVoiceRegionEmbed({
						userId: member.id,
						previousRegion,
						nextRegion: fallbackRegion,
						event: "leave",
					}),
				],
				components: [
					createGuildDashboardLink({
						config: getConfig(),
						guildId: newState.guild.id,
						section: "voice-region-locks",
					}),
				],
				allowedMentions: { parse: [] },
			});
		}
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to process voice region lock", {
			guildId: newState.guild.id,
			userId: member.id,
			error,
		});
	}
}
