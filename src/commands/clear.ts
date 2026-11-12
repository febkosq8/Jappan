import type { GuildBasedChannel, User } from "discord.js";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";

import { formatUserMention } from "../helpers/discord.js";
import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import {
	getClearMessageJob,
	onClearMessageJobState,
	startClearMessageJob,
	type ClearMessageJobState,
	type ClearableGuildChannel,
} from "../services/clearMessageJobs.js";
import { logger } from "../services/logger.js";

const commandData = {
	name: "clear",
	description: "Delete messages from one channel or across the guild",
	category: "moderator",
	defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
	isDBDependant: false,
	hasSubCommands: false,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.EmbedLinks,
		PermissionFlagsBits.ReadMessageHistory,
		PermissionFlagsBits.ManageMessages,
	],
} satisfies BotCommandData;

function isClearableChannel(channel: GuildBasedChannel | null): channel is ClearableGuildChannel {
	return channel !== null && channel.isTextBased() && "messages" in channel && "permissionsFor" in channel;
}

function createJobEmbed({
	state,
	jobUrl,
	targetUser,
	targetText,
}: {
	state: ClearMessageJobState;
	jobUrl: string;
	targetUser?: User;
	targetText?: string;
}) {
	const status =
		state.status === "running"
			? "Running"
			: state.status === "stopped"
				? "Stopped at the time limit"
				: state.status === "failed"
					? "Failed"
					: state.failedMessages > 0 || state.unprocessedMessages > 0 || state.errors.length > 0
						? "Finished with partial results"
						: "Complete";
	const embed = new EmbedBuilder()
		.setColor(state.status === "failed" || state.failedMessages > 0 ? "Red" : "Blue")
		.setTitle("Clear messages")
		.setDescription(`[Open live job progress](${jobUrl})`)
		.addFields(
			{ name: "Status", value: status, inline: true },
			{ name: "Overall progress", value: `${state.progressPercentage}%`, inline: true },
			{ name: "Channels", value: `${state.completedChannels}/${state.channelCount}`, inline: true },
			{
				name: "Messages",
				value: `${state.deletedMessages} deleted · ${state.failedMessages} failed`,
			},
		);
	if (targetUser) {
		embed.addFields({ name: "Target user", value: formatUserMention(targetUser), inline: true });
	}
	if (targetText) {
		embed.addFields({ name: "Text filter", value: targetText.slice(0, 1024), inline: true });
	}
	if (state.unprocessedMessages > 0) {
		embed.addFields({ name: "Not processed", value: state.unprocessedMessages.toString(), inline: true });
	}
	return embed;
}

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
			option
				.setName("count")
				.setDescription("Maximum total messages to delete; defaults to 200")
				.setRequired(false),
		)
		.addUserOption((option) =>
			option.setName("username").setDescription("Only delete messages sent by this user").setRequired(false),
		)
		.addStringOption((option) =>
			option
				.setName("text")
				.setDescription("Only delete messages containing this text (case-sensitive)")
				.setRequired(false),
		)
		.setDefaultMemberPermissions(commandData.defaultMemberPermissions)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!interaction.guild) {
			await interaction.editReply("⛔ This command can only be used in a guild.");
			return;
		}

		const selectedChannel = interaction.options.getChannel("channel");
		const targetUser = interaction.options.getUser("username");
		const targetText = interaction.options.getString("text")?.trim();
		const count = Math.floor(interaction.options.getNumber("count") ?? 200);
		if (count < 1) {
			await interaction.editReply("⛔ Count must be at least 1.");
			return;
		}

		try {
			let channels: ClearableGuildChannel[];
			if (selectedChannel) {
				const selectedGuildChannel = await interaction.guild.channels.fetch(selectedChannel.id);
				if (!isClearableChannel(selectedGuildChannel)) {
					await interaction.editReply(
						"⛔ The selected channel could not be found or cannot contain messages.",
					);
					return;
				}
				channels = [selectedGuildChannel];
			} else {
				channels = [...(await interaction.guild.channels.fetch()).values()].filter(
					(channel): channel is ClearableGuildChannel =>
						channel !== null &&
						channel.isTextBased() &&
						"messages" in channel &&
						"permissionsFor" in channel,
				);
			}
			const authorizationChannelId = interaction.channelId;
			const job = startClearMessageJob({
				guild: interaction.guild,
				channels,
				creatorDiscordId: interaction.user.id,
				authorizationChannelId,
				count,
				...(selectedChannel ? { selectedChannelId: selectedChannel.id } : {}),
				...(targetUser ? { targetUserId: targetUser.id } : {}),
				...(targetText ? { text: targetText } : {}),
				excludedInteractionId: interaction.id,
				validateChannel: (channel) => {
					const missingPermissions = channel
						.permissionsFor(interaction.client.user)
						?.missing([
							PermissionFlagsBits.ViewChannel,
							PermissionFlagsBits.ReadMessageHistory,
							PermissionFlagsBits.ManageMessages,
						]);
					return missingPermissions && missingPermissions.length > 0
						? `Missing bot permissions: ${missingPermissions.join(", ")}`
						: null;
				},
			});
			const jobUrl = new URL(`/clear-jobs/${encodeURIComponent(job.jobId)}`, config.BOT_WEBSITE).href;
			const createMessage = (state: ClearMessageJobState) => ({
				embeds: [
					createJobEmbed({
						state,
						jobUrl,
						...(targetUser ? { targetUser } : {}),
						...(targetText ? { targetText } : {}),
					}),
				],
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder().setLabel("View live progress").setURL(jobUrl).setStyle(ButtonStyle.Link),
					),
				],
			});
			await interaction.editReply(createMessage(job));

			let finalized = false;
			let stopListening: () => void = () => {};
			const finishJob = (state: ClearMessageJobState) => {
				if (finalized || state.jobId !== job.jobId || state.status === "running") return;
				finalized = true;
				stopListening();
				void interaction.editReply(createMessage(state)).catch((error: unknown) => {
					logger.warn("SLASH_COMMANDS", "Could not update clear job completion response", {
						jobId: state.jobId,
						error: error instanceof Error ? error.message : String(error),
					});
				});
			};
			stopListening = onClearMessageJobState(finishJob);
			const currentState = getClearMessageJob(job.jobId);
			if (currentState) finishJob(currentState);
		} catch (error: unknown) {
			await interaction.editReply("⛔ There was an error while starting the message clear job.");
			throw error;
		}
	},
};

export default command;
