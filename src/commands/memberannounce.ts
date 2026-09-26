import {
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../helpers/command.js";
import type { Config } from "../services/config.js";
import {
	getAnnouncementChannelMention,
	getMemberAnnouncementStatus,
	setMemberAnnouncement,
} from "../services/memberAnnouncement.js";

const commandData = {
	name: "memberannounce",
	description: "Control member join and leave announcements for this server",
	category: "moderator",
	isDBDependant: true,
	requiredBotPermissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
} satisfies BotCommandData;

function createStatusEmbed(
	guildName: string,
	joinEnabled: boolean,
	joinChannelId: string | null,
	leaveEnabled: boolean,
	leaveChannelId: string | null,
	config: Config,
): EmbedBuilder {
	const formatStatus = (enabled: boolean, channelId: string | null, action: "joins" | "leaves"): string =>
		enabled
			? `When a member ${action}, an announcement is sent to ${getAnnouncementChannelMention(channelId) ?? "the configured channel (currently unavailable)"}.`
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
			name: `${joinEnabled ? "✅" : "❌"} IN`,
			value: formatStatus(joinEnabled, joinChannelId, "joins"),
			inline: false,
		},
		{
			name: `${leaveEnabled ? "✅" : "❌"} OUT`,
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
						.addChoices({ name: "Member joins", value: "in" }, { name: "Member leaves", value: "out" })
						.setRequired(true),
				)
				.addChannelOption((option) =>
					option.setName("channel").setDescription("Text channel for member announcements").setRequired(true),
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
						.addChoices({ name: "Member joins", value: "in" }, { name: "Member leaves", value: "out" })
						.setRequired(true),
				),
		)
		.addSubcommand((subcommand) => subcommand.setName("check").setDescription("Check member announcement status"))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!interaction.guild) {
			await interaction.editReply("This command can only be used in a guild.");
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		if (subcommand === "on") {
			const event = interaction.options.getString("event", true) as "in" | "out";
			const selectedChannel = interaction.options.getChannel("channel", true);
			const channel = await interaction.guild.channels.fetch(selectedChannel.id);
			if (!channel) {
				await interaction.editReply("The selected channel could not be found.");
				return;
			}
			if (!channel.isTextBased()) {
				await interaction.editReply("The selected channel cannot receive messages.");
				return;
			}

			const botMember = interaction.guild.members.me;
			if (
				!botMember ||
				!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages])
			) {
				await interaction.editReply("I do not have permission to view and send messages in that channel.");
				return;
			}

			await setMemberAnnouncement(interaction.guild.id, interaction.guild.name, event, true, channel.id);
			await channel.send({ content: `${event === "in" ? "Member join" : "Member leave"} announcements are enabled.` });
		}

		if (subcommand === "off") {
			const event = interaction.options.getString("event", true) as "in" | "out";
			await setMemberAnnouncement(interaction.guild.id, interaction.guild.name, event, false);
		}

		const status = await getMemberAnnouncementStatus(interaction.guild.id, interaction.guild.name);
		await interaction.editReply({
			embeds: [
				createStatusEmbed(
					status.guildName,
					status.memberAnnouncements.joinEnabled,
					status.memberAnnouncements.joinChannelId ?? null,
					status.memberAnnouncements.leaveEnabled,
					status.memberAnnouncements.leaveChannelId ?? null,
					config,
				),
			],
		});
	},
};

export default command;
