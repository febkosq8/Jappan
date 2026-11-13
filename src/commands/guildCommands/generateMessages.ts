import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder, underline } from "discord.js";

import type { BotCommand, BotCommandData } from "../../helpers/command.js";
import { formatChannelMention } from "../../helpers/discord.js";
import { getMissingBotPermissions } from "../../helpers/shared/permissions.js";
import { sendMessages, type MessageType } from "../../helpers/sendMessages.js";

function parseMessageType(value: string | null): MessageType {
	switch (value) {
		case null:
		case "all":
			return "all";
		case "gif":
		case "text":
		case "embed":
			return value;
		default:
			throw new Error(`Unsupported message type: ${value}`);
	}
}

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
		"Message type defaults to all, which mixes GIF, text, and embed messages.",
		"Text is used for text and embed messages; omit it for random multi-line messages.",
		"Mentions are disabled. Only one message generation run can be active per channel.",
	],
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addStringOption((option) =>
			option
				.setName("text")
				.setDescription("Message text for text/embed; omit for random text")
				.setMaxLength(1800),
		)
		.addIntegerOption((option) =>
			option
				.setName("count")
				.setDescription("Number of test messages to generate (default: 10, maximum: 200)")
				.setMinValue(1)
				.setMaxValue(200),
		)
		.addStringOption((option) =>
			option
				.setName("message_types")
				.setDescription("Message format to generate (default: all)")
				.addChoices(
					{ name: "All (mixed)", value: "all" },
					{ name: "GIF", value: "gif" },
					{ name: "Text", value: "text" },
					{ name: "Embed", value: "embed" },
				),
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
		const messageType = parseMessageType(interaction.options.getString("message_types"));
		let sent = 0;
		await interaction.editReply(`Generating ${count} test messages in ${formatChannelMention(channel)}...`);
		try {
			await sendMessages({
				channel,
				count,
				jobId: interaction.id,
				messageType,
				...(text !== undefined ? { text } : {}),
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
