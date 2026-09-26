import {
	ChannelType,
	InteractionContextType,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";
import type { Message } from "discord.js";

import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { logger } from "../services/logger.js";

const commandData = {
	name: "clear",
	description: "Delete messages from one channel or across the guild",
	category: "moderator",
	isDBDependant: false,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.ReadMessageHistory,
		PermissionFlagsBits.ManageMessages,
	],
} satisfies BotCommandData;

const deleteMessages = async (channel: object, messages: Message[], channelName: string) => {
	let deleted = 0;
	let failed = 0;
	const bulkDeletableBefore = Date.now() - 1209600000;
	const bulkMessages = messages.filter((message) => message.createdTimestamp >= bulkDeletableBefore);
	const individualMessages = messages.filter((message) => message.createdTimestamp < bulkDeletableBefore);

	if (bulkMessages.length > 0 && "bulkDelete" in channel && typeof channel.bulkDelete === "function") {
		try {
			deleted += (await channel.bulkDelete(bulkMessages, true)).size;
		} catch (error: unknown) {
			failed += bulkMessages.length;
			logger.warn("(/) Command : CLEAR", "Failed to bulk delete messages", {
				channel: channelName,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	} else {
		individualMessages.push(...bulkMessages);
	}

	for (const message of individualMessages) {
		try {
			await message.delete();
			deleted += 1;
		} catch (error: unknown) {
			failed += 1;
			logger.warn("(/) Command : CLEAR", "Failed to delete message", {
				channel: channelName,
				messageId: message.id,
				message: error instanceof Error ? error.message : String(error),
			});
		}
	}

	return { deleted, failed };
};

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addChannelOption((option) =>
			option
				.setName("channel")
				.setDescription("Limit deletion to this channel; omit to scan all guild channels")
				.addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildVoice)
				.setRequired(false),
		)
		.addNumberOption((option) =>
			option.setName("count").setDescription("Maximum total messages to delete; defaults to 200").setRequired(false),
		)
		.addUserOption((option) =>
			option.setName("username").setDescription("Only delete messages sent by this user").setRequired(false),
		)
		.addStringOption((option) =>
			option.setName("user-id").setDescription("Only delete messages sent by this Discord user ID").setRequired(false),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!interaction.guild) {
			await interaction.editReply("This command can only be used in a guild.");
			return;
		}

		const selectedChannel = interaction.options.getChannel("channel");
		const targetUser = interaction.options.getUser("username");
		const targetUserId = targetUser?.id ?? interaction.options.getString("user-id")?.trim();
		const count = Math.floor(interaction.options.getNumber("count") ?? 200);
		if (count < 1) {
			await interaction.editReply("Count must be at least 1.");
			return;
		}
		if (targetUserId && !/^\d{17,20}$/.test(targetUserId)) {
			await interaction.editReply("User ID must be a valid Discord user ID.");
			return;
		}

		let progressInterval: ReturnType<typeof setInterval> | undefined;
		let progressUpdate: Promise<void> | undefined;
		try {
			const selectedGuildChannel = selectedChannel
				? await interaction.guild.channels.fetch(selectedChannel.id)
				: undefined;
			if (selectedChannel && !selectedGuildChannel) {
				await interaction.editReply("The selected channel could not be found.");
				return;
			}
			const channels = selectedGuildChannel
				? [selectedGuildChannel]
				: [...(await interaction.guild.channels.fetch()).values()].filter(
						(channel): channel is NonNullable<typeof channel> =>
							channel !== null && channel.isTextBased() && "messages" in channel && "permissionsFor" in channel,
					);
			const progressState: {
				startedAt: number;
				deletedMessages: number;
				scannedMessages: number;
				processedChannels: number;
				currentChannel: string;
				currentChannelMention: string;
				currentChannelScanned: number;
				currentChannelDeleted: number;
				failedMessages: number;
				currentChannelFailed: number;
				channelStats: string[];
				summaryMessage: Message | undefined;
			} = {
				startedAt: Date.now(),
				deletedMessages: 0,
				scannedMessages: 0,
				processedChannels: 0,
				currentChannel: "Starting",
				currentChannelMention: "Starting",
				currentChannelScanned: 0,
				currentChannelDeleted: 0,
				failedMessages: 0,
				currentChannelFailed: 0,
				channelStats: [],
				summaryMessage: undefined,
			};
			const formatElapsedTime = () => {
				const elapsedSeconds = Math.floor((Date.now() - progressState.startedAt) / 1000);
				const minutes = Math.floor(elapsedSeconds / 60);
				const seconds = elapsedSeconds % 60;
				return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
			};
			const setChannelStat = (
				channelMention: string,
				status: string,
				scanned: number,
				deleted: number,
				failed: number,
			) => {
				const stat = `${channelMention} | ${status} | Scanned: ${scanned} | Deleted: ${deleted} | Failed: ${failed}`;
				const existingIndex = progressState.channelStats.findIndex((channelStat) =>
					channelStat.startsWith(`${channelMention} |`),
				);
				if (existingIndex === -1) progressState.channelStats.push(stat);
				else progressState.channelStats[existingIndex] = stat;
			};
			const createChannelStatsEmbeds = (totalPages: number, isComplete: boolean) => {
				const pageSize = 10;
				const pageCount = Math.ceil(progressState.channelStats.length / pageSize);

				return Array.from({ length: pageCount }, (_, pageIndex) =>
					new EmbedBuilder()
						.setColor(isComplete ? "Green" : "Blue")
						.setTitle("Clear messages | Per Channel Stats")
						.setDescription(
							[
								"`# | Channel | Status | Scanned | Deleted | Failed`",
								...progressState.channelStats
									.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
									.map((stat, statIndex) => `${pageIndex * pageSize + statIndex + 1} | ${stat}`),
							].join("\n"),
						)
						.setFooter({ text: `Run ${interaction.id} | Page ${pageIndex + 2}/${totalPages}` })
						.setTimestamp(),
				);
			};
			const createProgressEmbeds = (step: string, currentChannelMention: string) => {
				const statsPageCount = Math.ceil(progressState.channelStats.length / 10);
				const totalPages = statsPageCount + 1;
				return [
					createProgressEmbed(step, currentChannelMention, totalPages),
					...createChannelStatsEmbeds(totalPages, step.startsWith("Complete")).slice(0, 5),
				];
			};
			const sendOverflowChannelStats = async (isComplete: boolean) => {
				const totalPages = Math.ceil(progressState.channelStats.length / 10) + 1;
				for (const embed of createChannelStatsEmbeds(totalPages, isComplete).slice(5)) {
					await interaction.followUp({ flags: MessageFlags.Ephemeral, embeds: [embed] });
				}
			};
			const createProgressEmbed = (step: string, currentChannelMention: string, totalPages: number) =>
				new EmbedBuilder()
					.setColor(step.startsWith("Complete") ? "Green" : "Blue")
					.setTitle("Clear messages | Summary")
					.setFooter({ text: `Run ${interaction.id} | Page 1/${totalPages}` })
					.setTimestamp()
					.addFields(
						...(targetUserId ? [{ name: "Target user", value: `<@${targetUserId}> (\`${targetUserId}\`)` }] : []),
						{ name: "Delete limit", value: count.toString() },
						{
							name: "Status",
							value: `${step.startsWith("Complete") ? "Complete" : step.startsWith("Stopped") ? "Stopped" : "In progress"} (${formatElapsedTime()} elapsed)`,
						},
						{ name: "Overall Progress", value: `${progressState.processedChannels}/${channels.length} channels` },
						{ name: "Step", value: `${currentChannelMention} | ${step}` },
						{
							name: "Message stats",
							value: `Scanned: ${progressState.scannedMessages} | Deleted: ${progressState.deletedMessages} | Failed: ${progressState.failedMessages}`,
						},
					);
			progressState.summaryMessage = await interaction.editReply({
				embeds: createProgressEmbeds("Preparing channel scan...", "Starting"),
			});
			progressInterval = setInterval(() => {
				if (!progressState.summaryMessage) return;
				progressUpdate = interaction.webhook
					.editMessage(progressState.summaryMessage.id, {
						embeds: createProgressEmbeds("Still scanning messages...", progressState.currentChannelMention),
					})
					.then(() => undefined)
					.catch(() => undefined);
			}, 2500);

			for (const channel of channels.values()) {
				if (progressState.deletedMessages >= count) break;
				progressState.processedChannels += 1;
				progressState.currentChannel = channel.name;
				progressState.currentChannelMention = `<#${channel.id}>`;
				progressState.currentChannelScanned = 0;
				progressState.currentChannelDeleted = 0;
				progressState.currentChannelFailed = 0;
				await interaction.editReply({
					embeds: createProgressEmbeds("Scanning messages...", progressState.currentChannelMention),
				});
				const channelName = progressState.currentChannel;
				const channelMention = progressState.currentChannelMention;
				if (!channel?.isTextBased() || !("messages" in channel) || !("permissionsFor" in channel)) {
					continue;
				}
				setChannelStat(channelMention, "Scanning messages...", 0, 0, 0);
				const missingPermissions = channel
					.permissionsFor(interaction.client.user)
					?.missing([
						PermissionFlagsBits.ViewChannel,
						PermissionFlagsBits.ReadMessageHistory,
						PermissionFlagsBits.ManageMessages,
					]);
				if (missingPermissions && missingPermissions.length > 0) {
					clearInterval(progressInterval);
					setChannelStat(channelMention, `Stopped: missing ${missingPermissions.join(", ")}`, 0, 0, 0);
					await interaction.editReply({
						embeds: createProgressEmbeds("Stopped: missing permissions", progressState.currentChannelMention),
					});
					await sendOverflowChannelStats(false);
					return;
				}
				const messages = await channel.messages.fetch({ limit: 100 });
				progressState.scannedMessages += messages.size;
				progressState.currentChannelScanned = messages.size;
				setChannelStat(channelMention, "Scanning messages...", messages.size, 0, 0);
				if (messages.size === 0) {
					setChannelStat(channelMention, "No messages found", 0, 0, 0);
					await interaction.editReply({
						embeds: createProgressEmbeds("Channel scan complete", progressState.currentChannelMention),
					});
					continue;
				}
				const messagesToDelete = [...messages.values()]
					.filter(
						(message) =>
							(!targetUserId || message.author.id === targetUserId) &&
							message.interactionMetadata?.id !== interaction.id,
					)
					.slice(0, Math.max(0, count - progressState.deletedMessages))
					.sort((firstMessage, secondMessage) => secondMessage.createdTimestamp - firstMessage.createdTimestamp);
				const deletionResult = await deleteMessages(channel, messagesToDelete, channelName);
				progressState.deletedMessages += deletionResult.deleted;
				progressState.currentChannelDeleted += deletionResult.deleted;
				progressState.failedMessages += deletionResult.failed;
				progressState.currentChannelFailed += deletionResult.failed;
				setChannelStat(
					channelMention,
					`Complete in ${formatElapsedTime()}`,
					progressState.currentChannelScanned,
					progressState.currentChannelDeleted,
					progressState.currentChannelFailed,
				);
				await interaction.editReply({
					embeds: createProgressEmbeds("Channel scan complete", progressState.currentChannelMention),
				});
			}
			clearInterval(progressInterval);
			if (progressUpdate) await progressUpdate;
			await interaction.webhook.editMessage(progressState.summaryMessage.id, {
				embeds: createProgressEmbeds("Complete", "All channels scanned"),
			});
			await sendOverflowChannelStats(true);
			return;
		} catch (error: unknown) {
			if (progressInterval) clearInterval(progressInterval);
			await interaction.editReply("There was an error while clearing messages from this guild.");
			throw error;
		}
	},
};

export default command;
