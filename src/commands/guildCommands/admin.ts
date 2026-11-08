import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, underline } from "discord.js";

import type { BotCommand, BotCommandData } from "../../helpers/command.js";
import { formatUserMention } from "../../helpers/discord.js";

const commandData = {
	name: "admin",
	description: "View the bot administrators",
	category: "admin",
	defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
	isDBDependant: false,
	hasSubCommands: true,
	subCommands: [{ name: "list-admins", description: "List the configured bot administrators", category: "admin" }],
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand.setName("list-admins").setDescription("List the configured bot administrators"),
		)
		.setDefaultMemberPermissions(commandData.defaultMemberPermissions)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
			await interaction.reply({
				content: `⛔ You need ${underline("Manage Server")} permission to use this command.`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (interaction.options.getSubcommand() !== "list-admins") {
			await interaction.reply({ content: "⛔ Unsupported admin subcommand.", flags: MessageFlags.Ephemeral });
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const adminIds = [...new Set(config.ADMIN_USER_IDS)];
		const title = `Bot administrators (${adminIds.length})`;
		if (adminIds.length === 0) {
			await interaction.editReply(`**${title}**\nNo bot administrators are configured.`);
			return;
		}

		const pages: string[] = [];
		let page = `**${title}**`;
		for (const userId of adminIds) {
			const user = await interaction.client.users.fetch(userId);
			const entry = `\n- ${formatUserMention(user)}`;
			if (page.length + entry.length > 2000) {
				pages.push(page);
				page = `**${title} (continued)**`;
			}
			page += entry;
		}
		pages.push(page);

		const [firstPage, ...remainingPages] = pages;
		if (!firstPage) throw new Error("Failed to prepare the administrator list");
		await interaction.editReply({ content: firstPage, allowedMentions: { parse: [] } });
		for (const content of remainingPages) {
			await interaction.followUp({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
		}
	},
};

export default command;
