import { randomUUID } from "node:crypto";
import {
	ChannelType,
	PermissionFlagsBits,
	type Guild,
	type GuildBasedChannel,
	type GuildMember,
	type Message,
} from "discord.js";
import { z } from "zod";

import type { ClearableGuildChannel } from "./clearMessageJobs.js";
import { DISCORD_INTERACTION_TIME_LIMIT_MS } from "../helpers/interaction.js";

export const clearMessagePreviewLifetimeMs = 10 * 60 * 1000;
const scanLimitPerChannel = 100;
const bulkDeleteAgeMs = 14 * 24 * 60 * 60 * 1000;
const clearableChannelTypes = new Set<number>([
	ChannelType.GuildText,
	ChannelType.GuildAnnouncement,
	ChannelType.GuildVoice,
]);

export const clearMessagePreviewSchema = z.object({
	previewId: z.string().uuid(),
	guild: z.object({ id: z.string(), name: z.string() }),
	channel: z.object({ id: z.string(), name: z.string() }).nullable(),
	request: z.object({
		count: z.number().int().min(1).max(200),
		targetUser: z
			.object({
				id: z.string(),
				username: z.string(),
				displayName: z.string(),
				avatarUrl: z.string().nullable(),
			})
			.nullable(),
		textFilter: z.string().nullable(),
	}),
	scannedChannelCount: z.number().int().nonnegative(),
	skippedChannelCount: z.number().int().nonnegative(),
	scannedCount: z.number().int().nonnegative(),
	matchedCount: z.number().int().nonnegative(),
	deleteCount: z.number().int().nonnegative(),
	bulkDeleteCount: z.number().int().nonnegative(),
	individualDeleteCount: z.number().int().nonnegative(),
	olderThanBulkDeleteLimit: z.number().int().nonnegative(),
	scanLimitReached: z.boolean(),
	expiresAt: z.number().int(),
	messages: z.array(
		z.object({
			id: z.string(),
			channelName: z.string(),
			author: z.object({ id: z.string(), username: z.string(), displayName: z.string() }),
			content: z.string(),
			createdTimestampMs: z.number().int(),
			jumpUrl: z.string().url(),
		}),
	),
});

export type ClearMessagePreview = z.infer<typeof clearMessagePreviewSchema>;

export interface ClearMessagePreviewRecord {
	data: ClearMessagePreview;
	messages: Message[];
}

export interface ClearMessagePreviewProgress {
	scannedChannelCount: number;
	scannedCount: number;
	matchedCount: number;
	currentChannelName: string;
}

export function isClearableGuildChannel(channel: GuildBasedChannel | null): channel is ClearableGuildChannel {
	return (
		channel !== null &&
		clearableChannelTypes.has(channel.type) &&
		channel.isTextBased() &&
		"messages" in channel &&
		typeof channel.messages.fetch === "function" &&
		"permissionsFor" in channel
	);
}

export function getClearChannelPermissionError({
	channel,
	member,
	botMember,
	isBotAdministrator,
}: {
	channel: ClearableGuildChannel;
	member: GuildMember | null;
	botMember: GuildMember;
	isBotAdministrator: boolean;
}): string | null {
	if (
		!isBotAdministrator &&
		(!member ||
			!member
				.permissionsIn(channel)
				.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]))
	) {
		return "You need access to view channel messages and history";
	}
	const requiredPermissions = [
		[PermissionFlagsBits.ViewChannel, "View Channel"],
		[PermissionFlagsBits.ReadMessageHistory, "Read Message History"],
		[PermissionFlagsBits.ManageMessages, "Manage Messages"],
	] as const;
	const botPermissions = botMember.permissionsIn(channel);
	const missingPermissions = requiredPermissions
		.filter(([permission]) => !botPermissions.has(permission))
		.map(([, label]) => label);
	return missingPermissions.length > 0
		? `The bot is missing channel permissions: ${missingPermissions.join(", ")}`
		: null;
}

