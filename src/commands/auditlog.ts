import {
	ChannelType,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	channelMention,
	underline,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../helpers/command.js";
import type { Config } from "../services/config.js";
import { getAuditLogStatus, setAuditLog } from "../services/auditLog.js";

const commandData = {
	name: "auditlog",
	description: "Control the audit log feature for this server",
	category: "moderator",
	isDBDependant: true,
	requiredBotPermissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
} satisfies BotCommandData;

function createStatusEmbed(
	guildName: string,
	enabled: boolean,
	channelId: string | null,
	fullVerbosity: boolean,
	config: Config,
): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(enabled ? "Green" : "Red")
		.setTitle("Audit Log Settings")
		.setDescription(`**${guildName}**`)
		.setAuthor({
			name: `${config.BOT_NAME} : Audit Log Status`,
			iconURL: config.BOT_PFP,
			url: config.BOT_WEBSITE,
		})
		.setTimestamp();

	embed.addFields(
		{
			name: `${enabled ? "✅" : "❌"} AUDIT LOG`,
			value: enabled
				? `Audit events are sent to ${channelId ? channelMention(channelId) : "the configured channel (currently unavailable)"}.`
				: "No audit events are sent.",
			inline: false,
		},
		{
			name: `${fullVerbosity ? "✅" : "⚠️"} FULL VERBOSITY`,
			value: fullVerbosity
				? "Events are logged even when details are limited."
				: "Only events with sufficient details are logged.",
			inline: false,
		},
	);

	return embed;
}

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("on")
				.setDescription("Turn on the audit log system")
				.addChannelOption((option) =>
					option
						.setName("channel")
						.setDescription("Text channel for audit events")
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(true),
				)
				.addBooleanOption((option) =>
					option
						.setName("full-verbosity")
						.setDescription("Log events even when details are limited")
						.setRequired(false),
				),
		)
		.addSubcommand((subcommand) => subcommand.setName("off").setDescription("Turn off the audit log system"))
		.addSubcommand((subcommand) => subcommand.setName("check").setDescription("Check the audit log status"))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!interaction.guild) {
			await interaction.editReply("⛔ This command can only be used in a guild.");
			return;
		}

		if (interaction.options.getSubcommand() === "on") {
			const selectedChannel = interaction.options.getChannel("channel", true);
			const channel = await interaction.guild.channels.fetch(selectedChannel.id);
			if (!channel || !channel.isTextBased()) {
				await interaction.editReply("⛔ The selected channel cannot receive messages.");
				return;
			}

			const botMember = interaction.guild.members.me;
			if (
				!botMember ||
				!botMember.permissions.has(PermissionFlagsBits.ViewAuditLog) ||
				!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
			) {
				await interaction.editReply(
					`⛔ I need ${underline("View Audit Log")}, ${underline("View Channel")}, and ${underline("Send Messages")} permissions to enable audit logging.`,
				);
				return;
			}

			const fullVerbosity = interaction.options.getBoolean("full-verbosity") ?? false;
			try {
				await setAuditLog(interaction.guild.id, interaction.guild.name, true, channel.id, fullVerbosity);
				await channel.send({ content: "Audit log events are enabled for this channel." });
			} catch {
				await setAuditLog(interaction.guild.id, interaction.guild.name, false, null, false).catch(() => undefined);
				await interaction.editReply("⛔ I could not send the confirmation message, so audit logging was not enabled.");
				return;
			}
		}

		if (interaction.options.getSubcommand() === "off") {
			await setAuditLog(interaction.guild.id, interaction.guild.name, false, null, false);
		}

		const status = await getAuditLogStatus(interaction.guild.id, interaction.guild.name);
		await interaction.editReply({
			embeds: [
				createStatusEmbed(
					status.guildName,
					status.auditLog.enabled,
					status.auditLog.channelId ?? null,
					status.auditLog.fullVerbosity,
					config,
				),
			],
		});
	},
};

export default command;
