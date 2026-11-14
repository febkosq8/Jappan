import type {
	ChatInputCommandInteraction,
	EmbedAuthorOptions,
	MessageContextMenuCommandInteraction,
	ModalSubmitInteraction,
	User,
} from "discord.js";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelSelectMenuBuilder,
	ChannelType,
	EmbedBuilder,
	InteractionContextType,
	LabelBuilder,
	ModalBuilder,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	TextInputBuilder,
	TextInputStyle,
	userMention,
} from "discord.js";

import { formatChannelMention, formatUserMention } from "../helpers/discord.js";
import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import {
	getPurgeMessageJob,
	onPurgeMessageJobState,
	createPurgeMessageJob,
	isPurgeMessageJobTerminal,
	PurgeMessageJobActionError,
	type PurgeMessageJobState,
	type PurgeableGuildChannel,
} from "../services/purgeMessageJobs.js";
import {
	getPurgeChannelPermissionError,
	getPurgeMessageEmbedContent,
	isPurgeableGuildChannel,
	purgeableChannelTypes,
} from "../services/purgeMessagePreviews.js";
import { logger } from "../services/logger.js";
import { PurgeMessageTextFilterError, purgeMessageTextFilterMaxLength } from "../services/purgeMessageTextFilter.js";
import type { Config } from "../services/config.js";

export const purgeMessageJobModalCustomIdPrefix = "create-purge-job";

const purgeJobModalInputIds = {
	user: "purge-job-user",
	text: "purge-job-text",
	count: "purge-job-count",
	channel: "purge-job-channel",
} as const;

type PurgeMessageInteraction =
	ChatInputCommandInteraction | MessageContextMenuCommandInteraction | ModalSubmitInteraction;

