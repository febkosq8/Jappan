import {
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	userMention,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../helpers/command.js";
import { createGuildDashboardLinkActionRow } from "../helpers/dashboard.js";

const commandData = {
	name: "evaluate-user",
	description: "Evaluate a user's access in this server",
	category: "moderator",
	defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
	isDBDependant: false,
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addUserOption((option) => option.setName("user").setDescription("User to evaluate").setRequired(true))
		.setDefaultMemberPermissions(commandData.defaultMemberPermissions)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!interaction.guild) {
			await interaction.editReply("⛔ This command can only be used in a guild.");
			return;
		}

		const user = interaction.options.getUser("user", true);
		await interaction.editReply({
			content: `Open the dashboard to evaluate ${userMention(user.id)} in this server.`,
			components: [
				createGuildDashboardLinkActionRow({
					config,
					guildId: interaction.guild.id,
					section: "evaluate-user",
					userId: user.id,
					userAccessTab: "overview",
				}),
			],
			allowedMentions: { parse: [] },
		});
	},
};

export default command;
