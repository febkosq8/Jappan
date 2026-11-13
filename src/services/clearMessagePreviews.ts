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
import { createClearMessageTextFilter } from "./clearMessageTextFilter.js";

const messageBatchSize = 100;
const initialMessageBatchSize = 1;
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
		regex: z.boolean(),
		ignoreCase: z.boolean(),
	}),
	scannedChannelCount: z.number().int().nonnegative(),
	skippedChannelCount: z.number().int().nonnegative(),
	scannedCount: z.number().int().nonnegative(),
	matchedCount: z.number().int().nonnegative(),
	deleteCount: z.number().int().nonnegative(),
	scanStoppedAtLimit: z.boolean(),
	bulkDeleteCount: z.number().int().nonnegative(),
	individualDeleteCount: z.number().int().nonnegative(),
	olderThanBulkDeleteLimit: z.number().int().nonnegative(),
	expiresAt: z.number().int(),
	messages: z.array(
		z.object({
			id: z.string(),
			channelId: z.string(),
			channelName: z.string(),
			author: z.object({
				id: z.string(),
				username: z.string(),
				displayName: z.string(),
				avatarUrl: z.string(),
			}),
			content: z.string(),
			embedContent: z.array(z.string().nullable()),
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
	currentChannelId: string;
	currentChannelName: string;
}

interface ClearMessageChannelScan {
	channel: ClearableGuildChannel;
	messages: Message[];
	messageIndex: number;
	before: string | null;
	hasMore: boolean;
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

function getEmbedContent(message: Message): (string | null)[] {
	return message.embeds.map((embed) => {
		const content = [
			embed.author?.name,
			embed.title,
			embed.description,
			...embed.fields.flatMap((field) => [field.name, field.value]),
			embed.footer?.text,
		].filter((value): value is string => Boolean(value?.trim()));
		return content.length > 0 ? content.join("\n") : null;
	});
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
	regex = false,
	ignoreCase = false,
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
	regex?: boolean;
	ignoreCase?: boolean;
	excludedInteractionId?: string;
	skippedChannelCount?: number;
	validateChannel?: (channel: ClearableGuildChannel) => string | null;
	onProgress?: (progress: ClearMessagePreviewProgress) => void;
	jobDeadlineAt: number;
	signal?: AbortSignal;
}): Promise<ClearMessagePreviewRecord> {
	if (!Number.isInteger(count) || count < 1 || count > 200) {
		throw new Error("Count must be between 1 and 200.");
	}
	let scannedCount = 0;
	let matchedCount = 0;
	let scanStoppedAtLimit = false;
	const matchingMessages: Message[] = [];
	const scannedChannelIds = new Set<string>();
	const channelScans: ClearMessageChannelScan[] = [];
	const evaluatedMessages = new Map<string, boolean>();
	const textFilter = createClearMessageTextFilter({
		...(text !== undefined ? { text } : {}),
		regex,
		ignoreCase,
	});
	const isEligibleMessage = (message: Message) => {
		const cachedResult = evaluatedMessages.get(message.id);
		if (cachedResult !== undefined) return cachedResult;
		const isEligible =
			(!targetUserId || message.author.id === targetUserId) &&
			textFilter.matches(message.content) &&
			(!excludedInteractionId || message.interactionMetadata?.id !== excludedInteractionId);
		evaluatedMessages.set(message.id, isEligible);
		scannedCount += 1;
		return isEligible;
	};

	const fetchBatch = async ({
		channel,
		before,
		limit,
	}: {
		channel: ClearableGuildChannel;
		before?: string;
		limit: number;
	}) => {
		signal?.throwIfAborted();
		if (Date.now() >= jobDeadlineAt) {
			throw new Error("Preview scanning reached the time limit. Choose a channel and create a new preview.");
		}
		const messages = await channel.messages.fetch({
			limit,
			...(before ? { before } : {}),
		});
		signal?.throwIfAborted();
		return [...messages.values()].sort((first, second) => second.createdTimestamp - first.createdTimestamp);
	};

	for (const channel of channels) {
		signal?.throwIfAborted();
		if (Date.now() >= jobDeadlineAt) {
			throw new Error("Preview scanning reached the time limit. Choose a channel and create a new preview.");
		}
		const permissionError = validateChannel?.(channel);
		if (permissionError) {
			if (selectedChannelId) throw new Error(permissionError);
			skippedChannelCount += 1;
			continue;
		}
		const batch = await fetchBatch({ channel, limit: initialMessageBatchSize });
		for (const message of batch) isEligibleMessage(message);
		const lastMessage = batch[batch.length - 1];
		channelScans.push({
			channel,
			messages: batch,
			messageIndex: 0,
			before: lastMessage?.id ?? null,
			hasMore: batch.length === initialMessageBatchSize,
		});
		scannedChannelIds.add(channel.id);
		onProgress?.({
			scannedChannelCount: scannedChannelIds.size,
			scannedCount,
			matchedCount,
			currentChannelId: channel.id,
			currentChannelName: channel.name,
		});
	}

	if (channelScans.length === 0) {
		throw new Error("No message channels are available with the required permissions");
	}

	while (true) {
		let nextScan: ClearMessageChannelScan | undefined;
		let newestMessage: Message | undefined;
		for (const scan of channelScans) {
			const message = scan.messages[scan.messageIndex];
			if (message && (!newestMessage || message.createdTimestamp > newestMessage.createdTimestamp)) {
				nextScan = scan;
				newestMessage = message;
			}
		}
		if (!nextScan || !newestMessage) break;

		nextScan.messageIndex += 1;
		if (isEligibleMessage(newestMessage)) {
			matchedCount += 1;
			matchingMessages.push(newestMessage);
			scanStoppedAtLimit = matchedCount >= count;
		}

		const pageExhausted = nextScan.messageIndex >= nextScan.messages.length;
		onProgress?.({
			scannedChannelCount: scannedChannelIds.size,
			scannedCount,
			matchedCount,
			currentChannelId: nextScan.channel.id,
			currentChannelName: nextScan.channel.name,
		});

		if (scanStoppedAtLimit) break;

		if (pageExhausted && nextScan.hasMore) {
			const previousBefore = nextScan.before;
			const batch = await fetchBatch({
				channel: nextScan.channel,
				...(previousBefore ? { before: previousBefore } : {}),
				limit: messageBatchSize,
			});
			const lastMessage = batch[batch.length - 1];
			if (batch.length > 0 && (!lastMessage || lastMessage.id === previousBefore)) {
				throw new Error(`Could not continue scanning messages in #${nextScan.channel.name}.`);
			}
			nextScan.messages = batch;
			nextScan.messageIndex = 0;
			nextScan.before = lastMessage?.id ?? null;
			nextScan.hasMore = batch.length === messageBatchSize;
			onProgress?.({
				scannedChannelCount: scannedChannelIds.size,
				scannedCount,
				matchedCount,
				currentChannelId: nextScan.channel.id,
				currentChannelName: nextScan.channel.name,
			});
		}
	}
	if (scannedChannelIds.size === 0)
		throw new Error("No message channels are available with the required permissions");
	const messages = matchingMessages;
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
			textFilter: textFilter.text,
			regex,
			ignoreCase,
		},
		scannedChannelCount: scannedChannelIds.size,
		scanStoppedAtLimit,
		skippedChannelCount,
		scannedCount,
		matchedCount,
		deleteCount: messages.length,
		bulkDeleteCount,
		individualDeleteCount: messages.length - bulkDeleteCount,
		olderThanBulkDeleteLimit: messages.length - bulkDeleteCount,
		expiresAt: jobDeadlineAt,
		messages: messages.map((message) => ({
			id: message.id,
			channelId: message.channelId,
			channelName: message.channel.isDMBased() ? "" : message.channel.name,
			author: {
				id: message.author.id,
				username: message.author.username,
				displayName: message.member?.displayName ?? message.author.globalName ?? message.author.username,
				avatarUrl: message.author.displayAvatarURL(),
			},
			content: message.content,
			embedContent: getEmbedContent(message),
			createdTimestampMs: message.createdTimestamp,
			jumpUrl: message.url,
		})),
	};
	return { data, messages };
}
