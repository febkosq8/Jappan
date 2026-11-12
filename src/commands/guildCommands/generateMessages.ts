import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, underline } from "discord.js";

import type { BotCommand, BotCommandData } from "../../helpers/command.js";
import { formatChannelMention } from "../../helpers/discord.js";
import { getMissingBotPermissions } from "../../helpers/shared/permissions.js";
import { sendMessages } from "../../services/sendMessages.js";

const commandData = {
	name: "generate-messages",
	description: "Generate random or custom test messages in this channel",
	category: "admin",
	defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
	isDBDependant: false,
	hasSubCommands: false,
	requiredBotPermissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.EmbedLinks],
	usageNotes: [
		"Generate channel messages for testing; requires Manage Server permission.",
		"Count defaults to 10 and supports 1 to 200 messages.",
		"Omit text for random multi-line messages or short paragraphs.",
		"GIF links are included every third message by default; set gifs to false for text only.",
		"Mentions are disabled. Only one message generation run can be active per channel.",
	],
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addStringOption((option) =>
			option.setName("text").setDescription("Message text to repeat; omit for random text").setMaxLength(1800),
		)
		.addIntegerOption((option) =>
			option
				.setName("count")
				.setDescription("Number of test messages to generate (default: 10, maximum: 200)")
				.setMinValue(1)
				.setMaxValue(200),
		)
		.addBooleanOption((option) =>
			option.setName("gifs").setDescription("Include GIF links in some messages (default: true)"),
		)
		.setDefaultMemberPermissions(commandData.defaultMemberPermissions)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction }) => {
		if (!interaction.inGuild() || !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
			await interaction.reply({
				content: `⛔ You need ${underline("Manage Server")} permission to use this command.`,
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const channel = interaction.channel;
		if (!channel || channel.isDMBased() || !channel.isSendable()) {
			await interaction.editReply("⛔ This channel cannot receive messages.");
			return;
		}
		const missingPermissions = getMissingBotPermissions(interaction, [
			channel.isThread() ? PermissionFlagsBits.SendMessagesInThreads : PermissionFlagsBits.SendMessages,
		]);
		if (missingPermissions.length > 0) {
			await interaction.editReply(
				`⛔ I need ${missingPermissions.map((permission) => underline(permission)).join(", ")} permission to send messages here.`,
			);
			return;
		}

		const count = interaction.options.getInteger("count") ?? 10;
		const text = interaction.options.getString("text") ?? undefined;
		const includeGifs = interaction.options.getBoolean("gifs") ?? true;
		let sent = 0;
		await interaction.editReply(`Generating ${count} test messages in ${formatChannelMention(channel)}...`);
		try {
			await sendMessages({
				channel,
				count,
				...(text !== undefined ? { text } : {}),
				includeGifs,
				onProgress: (progress) => {
					sent = progress;
				},
			});
		} catch (error: unknown) {
			const reason = error instanceof Error ? error.message : String(error);
			await interaction.editReply({
				content: `⛔ Stopped after sending ${sent}/${count} messages. ${reason}`.slice(0, 2000),
				allowedMentions: { parse: [] },
			});
			throw error;
		}
		await interaction.editReply({
			content: `Generated ${sent} test messages in ${formatChannelMention(channel)}.`,
			allowedMentions: { parse: [] },
		});
	},
};

export default command;