export async function createClearMessagePreview({
	guild,
	channels,
	count,
	selectedChannelId,
	targetUserId,
	text,
	excludedInteractionId,
	skippedChannelCount = 0,
	validateChannel,
	onProgress,
	jobDeadlineAt,
	signal,
}: {
	guild: Guild;
	channels: ClearableGuildChannel[];
	count: number;
	selectedChannelId?: string;
	targetUserId?: string;
	text?: string;
	excludedInteractionId?: string;
	skippedChannelCount?: number;
	validateChannel?: (channel: ClearableGuildChannel) => string | null;
	onProgress?: (progress: ClearMessagePreviewProgress) => void;
	jobDeadlineAt?: number;
	signal?: AbortSignal;
}): Promise<ClearMessagePreviewRecord> {
	if (!Number.isInteger(count) || count < 1 || count > 200) {
		throw new Error("Count must be between 1 and 200.");
	}
	let scannedCount = 0;
	let scannedChannelCount = 0;
	let scanLimitReached = false;
	const matchingMessages: Message[] = [];
	const textFilter = text?.trim() || null;
	const scanDeadlineAt = jobDeadlineAt ?? Date.now() + DISCORD_INTERACTION_TIME_LIMIT_MS;
	for (const channel of channels) {
		signal?.throwIfAborted();
		if (Date.now() >= scanDeadlineAt) {
			throw new Error("Preview scanning reached the time limit. Choose a channel and create a new preview.");
		}
		const permissionError = validateChannel?.(channel);
		if (permissionError) {
			if (selectedChannelId) throw new Error(permissionError);
			skippedChannelCount += 1;
			continue;
		}
		onProgress?.({
			scannedChannelCount,
			scannedCount,
			matchedCount: matchingMessages.length,
			currentChannelName: channel.name,
		});
		const messages = await channel.messages.fetch({ limit: scanLimitPerChannel });
		signal?.throwIfAborted();
		scannedCount += messages.size;
		scannedChannelCount += 1;
		scanLimitReached ||= messages.size === scanLimitPerChannel;
		matchingMessages.push(
			...[...messages.values()].filter(
				(message) =>
					(!targetUserId || message.author.id === targetUserId) &&
					(!textFilter || message.content.includes(textFilter)) &&
					(!excludedInteractionId || message.interactionMetadata?.id !== excludedInteractionId),
			),
		);
		onProgress?.({
			scannedChannelCount,
			scannedCount,
			matchedCount: matchingMessages.length,
			currentChannelName: channel.name,
		});
	}
	if (scannedChannelCount === 0) throw new Error("No message channels are available with the required permissions");
	matchingMessages.sort((first, second) => second.createdTimestamp - first.createdTimestamp);
	const messages = matchingMessages.slice(0, count);
	const targetUser = targetUserId ? await guild.client.users.fetch(targetUserId) : null;
	const targetMember = targetUserId ? guild.members.cache.get(targetUserId) : null;
	const channel = selectedChannelId ? channels.find((candidate) => candidate.id === selectedChannelId) : null;
	if (selectedChannelId && !channel) throw new Error("Selected channel is not available");
	const bulkDeleteCount = messages.filter(
		(message) => message.createdTimestamp >= Date.now() - bulkDeleteAgeMs,
	).length;
	const data: ClearMessagePreview = {
		previewId: randomUUID(),
		guild: { id: guild.id, name: guild.name },
		channel: channel ? { id: channel.id, name: channel.name } : null,
		request: {
			count,
			targetUser: targetUser
				? {
						id: targetUser.id,
						username: targetUser.username,
						displayName: targetMember?.displayName ?? targetUser.globalName ?? targetUser.username,
						avatarUrl: targetUser.displayAvatarURL(),
					}
				: null,
			textFilter,
		},
		scannedChannelCount,
		skippedChannelCount,
		scannedCount,
		matchedCount: matchingMessages.length,
		deleteCount: messages.length,
		bulkDeleteCount,
		individualDeleteCount: messages.length - bulkDeleteCount,
		olderThanBulkDeleteLimit: messages.length - bulkDeleteCount,
		scanLimitReached,
		expiresAt: Math.min(Date.now() + clearMessagePreviewLifetimeMs, scanDeadlineAt),
		messages: messages.map((message) => ({
			id: message.id,
			channelName: message.channel.isDMBased() ? "" : message.channel.name,
			author: {
				id: message.author.id,
				username: message.author.username,
				displayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
			},
			content: message.content || "(No text content)",
			createdTimestampMs: message.createdTimestamp,
			jumpUrl: message.url,
		})),
	};
	return { data, messages };
}
