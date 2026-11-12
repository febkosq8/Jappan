import type { EmbedAuthorOptions, User } from "discord.js";
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

import { formatChannelMention, formatUserMention } from "../helpers/discord.js";
import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import {
	getClearMessageJob,
	onClearMessageJobState,
	createClearMessageJob,
	isClearMessageJobTerminal,
	type ClearMessageJobState,
	type ClearableGuildChannel,
} from "../services/clearMessageJobs.js";
import { getClearChannelPermissionError, isClearableGuildChannel } from "../services/clearMessagePreviews.js";
import { logger } from "../services/logger.js";
import { ClearMessageTextFilterError, clearMessageTextFilterMaxLength } from "../services/clearMessageTextFilter.js";

const commandData = {
	name: "clear",
	description: "Create a message clear job to preview and confirm on the web",
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

function createJobEmbed({
	state,
	jobUrl,
	targetUser,
	author,
}: {
	state: ClearMessageJobState;
	jobUrl: string;
	targetUser?: User;
	author: EmbedAuthorOptions;
}) {
	const status =
		state.status === "awaiting_preview"
			? "Awaiting web preview"
			: state.status === "previewing"
				? "Preparing web preview"
				: state.status === "awaiting_confirmation"
					? "Awaiting web confirmation"
					: state.status === "cancelled"
						? "Cancelled"
						: state.status === "running"
							? "Running"
							: state.status === "stopped"
								? "Stopped at the time limit"
								: state.status === "failed"
									? "Failed"
									: state.failedMessages > 0 ||
										  state.unprocessedMessages > 0 ||
										  state.errors.length > 0
										? "Finished with partial results"
										: "Complete";
	const embed = new EmbedBuilder()
		.setColor(state.status === "failed" || state.failedMessages > 0 ? "Red" : "Blue")
		.setTitle("Clear messages")
		.setAuthor(author)
		.setTimestamp()
		.setDescription(`[Open job page](${jobUrl})`)
		.addFields(
			{ name: "Status", value: status, inline: true },
			{
				name: "Channel scope",
				value: state.selectedChannelId
					? formatChannelMention({ id: state.selectedChannelId, name: state.channelName })
					: "All guild channels",
				inline: true,
			},
			{ name: "Maximum requested", value: state.messageLimit.toString(), inline: true },
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
	if (state.textFilter) {
		embed.addFields(
			{
				name: state.regex ? "Regex filter" : "Text filter",
				value: state.textFilter.slice(0, 1024),
				inline: true,
			},
			{ name: "Matching", value: state.ignoreCase ? "Ignore case" : "Case-sensitive", inline: true },
		);
	}
	if (state.unprocessedMessages > 0) {
		embed.addFields({ name: "Remaining", value: state.unprocessedMessages.toString(), inline: true });
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
				.setDescription("Maximum total messages to delete (1-200); defaults to 200")
				.setMinValue(1)
				.setMaxValue(200)
				.setRequired(false),
		)
		.addUserOption((option) =>
			option.setName("username").setDescription("Only delete messages sent by this user").setRequired(false),
		)
		.addStringOption((option) =>
			option
				.setName("text")
				.setDescription("Text to match, or an RE2 pattern when regex is enabled")
				.setMaxLength(clearMessageTextFilterMaxLength)
				.setRequired(false),
		)
		.addBooleanOption((option) =>
			option
				.setName("regex")
				.setDescription("Treat text as a safe RE2 regex; defaults to false")
				.setRequired(false),
		)
		.addBooleanOption((option) =>
			option
				.setName("ignore-case")
				.setDescription("Ignore case when matching text or regex; defaults to false")
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
		const targetText = interaction.options.getString("text");
		const regex = interaction.options.getBoolean("regex") ?? false;
		const ignoreCase = interaction.options.getBoolean("ignore-case") ?? false;
		const count = Math.floor(interaction.options.getNumber("count") ?? 200);
		if (!Number.isFinite(count) || count < 1 || count > 200) {
			await interaction.editReply("⛔ Count must be between 1 and 200.");
			return;
		}

		try {
			let channels: ClearableGuildChannel[];
			if (selectedChannel) {
				const selectedGuildChannel = await interaction.guild.channels.fetch(selectedChannel.id);
				if (!isClearableGuildChannel(selectedGuildChannel)) {
					await interaction.editReply(
						"⛔ The selected channel could not be found or cannot contain messages.",
					);
					return;
				}
				channels = [selectedGuildChannel];
			} else {
				channels = [...(await interaction.guild.channels.fetch()).values()].filter(isClearableGuildChannel);
			}
			const member = await interaction.guild.members.fetch(interaction.user.id);
			const botMember = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
			const author = { name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE };
			const validateChannel = (channel: ClearableGuildChannel) =>
				getClearChannelPermissionError({
					channel,
					member,
					botMember,
					isBotAdministrator: false,
				});
			if (selectedChannel && channels[0]) {
				const error = validateChannel(channels[0]);
				if (error) {
					await interaction.editReply(`⛔ ${error}`);
					return;
				}
			}
			channels = channels.filter((channel) => validateChannel(channel) === null);
			const job = createClearMessageJob({
				guild: interaction.guild,
				channels,
				creatorDiscordId: interaction.user.id,
				count,
				...(selectedChannel ? { selectedChannelId: selectedChannel.id } : {}),
				...(targetUser ? { targetUserId: targetUser.id } : {}),
				...(targetText !== null ? { text: targetText } : {}),
				regex,
				ignoreCase,
				excludedInteractionId: interaction.id,
			});
			const jobUrl = new URL(`/clear-jobs/${encodeURIComponent(job.jobId)}`, config.BOT_WEBSITE).href;
			const createMessage = (state: ClearMessageJobState) => ({
				embeds: [
					createJobEmbed({
						state,
						jobUrl,
						author,
						...(targetUser ? { targetUser } : {}),
					}),
				],
				components: [
					new ActionRowBuilder<ButtonBuilder>().addComponents(
						new ButtonBuilder().setLabel("Open job page").setURL(jobUrl).setStyle(ButtonStyle.Link),
					),
				],
			});
			await interaction.editReply(createMessage(job));
			let started = false;
			let finalized = false;
			let stopListening: () => void = () => {};
			const updateMessage = (state: ClearMessageJobState) => {
				if (state.jobId !== job.jobId || finalized) return;
				const terminal = isClearMessageJobTerminal(state.status);
				if (!terminal && (state.status !== "running" || started)) return;
				started ||= state.status === "running";
				finalized = terminal;
				if (terminal) stopListening();
				void interaction.editReply(createMessage(state)).catch((error: unknown) => {
					logger.warn("SLASH_COMMANDS", "Could not update clear job response", {
						jobId: state.jobId,
						error: error instanceof Error ? error.message : String(error),
					});
				});
			};
			stopListening = onClearMessageJobState(updateMessage);
			const currentState = getClearMessageJob(job.jobId);
			if (currentState) updateMessage(currentState);
		} catch (error: unknown) {
			if (error instanceof ClearMessageTextFilterError) {
				logger.warn("SLASH_COMMANDS", "Invalid clear message text filter", {
					guildId: interaction.guild.id,
					userId: interaction.user.id,
					error: error.message,
				});
				await interaction.editReply(`⛔ ${error.message}`);
				return;
			}
			await interaction.editReply("⛔ There was an error while creating the message clear job.");
			throw error;
		}
	},
};

export default command;
