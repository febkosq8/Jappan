import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	channelMention,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { logger } from "../services/logger.js";

const commandData = {
	name: "doppelganger",
	description: "Post a message that appears to come from another user",
	category: "fun",
	isDBDependant: false,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.EmbedLinks,
		PermissionFlagsBits.ManageWebhooks,
	],
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addUserOption((option) =>
			option.setName("user").setDescription("The user the message will appear to come from").setRequired(true),
		)
		.addStringOption((option) =>
			option.setName("content").setDescription("The message to post as the selected user").setRequired(true),
		)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (
			!interaction.guild ||
			!interaction.channel ||
			!("fetchWebhooks" in interaction.channel) ||
			!("createWebhook" in interaction.channel)
		) {
			await interaction.editReply("⛔ This command can only be used in a guild text channel.");
			return;
		}

		const targetUser = interaction.options.getUser("user", true);
		const content = interaction.options.getString("content", true);
		const member = await interaction.guild.members.fetch(targetUser.id);
		const webhooks = await interaction.channel.fetchWebhooks();
		let webhook = webhooks.find(
			(candidate) =>
				candidate.name === `${config.BOT_NAME} : Doppelganger` &&
				candidate.owner?.id === interaction.client.user.id,
		);
		if (!webhook) {
			webhook = await interaction.channel.createWebhook({
				name: `${config.BOT_NAME} : Doppelganger`,
				avatar: config.BOT_PFP,
			});
		}

		const message = await webhook.send({
			content,
			username: member.displayName,
			avatarURL: targetUser.displayAvatarURL(),
		});
		const notificationContent = content.length > 1021 ? `${content.slice(0, 1018)}...` : content || "(empty)";
		const deleteButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder().setLabel("Jump to message").setStyle(ButtonStyle.Link).setURL(message.url),
			new ButtonBuilder()
				.setCustomId(`DeleteDoppelganger|MID#${message.id}:CID#${message.channelId}:UID#${targetUser.id}`)
				.setLabel("Delete posted message")
				.setStyle(ButtonStyle.Danger),
		);
		const notification = new EmbedBuilder()
			.setColor("Blue")
			.setTitle("A doppelganger message has been posted")
			.setAuthor({ name: `${config.BOT_NAME} : Notice`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
			.setDescription("A fake message was posted impersonating you.")
			.addFields(
				{ name: "Message", value: notificationContent },
				{
					name: "Location",
					value: `${channelMention(interaction.channel.id)} in [${interaction.guild.name}](https://discord.com/channels/${interaction.guild.id})`,
				},
			)
			.setTimestamp();

		await targetUser.send({ embeds: [notification], components: [deleteButton] }).catch((error: unknown) => {
			logger.warn("DOPPELGANGER", "Could not notify target user", {
				user: targetUser.tag,
				userId: targetUser.id,
				message: error instanceof Error ? error.message : String(error),
			});
		});
		await interaction.editReply("Doppelganger message posted successfully.");
	},
};

export default command;
