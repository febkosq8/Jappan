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
import { getMemberAnnouncementStatus, setMemberAnnouncement } from "../services/memberAnnouncement.js";

const commandData = {
	name: "memberannounce",
	description: "Control member join and leave announcements for this server",
	category: "moderator",
	isDBDependant: true,
	requiredBotPermissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
} satisfies BotCommandData;

function createStatusEmbed({
	guildName,
	joinEnabled,
	joinChannelId,
	leaveEnabled,
	leaveChannelId,
	config,
}: {
	guildName: string;
	joinEnabled: boolean;
	joinChannelId: string | null;
	leaveEnabled: boolean;
	leaveChannelId: string | null;
	config: Config;
}): EmbedBuilder {
	const formatStatus = (enabled: boolean, channelId: string | null, action: "joins" | "leaves"): string =>
		enabled
			? `When a member ${action}, an announcement is sent to ${channelId ? channelMention(channelId) : "the configured channel (currently unavailable)"}.`
			: `When a member ${action}, nothing is sent.`;

	const embed = new EmbedBuilder()
		.setColor(joinEnabled || leaveEnabled ? "Green" : "Red")
		.setTitle("Member Announcement Settings")
		.setDescription(`**${guildName}**`)
		.setAuthor({
			name: `${config.BOT_NAME} : Member Announcement Status`,
			iconURL: config.BOT_PFP,
			url: config.BOT_WEBSITE,
		})
		.setTimestamp();

	embed.addFields(
		{
			name: `${joinEnabled ? "✅" : "❌"} JOIN`,
			value: formatStatus(joinEnabled, joinChannelId, "joins"),
			inline: false,
		},
		{
			name: `${leaveEnabled ? "✅" : "❌"} LEAVE`,
			value: formatStatus(leaveEnabled, leaveChannelId, "leaves"),
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
				.setDescription("Turn on one member announcement direction")
				.addStringOption((option) =>
					option
						.setName("event")
						.setDescription("Member direction to announce")
						.addChoices(
							{ name: "Member joins", value: "join" },
							{ name: "Member leaves", value: "leave" },
							{ name: "Both", value: "both" },
						)
						.setRequired(true),
				)
				.addChannelOption((option) =>
					option
						.setName("join-channel")
						.setDescription("Channel for member join announcements")
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(false),
				)
				.addChannelOption((option) =>
					option
						.setName("leave-channel")
						.setDescription("Channel for member leave announcements")
						.addChannelTypes(ChannelType.GuildText)
						.setRequired(false),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("off")
				.setDescription("Turn off one member announcement direction")
				.addStringOption((option) =>
					option
						.setName("event")
						.setDescription("Member direction to stop announcing")
						.addChoices(
							{ name: "Member joins", value: "join" },
							{ name: "Member leaves", value: "leave" },
							{ name: "Both", value: "both" },
						)
						.setRequired(true),
				),
		)
		.addSubcommand((subcommand) => subcommand.setName("check").setDescription("Check member announcement status"))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!interaction.guild) {
			await interaction.editReply("⛔ This command can only be used in a guild.");
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		if (subcommand === "on") {
			const event = interaction.options.getString("event", true) as "join" | "leave" | "both";
			const joinChannel = interaction.options.getChannel("join-channel");
			const leaveChannel = interaction.options.getChannel("leave-channel");
			if (
				(event === "join" && !joinChannel) ||
				(event === "leave" && !leaveChannel) ||
				(event === "both" && (!joinChannel || !leaveChannel))
			) {
				await interaction.editReply(
					event === "both"
						? "⛔ Select both an IN channel and an OUT channel."
						: `⛔ Select a ${event === "join" ? "join" : "leave"} channel.`,
				);
				return;
			}

			const selectedChannels =
				event === "join"
					? [{ event: "join" as const, selectedChannel: joinChannel! }]
					: event === "leave"
						? [{ event: "leave" as const, selectedChannel: leaveChannel! }]
						: [
								{ event: "join" as const, selectedChannel: joinChannel! },
								{ event: "leave" as const, selectedChannel: leaveChannel! },
							];
			const channels = [];
			for (const { event: selectedEvent, selectedChannel } of selectedChannels) {
				const direction = selectedEvent === "join" ? "join" : "leave";
				const selectedChannelMention = channelMention(selectedChannel.id);
				const channel = await interaction.guild.channels.fetch(selectedChannel.id);
				if (!channel) {
					await interaction.editReply(
						`⛔ The selected ${direction} channel ${selectedChannelMention} could not be found.`,
					);
					return;
				}
				if (!channel.isTextBased()) {
					await interaction.editReply(
						`⛔ The selected ${direction} channel ${selectedChannelMention} cannot receive messages.`,
					);
					return;
				}

				const botMember = interaction.guild.members.me;
				if (
					!botMember ||
					!channel
						.permissionsFor(botMember)
						?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
				) {
					await interaction.editReply(
						`⛔ I do not have permission to view and send messages in the selected ${direction} channel ${selectedChannelMention}.`,
					);
					return;
				}
				channels.push({ event: selectedEvent, channel });
			}

			for (const { event: selectedEvent, channel } of channels) {
				await setMemberAnnouncement({
					guildId: interaction.guild.id,
					guildName: interaction.guild.name,
					event: selectedEvent,
					enabled: true,
					channelId: channel.id,
				});
				const announcementType = selectedEvent;
				const selectedChannelMention = channelMention(channel.id);
				await channel.send({
					content: `Member ${announcementType} announcements are now enabled for this server. Future member ${announcementType} events will be posted here in ${selectedChannelMention}.`,
				});
			}
		}

		if (subcommand === "off") {
			const event = interaction.options.getString("event", true) as "join" | "leave" | "both";
			await setMemberAnnouncement({
				guildId: interaction.guild.id,
				guildName: interaction.guild.name,
				event,
				enabled: false,
			});
		}

		const status = await getMemberAnnouncementStatus(interaction.guild);
		await interaction.editReply({
			embeds: [
				createStatusEmbed({
					guildName: interaction.guild.name,
					joinEnabled: status.joinEnabled,
					joinChannelId: status.joinChannelId ?? null,
					leaveEnabled: status.leaveEnabled,
					leaveChannelId: status.leaveChannelId ?? null,
					config,
				}),
			],
		});
	},
};

export default command;
