import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	SlashCommandBuilder,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { getConfig } from "../services/config.js";
import { logger } from "../services/logger.js";

const commandData = {
	name: "doppelganger",
	description: "Make a user say something that you want",
	isDBDependant: false,
} satisfies BotCommandData;

const config = getConfig();

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(`${config.BOT_NAME} : ${commandData.description}`)
		.addUserOption((option) =>
			option.setName("user").setDescription("The user who will say the message").setRequired(true),
		)
		.addStringOption((option) => option.setName("content").setDescription("The message to send").setRequired(true))
		.setContexts([InteractionContextType.Guild]),
	execute: async (interaction) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (
			!interaction.guild ||
			!interaction.channel ||
			!("fetchWebhooks" in interaction.channel) ||
			!("createWebhook" in interaction.channel)
		) {
			await interaction.editReply("This command can only be used in a guild text channel.");
			return;
		}

		const targetUser = interaction.options.getUser("user", true);
		const content = interaction.options.getString("content", true);
		const member = await interaction.guild.members.fetch(targetUser.id);
		const webhooks = await interaction.channel.fetchWebhooks();
		let webhook = webhooks.find(
			(candidate) =>
				candidate.name === `${interaction.client.user.username} : Doppelganger` &&
				candidate.owner?.id === interaction.client.user.id,
		);
		if (!webhook) {
			webhook = await interaction.channel.createWebhook({
				name: `${interaction.client.user.username} : Doppelganger`,
				avatar: config.BOT_PFP,
			});
		}

		const message = await webhook.send({
			content,
			username: member.displayName,
			avatarURL: targetUser.displayAvatarURL(),
		});
		const deleteButton = new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`DeleteDoppelganger|${message.id}|${message.channelId}|${interaction.user.id}`)
				.setLabel("Delete message")
				.setStyle(ButtonStyle.Danger),
		);
		const notification = new EmbedBuilder()
			.setColor("Blue")
			.setTitle("Someone used `/doppelganger` on you")
			.setAuthor({ name: `${config.BOT_NAME} : Notification`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
			.setDescription("This command posts a fake message with your name and profile picture.")
			.addFields(
				{ name: "Content", value: `${content} | [Jump to Message](${message.url})` },
				{ name: "Location", value: `${interaction.guild} | ${interaction.channel}` },
			);

		await targetUser.send({ embeds: [notification], components: [deleteButton] }).catch((error: unknown) => {
			logger.warn("DOPPELGANGER", "Could not notify target user", {
				user: targetUser.tag,
				userId: targetUser.id,
				message: error instanceof Error ? error.message : String(error),
			});
		});
		await interaction.editReply("Message posted successfully.");
	},
};

export default command;