async function createPurgeJob({
	interaction,
	config,
	selectedChannelId,
	targetUser,
	targetUserId,
	targetText,
	regex = false,
	ignoreCase = false,
	count = 200,
	requireManageGuild = false,
}: {
	interaction: PurgeMessageInteraction;
	config: Config;
	selectedChannelId?: string;
	targetUser?: User;
	targetUserId?: string;
	targetText?: string;
	regex?: boolean;
	ignoreCase?: boolean;
	count?: number;
	requireManageGuild?: boolean;
}): Promise<void> {
	await interaction.deferReply({ flags: MessageFlags.Ephemeral });
	if (!interaction.guild) {
		await interaction.editReply("⛔ This command can only be used in a guild.");
		return;
	}
	if (requireManageGuild && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.editReply("⛔ You need the Manage Server permission to use this action.");
		return;
	}
	if (!Number.isFinite(count) || count < 1 || count > 200) {
		await interaction.editReply("⛔ Count must be between 1 and 200.");
		return;
	}

	try {
		let channels: PurgeableGuildChannel[];
		if (selectedChannelId) {
			const selectedGuildChannel = await interaction.guild.channels.fetch(selectedChannelId);
			if (!isPurgeableGuildChannel(selectedGuildChannel)) {
				await interaction.editReply("⛔ The selected channel could not be found or cannot contain messages.");
				return;
			}
			channels = [selectedGuildChannel];
		} else {
			channels = [...(await interaction.guild.channels.fetch()).values()].filter(isPurgeableGuildChannel);
		}
		const member = await interaction.guild.members.fetch(interaction.user.id);
		const botMember = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
		const author = { name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE };
		const validateChannel = (channel: PurgeableGuildChannel) =>
			getPurgeChannelPermissionError({
				channel,
				member,
				botMember,
				isBotAdministrator: false,
			});
		if (selectedChannelId && channels[0]) {
			const error = validateChannel(channels[0]);
			if (error) {
				await interaction.editReply(`⛔ ${error}`);
				return;
			}
		}
		channels = channels.filter((channel) => validateChannel(channel) === null);
		const job = createPurgeMessageJob({
			guild: interaction.guild,
			channels,
			creatorDiscordId: interaction.user.id,
			count,
			...(selectedChannelId ? { selectedChannelId } : {}),
			...(targetUser ? { targetUserId: targetUser.id } : targetUserId ? { targetUserId } : {}),
			...(targetText !== undefined ? { text: targetText } : {}),
			regex,
			ignoreCase,
			excludedInteractionId: interaction.id,
		});
		const jobUrl = new URL(`/purge-jobs/${encodeURIComponent(job.jobId)}`, config.BOT_WEBSITE).href;
		const createMessage = (state: PurgeMessageJobState) => ({
			embeds: [
				createJobEmbed({
					state,
					author,
					...(targetUser ? { targetUser } : {}),
					...(targetUserId ? { targetUserId } : {}),
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
		const updateMessage = (state: PurgeMessageJobState) => {
			if (state.jobId !== job.jobId || finalized) return;
			const terminal = isPurgeMessageJobTerminal(state.status);
			if (!terminal && state.status !== "awaiting_confirmation" && (state.status !== "running" || started)) {
				return;
			}
			started ||= state.status === "running";
			finalized = terminal;
			if (terminal) stopListening();
			void interaction.editReply(createMessage(state)).catch((error: unknown) => {
				logger.warn("SLASH_COMMANDS", "Could not update purge job response", {
					jobId: state.jobId,
					error: error instanceof Error ? error.message : String(error),
				});
			});
		};
		stopListening = onPurgeMessageJobState(updateMessage);
		const currentState = getPurgeMessageJob(job.jobId);
		if (currentState) updateMessage(currentState);
	} catch (error: unknown) {
		if (error instanceof PurgeMessageJobActionError) {
			await interaction.editReply(`⛔ ${error.message}`);
			return;
		}
		if (error instanceof PurgeMessageTextFilterError) {
			logger.warn("SLASH_COMMANDS", "Invalid purge message text filter", {
				guildId: interaction.guild.id,
				userId: interaction.user.id,
				error: error.message,
			});
			await interaction.editReply(`⛔ ${error.message}`);
			return;
		}
		await interaction.editReply("⛔ There was an error while creating the message purge job.");
		throw error;
	}
}

const commandData = {
	name: "purge-messages",
	description: "Create a purge job to preview and confirm message deletion on the web",
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
	targetUser,
	targetUserId,
	author,
}: {
	state: PurgeMessageJobState;
	targetUser?: User;
	targetUserId?: string;
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
	const deletionHasStarted =
		["running", "complete", "stopped"].includes(state.status) ||
		(state.status === "failed" && state.messagesToDelete > 0);
	const stage = deletionHasStarted ? "Message deletion" : "Web preview";
	const embed = new EmbedBuilder()
		.setColor(state.status === "failed" || state.failedMessages > 0 ? "Red" : "Blue")
		.setTitle("Purge messages")
		.setAuthor(author)
		.setTimestamp()
		.addFields(
			{ name: "Status", value: status, inline: true },
			{ name: "Stage", value: stage, inline: true },
			{
				name: "Channel scope",
				value: state.selectedChannelId
					? formatChannelMention({ id: state.selectedChannelId, name: state.channelName })
					: "All guild channels",
				inline: true,
			},
			{ name: "Maximum requested", value: state.messageLimit.toString(), inline: true },
			{ name: `${stage} progress`, value: `${state.progressPercentage}%`, inline: true },
			{ name: "Channels", value: `${state.completedChannels}/${state.channelCount}`, inline: true },
			{
				name: "Messages",
				value: `${state.deletedMessages} deleted · ${state.failedMessages} failed`,
			},
		);
	const targetUserMention = targetUser
		? formatUserMention(targetUser)
		: targetUserId
			? userMention(targetUserId)
			: null;
	if (targetUserMention) {
		embed.addFields({ name: "Target user", value: targetUserMention, inline: true });
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
				.setMaxLength(purgeMessageTextFilterMaxLength)
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
		const selectedChannel = interaction.options.getChannel("channel");
		const targetUser = interaction.options.getUser("username");
		const targetText = interaction.options.getString("text");
		await createPurgeJob({
			interaction,
			config,
			...(selectedChannel ? { selectedChannelId: selectedChannel.id } : {}),
			...(targetUser ? { targetUser } : {}),
			...(targetText !== null ? { targetText } : {}),
			regex: interaction.options.getBoolean("regex") ?? false,
			ignoreCase: interaction.options.getBoolean("ignore-case") ?? false,
			count: Math.floor(interaction.options.getNumber("count") ?? 200),
		});
	},
};

export async function showPurgeMessageJobModal({
	interaction,
}: {
	interaction: MessageContextMenuCommandInteraction;
}): Promise<void> {
	if (!interaction.guildId) {
		await interaction.reply({
			content: "⛔ This action can only be used in a guild.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}
	if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
		await interaction.reply({
			content: "⛔ You need the Manage Server permission to use this action.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	const targetMessage = interaction.targetMessage;
	const userInput = new TextInputBuilder()
		.setCustomId(purgeJobModalInputIds.user)
		.setPlaceholder("Leave blank to match any user")
		.setStyle(TextInputStyle.Short)
		.setRequired(false)
		.setMaxLength(25)
		.setValue(`<@${targetMessage.author.id}>`);
	const textInput = new TextInputBuilder()
		.setCustomId(purgeJobModalInputIds.text)
		.setPlaceholder("Leave blank to match any content")
		.setStyle(TextInputStyle.Paragraph)
		.setRequired(false)
		.setMaxLength(purgeMessageTextFilterMaxLength);
	const targetContent =
		targetMessage.content ||
		getPurgeMessageEmbedContent(targetMessage)
			.filter((content): content is string => content !== null)
			.join("\n");
	if (targetContent) {
		textInput.setValue(targetContent.slice(0, purgeMessageTextFilterMaxLength));
	}
	const countInput = new TextInputBuilder()
		.setCustomId(purgeJobModalInputIds.count)
		.setStyle(TextInputStyle.Short)
		.setRequired(true)
		.setMinLength(1)
		.setMaxLength(3)
		.setValue("200");
	const channelSelect = new ChannelSelectMenuBuilder()
		.setCustomId(purgeJobModalInputIds.channel)
		.setPlaceholder("All channels")
		.setMaxValues(1)
		.setRequired(false)
		.setChannelTypes(...purgeableChannelTypes);
	const modal = new ModalBuilder()
		.setCustomId(`${purgeMessageJobModalCustomIdPrefix}:${interaction.guildId}`)
		.setTitle("Create purge job")
		.addLabelComponents(
			new LabelBuilder()
				.setLabel("User (mention or ID)")
				.setDescription("Optional. Leave blank to match any user.")
				.setTextInputComponent(userInput),
			new LabelBuilder()
				.setLabel("Message content")
				.setDescription("Optional. Leave blank to match any content.")
				.setTextInputComponent(textInput),
			new LabelBuilder()
				.setLabel("Maximum messages to purge")
				.setDescription("Enter a number from 1 to 200.")
				.setTextInputComponent(countInput),
			new LabelBuilder()
				.setLabel("Channel")
				.setDescription("Optional. Leave unselected to include all accessible channels.")
				.setChannelSelectMenuComponent(channelSelect),
		);
	await interaction.showModal(modal);
}

export async function executePurgeMessageJobModal({
	interaction,
	config,
	selectedChannelId,
	targetUserId,
	targetText,
	count,
}: {
	interaction: ModalSubmitInteraction;
	config: Config;
	selectedChannelId?: string;
	targetUserId?: string;
	targetText?: string;
	count: number;
}): Promise<void> {
	await createPurgeJob({
		interaction,
		config,
		...(selectedChannelId ? { selectedChannelId } : {}),
		...(targetUserId ? { targetUserId } : {}),
		...(targetText !== undefined ? { targetText } : {}),
		count,
		requireManageGuild: true,
	});
}

export default command;
