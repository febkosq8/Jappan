import { ChannelType, PermissionFlagsBits } from "discord.js";
import type { Guild, VoiceChannel, VoiceState } from "discord.js";

import GuildMemberStateModel from "../models/guildMemberState.js";
import type { GuildMemberStateDocument } from "../models/guildMemberState.js";
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

export async function getVoiceRegionIds(guild: Guild): Promise<string[]> {
	const regions = await guild.client.fetchVoiceRegions();
	return Array.from(regions.values(), (region) => region.id);
}

export async function addVoiceRegionLock({
	guild,
	userId,
	userName,
	channelId,
	channelName,
	region,
}: {
	guild: Guild;
	userId: string;
	userName: string;
	channelId: string;
	channelName: string;
	region: string;
}): Promise<void> {
	const regions = await getVoiceRegionIds(guild);
	if (!regions.includes(region)) {
		throw new Error(`\`${region}\` is not a valid Discord voice region.`);
	}

	const channel = await guild.channels.fetch(channelId);
	if (!channel?.isVoiceBased()) {
		throw new Error("The selected channel is no longer a voice channel.");
	}

	const botMember = await guild.members.fetchMe();
	if (!botMember.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
		throw new Error(`I need Manage Channels permission in <#${channelId}> to lock its region.`);
	}

	const storedMemberState = await getOrCreateGuildMemberState(guild.id, userId, userName);
	storedMemberState.voiceRegionLock = { channelId, channelName, region, fallbackRegion: null };
	await storedMemberState.save();
}

export async function removeVoiceRegionLock(guild: Guild, userId: string): Promise<boolean> {
	const storedMemberState = await getGuildMemberState(guild.id, userId);
	if (!storedMemberState?.voiceRegionLock) {
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

function hasOtherLockedMemberInChannel(
	channel: VoiceChannel,
	memberId: string,
	locks: readonly VoiceRegionLock[],
): boolean {
	return channel.members.some(
		(member) =>
			member.id !== memberId && locks.some((lock) => lock.userId === member.id && lock.channelId === channel.id),
	);
}

async function getManagedVoiceChannel(guild: Guild, channelId: string): Promise<VoiceChannel | null> {
	const channel = await guild.channels.fetch(channelId);
	return channel?.isVoiceBased() && channel.type === ChannelType.GuildVoice ? channel : null;
}

export async function handleVoiceRegionState(oldState: VoiceState, newState: VoiceState): Promise<void> {
	const member = newState.member ?? oldState.member;
	if (!member || member.user.bot) {
		return;
	}

	try {
		const storedMemberState = await getGuildMemberState(newState.guild.id, member.id);
		const lock = storedMemberState?.voiceRegionLock;
		if (!lock) {
			return;
		}

		const joinedLockedChannel = oldState.channelId !== newState.channelId && newState.channelId === lock.channelId;
		const leftLockedChannel = oldState.channelId === lock.channelId && newState.channelId !== lock.channelId;
		if (!joinedLockedChannel && !leftLockedChannel) {
			return;
		}

		const channel = await getManagedVoiceChannel(newState.guild, lock.channelId);
		if (!channel) {
			logger.warn("DISCORD", "Removed voice region lock because its channel is unavailable", {
				guildId: newState.guild.id,
				userId: member.id,
				channelId: lock.channelId,
			});
			await removeVoiceRegionLock(newState.guild, member.id);
			return;
		}

		if (!member.guild.members.me?.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels)) {
			logger.warn("DISCORD", "Removed voice region lock because the bot lacks Manage Channels", {
				guildId: newState.guild.id,
				userId: member.id,
				channelId: channel.id,
			});
			await removeVoiceRegionLock(newState.guild, member.id);
			return;
		}

		const locks = await getVoiceRegionLocks(newState.guild);

		if (joinedLockedChannel) {
			if (hasOtherLockedMemberInChannel(channel, member.id, locks) || channel.rtcRegion === lock.region) {
				return;
			}

			lock.fallbackRegion = channel.rtcRegion;
			await channel.setRTCRegion(lock.region);
			await storedMemberState.save();
			logger.info("DISCORD", "Voice channel region locked", {
				guildId: newState.guild.id,
				userId: member.id,
				channelId: channel.id,
				region: lock.region,
			});
			return;
		}

		if (!hasOtherLockedMemberInChannel(channel, member.id, locks)) {
			const fallbackState = (await getVoiceRegionLockStates(newState.guild.id, channel.id)).find(
				(state) => state.voiceRegionLock?.fallbackRegion,
			);
			if (!fallbackState?.voiceRegionLock?.fallbackRegion) {
				return;
			}

			const fallbackRegion = fallbackState.voiceRegionLock.fallbackRegion;
			await channel.setRTCRegion(fallbackRegion);
			fallbackState.voiceRegionLock.fallbackRegion = null;
			await fallbackState.save();
			logger.info("DISCORD", "Voice channel region restored", {
				guildId: newState.guild.id,
				userId: fallbackState.userId,
				channelId: channel.id,
				region: fallbackRegion,
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
