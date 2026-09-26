import {
	ChannelType,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	channelMention,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../helpers/command.js";
import type { Config } from "../services/config.js";
import {
	getWarningCount,
	getWarningSettings,
	issueWarning,
	overrideWarningCount,
	setWarningSettings,
} from "../services/warnings.js";

const commandData = {
	name: "warn",
	description: "Manage warnings for this server",
	category: "moderator",
	isDBDependant: true,
	requiredBotPermissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
} satisfies BotCommandData;

function formatThreshold(value: number | null | undefined): string {
	return value ? `✅ ${value} warning(s)` : "❌ Disabled";
}

function createSettingsEmbed(
	guildName: string,
	timeoutThreshold: number | null | undefined,
	timeoutDurationHours: number | null | undefined,
	banThreshold: number | null | undefined,
	auditChannelId: string | null | undefined,
	config: Config,
): EmbedBuilder {
	return new EmbedBuilder()
		.setColor("Blurple")
		.setTitle("Warning Settings")
		.setDescription(`**${guildName}**`)
		.setAuthor({ name: `${config.BOT_NAME} : Warning Status`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.addFields(
			{ name: "TIMEOUT THRESHOLD", value: formatThreshold(timeoutThreshold), inline: true },
			{
				name: "TIMEOUT DURATION",
				value: timeoutDurationHours ? `✅ ${timeoutDurationHours} hour(s)` : "❌ Disabled",
				inline: true,
			},
			{ name: "BAN THRESHOLD", value: formatThreshold(banThreshold), inline: true },
			{
				name: "AUDIT CHANNEL",
				value: auditChannelId ? channelMention(auditChannelId) : "❌ Disabled",
				inline: false,
			},
		)
		.setTimestamp();
}

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("setup")
				.setDescription("Configure warning thresholds and audit logging")
				.addIntegerOption((option) =>
					option.setName("timeout").setDescription("Warnings before timeout; omit to disable").setMinValue(1),
				)
				.addIntegerOption((option) =>
					option
						.setName("timeoutduration")
						.setDescription("Timeout duration in hours")
						.addChoices(
							{ name: "1 Hour", value: 1 },
							{ name: "12 Hours", value: 12 },
							{ name: "1 Day", value: 24 },
							{ name: "1 Week", value: 168 },
						)
						.setRequired(false),
				)
				.addIntegerOption((option) =>
					option.setName("ban").setDescription("Warnings before ban; omit to disable").setMinValue(1),
				)
				.addChannelOption((option) =>
					option
						.setName("channel")
						.setDescription("Channel for warning audit events")
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(false),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("issue")
				.setDescription("Issue a warning to a user")
				.addUserOption((option) => option.setName("user").setDescription("User to warn").setRequired(true))
				.addStringOption((option) =>
					option.setName("reason").setDescription("Reason for the warning").setRequired(false),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("check")
				.setDescription("Check warning settings or a user's warning count")
				.addUserOption((option) => option.setName("user").setDescription("User to check").setRequired(false)),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("override")
				.setDescription("Override a user's warning count")
				.addUserOption((option) => option.setName("user").setDescription("User to update").setRequired(true))
				.addIntegerOption((option) =>
					option.setName("count").setDescription("New warning count").setMinValue(0).setRequired(true),
				),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!interaction.guild) {
			await interaction.editReply("This command can only be used in a guild.");
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		if (subcommand === "setup") {
			const timeoutThreshold = interaction.options.getInteger("timeout");
			const timeoutDurationHours = interaction.options.getInteger("timeoutduration");
			const banThreshold = interaction.options.getInteger("ban");
			const selectedChannel = interaction.options.getChannel("channel");
			if (timeoutThreshold !== null && timeoutDurationHours === null) {
				await interaction.editReply("Select a timeout duration when enabling the timeout threshold.");
				return;
			}
			if (selectedChannel) {
				const channel = await interaction.guild.channels.fetch(selectedChannel.id);
				const botMember = interaction.guild.members.me;
				if (
					!channel ||
					!channel.isTextBased() ||
					!botMember ||
					!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
				) {
					await interaction.editReply(`I cannot use ${channelMention(selectedChannel.id)} for warning audit events.`);
					return;
				}
			}
			await setWarningSettings(
				interaction.guild.id,
				interaction.guild.name,
				timeoutThreshold,
				timeoutThreshold === null ? null : timeoutDurationHours,
				banThreshold,
				selectedChannel?.id ?? null,
			);
		}

		if (subcommand === "issue") {
			const user = interaction.options.getUser("user", true);
			const member = await interaction.guild.members.fetch(user.id);
			if (!member.manageable || !member.moderatable || !member.bannable) {
				await interaction.editReply(
					`I cannot moderate ${user}. Their role is higher than mine or they are the server owner.`,
				);
				return;
			}
			const reason = interaction.options.getString("reason") ?? "No reason provided";
			const state = await issueWarning(interaction.guild.id, user.id, user.username);
			const settings = await getWarningSettings(interaction.guild.id, interaction.guild.name);
			if (settings.warnings.auditChannelId) {
				const auditChannel = await interaction.guild.channels.fetch(settings.warnings.auditChannelId);
				if (auditChannel?.isTextBased()) {
					await auditChannel.send({
						embeds: [
							new EmbedBuilder()
								.setColor("DarkButNotBlack")
								.setTitle("Warning Issued")
								.addFields(
									{ name: "User", value: `${user}`, inline: true },
									{ name: "Total Warnings", value: `${state.warnings.count}`, inline: true },
									{ name: "Reason", value: reason },
									{ name: "Issued By", value: `${interaction.user}` },
								)
								.setTimestamp(),
						],
					});
				}
			}
			if (settings.warnings.banThreshold && state.warnings.count >= settings.warnings.banThreshold) {
				await member.ban({ reason: `Warning threshold reached: ${reason}` });
				await interaction.editReply(`${user} was warned and banned after reaching ${state.warnings.count} warnings.`);
				return;
			}
			if (
				settings.warnings.timeoutThreshold &&
				settings.warnings.timeoutDurationHours &&
				state.warnings.count >= settings.warnings.timeoutThreshold
			) {
				await member.timeout(
					settings.warnings.timeoutDurationHours * 60 * 60 * 1000,
					`Warning threshold reached: ${reason}`,
				);
				await interaction.editReply(
					`${user} was warned and timed out after reaching ${state.warnings.count} warnings.`,
				);
				return;
			}
			await interaction.editReply(`Warning issued to ${user}. Total warnings: ${state.warnings.count}.`);
		}

		if (subcommand === "check") {
			const user = interaction.options.getUser("user");
			if (user) {
				await interaction.editReply(
					`${user} currently has ${await getWarningCount(interaction.guild.id, user.id)} warning(s).`,
				);
				return;
			}
			const status = await getWarningSettings(interaction.guild.id, interaction.guild.name);
			await interaction.editReply({
				embeds: [
					createSettingsEmbed(
						status.guildName,
						status.warnings.timeoutThreshold,
						status.warnings.timeoutDurationHours,
						status.warnings.banThreshold,
						status.warnings.auditChannelId,
						config,
					),
				],
			});
			return;
		}

		if (subcommand === "override") {
			const user = interaction.options.getUser("user", true);
			const count = interaction.options.getInteger("count", true);
			await overrideWarningCount(interaction.guild.id, user.id, user.username, count);
			await interaction.editReply(`Warning count for ${user} is now ${count}.`);
		}
	},
};

export default command;
