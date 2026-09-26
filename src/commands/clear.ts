import {
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	SnowflakeUtil,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { getConfig } from "../services/config.js";

const commandData = {
	name: "clear",
	description: "Clear messages",
	isDBDependant: false,
} satisfies BotCommandData;

const config = getConfig();

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(`${config.BOT_NAME} : ${commandData.description}`)
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
				.setDescription("Delete a user's messages from this guild")
				.addUserOption((option) =>
					option.setName("username").setDescription("User whose messages should be deleted").setRequired(true),
				),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async (interaction) => {
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
		const count = Math.min(interaction.options.getNumber("count") ?? 100, 100);
		if (count < 1) {
			await interaction.editReply("Count must be at least 1.");
			return;
		}

		try {
			if (subcommand === "channel") {
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

			const channels = await interaction.guild.channels.fetch();
			let deletedCount = 0;
			for (const channel of channels.values()) {
				if (!channel?.isTextBased() || !("messages" in channel)) continue;
				const messages = await channel.messages.fetch({ limit: 100 });
				for (const message of messages.values()) {
					if (message.author.id === targetUser?.id && message.interaction?.id !== interaction.id) {
						await message.delete();
						deletedCount += 1;
					}
				}
			}
			await interaction.editReply(`Successfully deleted ${deletedCount} messages.`);
		} catch (error: unknown) {
			await interaction.editReply("There was an error while clearing messages from this guild.");
			throw error;
		}
	},
};

export default command;
