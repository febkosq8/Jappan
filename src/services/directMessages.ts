import { ChannelType, EmbedBuilder, type Message } from "discord.js";
import mongoose from "mongoose";

import { getClient } from "../bot.js";
import { toApiUser } from "../helpers/apiUser.js";
import { createDashboardLinkActionRow } from "../helpers/dashboard.js";
import { formatUserMention } from "../helpers/discord.js";
import { createPaginatedList } from "../helpers/list.js";
import DirectMessageConversationModel from "../models/directMessageConversation.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";

type DirectMessageChange = { botUserId: string; userId: string } & (
	{ kind: "message" | "read" } | { kind: "received"; sender: { id: string; username: string } }
);
const MESSAGES_PER_PAGE = 25;
const listeners = new Set<(change: DirectMessageChange) => void>();

export function onDirectMessageChanged(listener: (change: DirectMessageChange) => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function notifyDirectMessageChanged(change: DirectMessageChange): void {
	for (const listener of listeners) {
		try {
			listener(change);
		} catch (error: unknown) {
			logger.error("WEBSOCKET", "Failed to notify direct message subscribers", { ...change, error });
		}
	}
}

export function getDirectMessageBotUserId(): string {
	const botUserId = getClient().user?.id;
	if (!botUserId) throw new Error("Discord bot user is unavailable");
	return botUserId;
}

function serializeMessage(message: Message) {
	return {
		id: message.id,
		content: message.content,
		author: toApiUser({
			id: message.author.id,
			username: message.author.username,
			displayName: message.author.globalName,
			avatarUrl: message.author.displayAvatarURL({ size: 64 }),
		}),
		createdTimestampMs: message.createdTimestamp,
		attachments: [...message.attachments.values()].map(({ name, url }) => ({ name, url })),
		embeds: message.embeds.map((embed) => ({
			title: embed.title,
			description: embed.description,
			fields: embed.fields.map(({ name, value }) => ({ name, value })),
		})),
		stickers: [...message.stickers.values()].map(({ name, url }) => ({ name, url })),
	};
}

export type DirectMessage = ReturnType<typeof serializeMessage>;

export async function listDirectMessageConversations({
	page,
	perPageLimit,
	userId,
}: {
	page: number;
	perPageLimit: number;
	userId?: string | undefined;
}) {
	const filter = { botUserId: getDirectMessageBotUserId(), ...(userId ? { userId } : {}) };
	const [conversations, total] = await Promise.all([
		DirectMessageConversationModel.find(filter)
			.sort({ lastReceivedAt: -1, userId: 1 })
			.skip(perPageLimit === 0 ? 0 : (page - 1) * perPageLimit)
			.limit(perPageLimit)
			.lean(),
		DirectMessageConversationModel.countDocuments(filter).exec(),
	]);
	const items = await Promise.all(
		conversations.map(async (conversation) => {
			const user = await getClient().users.fetch(conversation.userId);
			return {
				user: toApiUser({
					id: user.id,
					username: user.username,
					displayName: user.globalName,
					avatarUrl: user.displayAvatarURL({ size: 64 }),
				}),
				lastReceivedAt: conversation.lastReceivedAt.toISOString(),
				unread:
					BigInt(conversation.lastReceivedMessageId?.toString() ?? "0") >
					BigInt(conversation.lastReadMessageId?.toString() ?? "0"),
				lastReadAt: conversation.lastReadAt?.toISOString() ?? null,
				lastReadBy: conversation.lastReadBy
					? { id: conversation.lastReadBy.id, username: conversation.lastReadBy.username }
					: null,
			};
		}),
	);
	return createPaginatedList({ items, total, page, perPageLimit });
}

export async function markDirectMessageRead({
	userId,
	messageId,
	reader,
}: {
	userId: string;
	messageId: string | null;
	reader: { id: string; username: string };
}): Promise<void> {
	const botUserId = getDirectMessageBotUserId();
	const seen = messageId === null ? null : mongoose.Types.Decimal128.fromString(messageId);
	const result = await DirectMessageConversationModel.updateOne(
		{
			botUserId,
			userId,
			// A newer incoming message must remain unread.
			lastReceivedMessageId: seen,
			...(seen && { $or: [{ lastReadMessageId: null }, { lastReadMessageId: { $lte: seen } }] }),
		},
		{ $set: { lastReadMessageId: seen, lastReadAt: new Date(), lastReadBy: reader } },
	);
	if (result.modifiedCount > 0) notifyDirectMessageChanged({ botUserId, userId, kind: "read" });
}

async function getConversationChannel(userId: string) {
	const conversation = await DirectMessageConversationModel.findOne({
		botUserId: getDirectMessageBotUserId(),
		userId,
	}).lean();
	if (!conversation) return null;
	const user = await getClient().users.fetch(userId);
	const channel = await user.createDM(true);
	if (channel.id !== conversation.channelId) {
		throw new Error("Stored direct message channel does not match the user's Discord channel");
	}
	return { channel, lastReceivedMessageId: conversation.lastReceivedMessageId?.toString() ?? null };
}

export async function getDirectMessagePage({ userId, before }: { userId: string; before?: string | undefined }) {
	const conversation = await getConversationChannel(userId);
	if (!conversation) return null;
	const { channel, lastReceivedMessageId } = conversation;
	const messages = await channel.messages.fetch({ limit: MESSAGES_PER_PAGE + 1, ...(before && { before }) });
	const page = [...messages.values()].slice(0, MESSAGES_PER_PAGE).reverse();
	return {
		messages: page.map(serializeMessage),
		nextBefore: messages.size > MESSAGES_PER_PAGE ? (page[0]?.id ?? null) : null,
		lastReceivedMessageId,
	};
}

export type DirectMessagePage = NonNullable<Awaited<ReturnType<typeof getDirectMessagePage>>>;

export async function sendDirectMessage({ userId, content }: { userId: string; content: string }) {
	const botUserId = getDirectMessageBotUserId();
	const conversation = await getConversationChannel(userId);
	if (!conversation) return null;
	const { channel } = conversation;
	const message = await channel.send({ content, allowedMentions: { parse: [] } });
	notifyDirectMessageChanged({ botUserId, userId, kind: "message" });
	return serializeMessage(message);
}

export async function notifyAdminsOfDirectMessage(sender: { id: string; username: string }): Promise<void> {
	const config = getConfig();
	const url = new URL("/admin/direct-messages", config.BOT_WEBSITE);
	url.searchParams.set("userId", sender.id);
	const embed = new EmbedBuilder()
		.setAuthor({ name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setTitle("New direct message")
		.setDescription(`${config.BOT_NAME} received a direct message from ${formatUserMention(sender)}.`)
		.setTimestamp();
	const components = [createDashboardLinkActionRow({ url: url.href, label: "Open conversation" })];
	await Promise.all(
		[...new Set(config.ADMIN_USER_IDS)].map(async (adminId) => {
			try {
				const admin = await getClient().users.fetch(adminId);
				await admin.send({ embeds: [embed], components, allowedMentions: { parse: [] } });
			} catch (error: unknown) {
				logger.error("DISCORD", "Failed to notify admin of direct message", {
					adminId,
					userId: sender.id,
					error,
				});
			}
		}),
	);
}

export async function recordDirectMessage(message: Message): Promise<void> {
	if (message.channel.type !== ChannelType.DM) return;

	try {
		const botUserId = message.client.user?.id;
		if (!botUserId) throw new Error("Discord bot user is unavailable");
		if (message.author.bot) {
			if (message.author.id === botUserId) await notifyDirectMessageChannelChanged(message);
			return;
		}
		await DirectMessageConversationModel.updateOne(
			{ botUserId, userId: message.author.id },
			{
				$set: { channelId: message.channelId },
				$max: {
					lastReceivedAt: message.createdAt,
					lastReceivedMessageId: mongoose.Types.Decimal128.fromString(message.id),
				},
			},
			{ upsert: true },
		);
		notifyDirectMessageChanged({
			botUserId,
			userId: message.author.id,
			kind: "received",
			sender: { id: message.author.id, username: message.author.username },
		});
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to record direct message conversation", {
			userId: message.author.id,
			channelId: message.channelId,
			error,
		});
	}
}

export async function notifyDirectMessageChannelChanged(
	message: Pick<Message, "channel" | "channelId" | "client">,
): Promise<void> {
	if (message.channel.type !== ChannelType.DM) return;
	try {
		const botUserId = message.client.user?.id;
		if (!botUserId) throw new Error("Discord bot user is unavailable");
		const conversation = await DirectMessageConversationModel.findOne({
			botUserId,
			channelId: message.channelId,
		}).lean();
		if (conversation) notifyDirectMessageChanged({ botUserId, userId: conversation.userId, kind: "message" });
	} catch (error: unknown) {
		logger.error("DISCORD", "Failed to update direct message subscribers", { channelId: message.channelId, error });
	}
}
