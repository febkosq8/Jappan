import {
	InteractionContextType,
	EmbedBuilder,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	SnowflakeUtil,
} from "discord.js";
import type { Message } from "discord.js";

import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { logger } from "../services/logger.js";

const commandData = {
	name: "clear",
	description: "Clear messages",
	category: "moderator",
	isDBDependant: false,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.ReadMessageHistory,
		PermissionFlagsBits.ManageMessages,
	],
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("channel")
				.setDescription("Delete messages from this channel")
				.addNumberOption((option) =>
					option.setName("count").setDescription("Number of messages to delete").setRequired(false),
				)
				.addUserOption((option) =>
					option.setName("username").setDescription("Only delete this user's messages").setRequired(false),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("user")
				.setDescription("Delete a user's messages from this guild; select a user or provide a user ID")
				.addStringOption((option) =>
					option.setName("user-id").setDescription("User ID whose messages should be deleted").setRequired(false),
				)
				.addUserOption((option) =>
					option.setName("username").setDescription("User whose messages should be deleted").setRequired(false),
				),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (
			!interaction.guild ||
			!interaction.channel ||
			!("bulkDelete" in interaction.channel) ||
			!("messages" in interaction.channel)
		) {
			await interaction.editReply("This command can only be used in a guild text channel.");
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		const targetUser = interaction.options.getUser("username");
		const targetUserId =
			subcommand === "user" ? (targetUser?.id ?? interaction.options.getString("user-id")?.trim()) : targetUser?.id;
		const count = Math.min(interaction.options.getNumber("count") ?? 100, 100);
		if (count < 1) {
			await interaction.editReply("Count must be at least 1.");
			return;
		}
		if (subcommand === "user" && !targetUserId) {
			await interaction.editReply("Select a user or provide a user ID.");
			return;
		}
		if (subcommand === "user" && !/^\d{17,20}$/.test(targetUserId ?? "")) {
			await interaction.editReply("User ID must be a valid Discord user ID.");
			return;
		}

		let progressInterval: ReturnType<typeof setInterval> | undefined;
		try {
			switch (subcommand) {
				case "channel": {
					const messages = await interaction.channel.messages.fetch({
						limit: targetUser ? 100 : count === 100 ? 100 : count + 1,
						after: SnowflakeUtil.generate({ timestamp: Date.now() - 1209600000 }).toString(),
					});
					const filtered = targetUser
						? messages.filter((message) => message.author.id === targetUser.id).first(count)
						: messages;
					const deleted = await interaction.channel.bulkDelete(targetUser ? filtered : count, true);
					await interaction.editReply(`Successfully deleted ${deleted.size} messages.`);
					return;
				}

				case "user": {
					const channels = (await interaction.guild.channels.fetch()).filter(
						(channel) => channel?.isTextBased() && "messages" in channel && "permissionsFor" in channel,
					);
					const progressState: {
						startedAt: number;
						deletedMessages: number;
						scannedMessages: number;
						processedChannels: number;
						currentChannel: string;
						currentChannelScanned: number;
						currentChannelDeleted: number;
						failedMessages: number;
						currentChannelFailed: number;
						summaryMessage: Message | undefined;
						channelMessage: Message | undefined;
					} = {
						startedAt: Date.now(),
						deletedMessages: 0,
						scannedMessages: 0,
						processedChannels: 0,
						currentChannel: "Starting",
						currentChannelScanned: 0,
						currentChannelDeleted: 0,
						failedMessages: 0,
						currentChannelFailed: 0,
						summaryMessage: undefined,
						channelMessage: undefined,
					};
					const formatElapsedTime = () => {
						const elapsedSeconds = Math.floor((Date.now() - progressState.startedAt) / 1000);
						const minutes = Math.floor(elapsedSeconds / 60);
						const seconds = elapsedSeconds % 60;
						return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
					};
					const createProgressEmbed = (step: string, currentChannel: string) =>
						new EmbedBuilder()
							.setColor("Blue")
							.setTitle("Clearing user messages - Summary")
							.setTimestamp()
							.addFields(
								{ name: "Target user", value: `<@${targetUserId}> (\`${targetUserId}\`)` },
								{ name: "Step", value: `${step} (${formatElapsedTime()} elapsed)` },
								{ name: "Progress", value: `${progressState.processedChannels}/${channels.size} channels` },
								{ name: "Current channel", value: currentChannel },
								{
									name: "Message stats",
									value: `Scanned: ${progressState.scannedMessages} | Deleted: ${progressState.deletedMessages} | Failed: ${progressState.failedMessages}`,
								},
							);
					const createChannelEmbed = (
						channelName: string,
						status: string,
						scanned: number,
						deleted: number,
						failed: number,
					) =>
						new EmbedBuilder()
							.setColor(status === "Complete" ? "Green" : "Orange")
							.setTitle(`Clearing user messages - ${progressState.processedChannels}/${channels.size}`)
							.setTimestamp()
							.addFields(
								{ name: "Target user", value: `<@${targetUserId}> (\`${targetUserId}\`)` },
								{ name: "Target channel", value: channelName },
								{ name: "Status", value: status },
								{
									name: "Message stats",
									value: `Scanned: ${scanned} | Deleted: ${deleted} | Failed: ${failed}`,
								},
							);
					progressState.summaryMessage = await interaction.editReply({
						embeds: [createProgressEmbed("Preparing channel scan...", "Starting")],
					});
					progressInterval = setInterval(() => {
						void Promise.all([
							progressState.summaryMessage
								? interaction.webhook.editMessage(progressState.summaryMessage.id, {
										embeds: [createProgressEmbed("Still scanning messages...", progressState.currentChannel)],
									})
								: undefined,
							progressState.channelMessage
								? interaction.webhook.editMessage(progressState.channelMessage.id, {
										embeds: [
											createChannelEmbed(
												progressState.currentChannel,
												`Still scanning messages... (${formatElapsedTime()} elapsed)`,
												progressState.currentChannelScanned,
												progressState.currentChannelDeleted,
												progressState.currentChannelFailed,
											),
										],
									})
								: undefined,
						]).catch(() => undefined);
					}, 5000);

					for (const channel of channels.values()) {
						progressState.processedChannels += 1;
						progressState.currentChannel = channel?.name ?? "Unknown channel";
						progressState.currentChannelScanned = 0;
						progressState.currentChannelDeleted = 0;
						progressState.currentChannelFailed = 0;
						progressState.channelMessage = undefined;
						await interaction.editReply({
							embeds: [createProgressEmbed("Scanning messages...", progressState.currentChannel)],
						});
						const channelName = progressState.currentChannel;
						if (!channel?.isTextBased() || !("messages" in channel) || !("permissionsFor" in channel)) {
							continue;
						}
						const missingPermissions = channel
							.permissionsFor(interaction.client.user)
							?.missing([
								PermissionFlagsBits.ViewChannel,
								PermissionFlagsBits.ReadMessageHistory,
								PermissionFlagsBits.ManageMessages,
							]);
						if (missingPermissions && missingPermissions.length > 0) {
							clearInterval(progressInterval);
							await interaction.followUp({
								flags: MessageFlags.Ephemeral,
								embeds: [createChannelEmbed(channelName, `Stopped: missing ${missingPermissions.join(", ")}`, 0, 0, 0)],
							});
							return;
						}
						const messages = await channel.messages.fetch({ limit: 100 });
						progressState.scannedMessages += messages.size;
						progressState.currentChannelScanned = messages.size;
						if (messages.size === 0) continue;
						progressState.channelMessage = await interaction.followUp({
							flags: MessageFlags.Ephemeral,
							embeds: [createChannelEmbed(channelName, "Scanning messages...", messages.size, 0, 0)],
						});
						const messagesToDelete = [...messages.values()]
							.filter(
								(message) => message.author.id === targetUserId && message.interactionMetadata?.id !== interaction.id,
							)
							.sort((firstMessage, secondMessage) => secondMessage.createdTimestamp - firstMessage.createdTimestamp);
						for (const message of messagesToDelete) {
							try {
								await message.delete();
								progressState.deletedMessages += 1;
								progressState.currentChannelDeleted += 1;
							} catch (error: unknown) {
								progressState.failedMessages += 1;
								progressState.currentChannelFailed += 1;
								logger.warn("(/) Command : CLEAR", "Failed to delete message", {
									channel: channelName,
									messageId: message.id,
									message: error instanceof Error ? error.message : String(error),
								});
							}
						}
						await interaction.webhook.editMessage(progressState.channelMessage.id, {
							embeds: [
								createChannelEmbed(
									channelName,
									`Complete in ${formatElapsedTime()}`,
									progressState.currentChannelScanned,
									progressState.currentChannelDeleted,
									progressState.currentChannelFailed,
								),
							],
						});
					}
					clearInterval(progressInterval);
					await interaction.webhook.editMessage(progressState.summaryMessage.id, {
						embeds: [createProgressEmbed(`Complete in ${formatElapsedTime()}`, "All channels scanned")],
					});
					return;
				}

				default:
					logger.warn("(/) Command : CLEAR", `Unknown clear subcommand`, {
						subcommand,
						user: `${interaction.user.tag} <${interaction.user.id}>`,
					});
					await interaction.editReply(`Unknown clear subcommand : ${subcommand}`);
					return;
			}
		} catch (error: unknown) {
			if (progressInterval) clearInterval(progressInterval);
			await interaction.editReply("There was an error while clearing messages from this guild.");
			throw error;
		}
	},
};

export default command;
