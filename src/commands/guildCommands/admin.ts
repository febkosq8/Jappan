import {
	ChannelType,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	blockQuote,
	channelMention,
	userMention,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../../helpers/command.js";
import { formatChannelMention, formatGuildMention, formatUserMention } from "../../helpers/discord.js";
import {
	getGuildChannel,
	getGuildInvite,
	getGuildList,
	isAdminUser,
	kickGuild,
	sendGuildAdminMessage,
} from "../../services/adminGuild.js";
import { logger } from "../../services/logger.js";

const commandData = {
	name: "admin-guild",
	description: "Manage the bot's guilds",
	category: "admin",
	isDBDependant: false,
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand.setName("list").setDescription("List the guilds where the bot is installed"),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("channel")
				.setDescription("Inspect a channel in a guild")
				.addStringOption((option) =>
					option.setName("guild-id").setDescription("Guild ID").setAutocomplete(true).setRequired(true),
				)
				.addStringOption((option) =>
					option.setName("channel-id").setDescription("Channel ID").setAutocomplete(true).setRequired(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("selfkick")
				.setDescription("Leave every guild where the bot is installed")
				.addBooleanOption((option) =>
					option.setName("confirm").setDescription("Confirm this destructive action").setRequired(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("kick")
				.setDescription("Leave a guild")
				.addStringOption((option) =>
					option.setName("guild-id").setDescription("Guild ID").setAutocomplete(true).setRequired(true),
				)
				.addBooleanOption((option) =>
					option.setName("confirm").setDescription("Confirm this destructive action").setRequired(true),
				)
				.addStringOption((option) =>
					option.setName("message").setDescription("Additional message to send before leaving").setRequired(false),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("message")
				.setDescription("Send an admin message to a guild")
				.addStringOption((option) =>
					option.setName("guild-id").setDescription("Guild ID").setAutocomplete(true).setRequired(true),
				)
				.addStringOption((option) =>
					option.setName("channel-id").setDescription("Channel ID").setAutocomplete(true).setRequired(true),
				)
				.addStringOption((option) => option.setName("message").setDescription("Message to send").setRequired(true)),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("invite")
				.setDescription("Get or create an invite for a guild")
				.addStringOption((option) =>
					option.setName("guild-id").setDescription("Guild ID").setAutocomplete(true).setRequired(true),
				),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const invoker = { userName: interaction.user.tag, userId: interaction.user.id };
		if (!isAdminUser(interaction.user.id, config)) {
			logger.warn("ADMIN", "Unauthorized admin command attempt", {
				userId: interaction.user.id,
				userName: interaction.user.tag,
				guildId: interaction.guildId,
				subcommand: interaction.options.getSubcommand(),
			});
			await interaction.editReply("⛔ You are not authorized to use this command.");
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		if (subcommand === "list") {
			const pages = await getGuildList(interaction.client, config);
			const embedBatches = Array.from({ length: Math.ceil(pages.length / 10) }, (_, index) =>
				pages.slice(index * 10, index * 10 + 10),
			);
			const firstBatch = embedBatches[0];
			if (!firstBatch) {
				await interaction.editReply("No guilds found.");
				return;
			}
			await interaction.editReply({ embeds: firstBatch });
			for (const embeds of embedBatches.slice(1)) {
				await interaction.followUp({ embeds, flags: MessageFlags.Ephemeral });
			}
			return;
		}

		if (subcommand === "channel") {
			try {
				const channel = await getGuildChannel(
					interaction.client,
					interaction.options.getString("guild-id", true),
					interaction.options.getString("channel-id", true),
				);
				const channelEmbed = new EmbedBuilder()
					.setColor("Orange")
					.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
					.setTitle("Channel details")
					.addFields(
						{ name: "Channel", value: formatChannelMention(channel) },
						{ name: "Guild", value: formatGuildMention(channel.guild) },
						{ name: "Type", value: ChannelType[channel.type] ?? String(channel.type), inline: true },
						{
							name: "Created",
							value: channel.createdTimestamp ? `<t:${Math.floor(channel.createdTimestamp / 1000)}:F>` : "Unknown",
							inline: true,
						},
						{ name: "URL", value: channel.url },
						{ name: "Parent", value: channel.parent ? formatChannelMention(channel.parent) : "None", inline: true },
					)
					.setTimestamp();

				if ("topic" in channel && channel.topic) {
					channelEmbed.addFields({ name: "Topic", value: channel.topic });
				}
				if ("nsfw" in channel) {
					channelEmbed.addFields({ name: "NSFW", value: channel.nsfw ? "Yes" : "No", inline: true });
				}
				if ("rateLimitPerUser" in channel) {
					channelEmbed.addFields({
						name: "Slowmode",
						value: `${channel.rateLimitPerUser} seconds`,
						inline: true,
					});
				}
				if ("bitrate" in channel) {
					channelEmbed.addFields({ name: "Bitrate", value: `${channel.bitrate} bps`, inline: true });
				}
				if ("userLimit" in channel) {
					channelEmbed.addFields({ name: "User limit", value: String(channel.userLimit || "Unlimited"), inline: true });
				}

				await interaction.editReply({ embeds: [channelEmbed] });
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : "Could not inspect that channel.";
				await interaction.editReply(`⛔ ${message}`);
			}
			return;
		}

		if (subcommand === "selfkick") {
			if (!interaction.options.getBoolean("confirm", true)) {
				await interaction.editReply("⛔ Confirmation is required for this destructive action.");
				return;
			}
			const guilds = [...interaction.client.guilds.cache.values()];
			let leftGuilds = 0;
			let skippedCurrentGuild = false;
			for (const guild of guilds) {
				if (guild.id === interaction.guildId) {
					skippedCurrentGuild = true;
					continue;
				}
				try {
					const result = await kickGuild({ guild, config, invoker });
					if (result.success) {
						leftGuilds += 1;
					}
				} catch (error: unknown) {
					logger.error("ADMIN", "Failed to leave guild during self-kick", { ...invoker, guildId: guild.id, error });
				}
			}
			await interaction.editReply(
				`Self-kick completed. Left ${leftGuilds} of ${guilds.length} guilds${
					skippedCurrentGuild ? "; skipped the current guild" : ""
				}.`,
			);
			return;
		}

		const guildId = interaction.options.getString("guild-id", true);
		const guild = await interaction.client.guilds.fetch(guildId).catch(() => null);
		if (!guild) {
			await interaction.editReply("⛔ Guild not found.");
			return;
		}

		if (subcommand === "kick") {
			if (!interaction.options.getBoolean("confirm", true)) {
				await interaction.editReply("⛔ Confirmation is required for this destructive action.");
				return;
			}
			if (guild.id === interaction.guildId) {
				await interaction.editReply("⛔ You cannot kick the guild where this command is being used.");
				return;
			}
			const owner = await interaction.client.users.fetch(guild.ownerId).catch(() => null);
			const additionalMessage = interaction.options.getString("message");
			const kickResult = await kickGuild({
				guild,
				config,
				...(additionalMessage ? { additionalMessage } : {}),
				invoker,
			});
			if (!kickResult.success) {
				await interaction.editReply("⛔ Failed to leave the guild.");
				return;
			}
			const guildEmbed = new EmbedBuilder()
				.setColor("Orange")
				.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
				.setTitle("Left guild")
				.addFields(
					{ name: "Guild", value: formatGuildMention(guild) },
					{ name: "Owner", value: owner ? formatUserMention(owner) : userMention(guild.ownerId) },
					{ name: "Members", value: String(guild.memberCount), inline: true },
					{ name: "Channels", value: String(guild.channels.cache.size), inline: true },
					{ name: "Boosts", value: String(guild.premiumSubscriptionCount ?? 0), inline: true },
					{ name: "Boost tier", value: String(guild.premiumTier), inline: true },
					{ name: "Verification", value: String(guild.verificationLevel), inline: true },
					{
						name: "Created",
						value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`,
						inline: true,
					},
					{
						name: "Joined",
						value: `<t:${Math.floor(guild.joinedTimestamp / 1000)}:F>`,
						inline: true,
					},
					{ name: "Locale", value: guild.preferredLocale, inline: true },
					{
						name: "Departure message",
						value: kickResult.departureMessage?.messageUrl ?? "No message was posted.",
					},
					{ name: "Description", value: guild.description ?? "None" },
					{ name: "Features", value: guild.features.length > 0 ? guild.features.join(", ") : "None" },
				)
				.setTimestamp();
			const guildIcon = guild.iconURL();
			if (guildIcon) {
				guildEmbed.setThumbnail(guildIcon);
			}
			await interaction.editReply({ embeds: [guildEmbed] });
			return;
		}

		if (subcommand === "message") {
			try {
				const message = interaction.options.getString("message", true);
				const channelId = interaction.options.getString("channel-id", true);
				const channel = await guild.channels.fetch(channelId);
				if (!channel) {
					await interaction.editReply("⛔ Channel not found.");
					return;
				}
				const sentMessage = await sendGuildAdminMessage({ guild, message, config, channelId, invoker });
				const messageEmbed = new EmbedBuilder()
					.setColor("Orange")
					.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
					.setTitle("Admin message sent")
					.addFields(
						{ name: "Content", value: blockQuote(message) },
						{ name: "Guild", value: formatGuildMention(guild) },
						{ name: "Channel", value: channelMention(channelId), inline: true },
						{ name: "Channel type", value: ChannelType[channel.type] ?? String(channel.type), inline: true },
						{ name: "Message", value: sentMessage.messageUrl },
					)
					.setTimestamp();
				await interaction.editReply({ embeds: [messageEmbed] });
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : "Could not send the admin message.";
				await interaction.editReply(`⛔ ${message}`);
			}
			return;
		}

		if (subcommand === "invite") {
			try {
				const invite = await getGuildInvite(guild);
				const age = invite.maxAge === 0 ? "Never" : `${Math.floor((invite.maxAge ?? 0) / 3600)} hours`;
				const inviteEmbed = new EmbedBuilder()
					.setColor("Orange")
					.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
					.setTitle("Guild invite")
					.addFields(
						{ name: "Invite", value: invite.url },
						{ name: "Guild", value: formatGuildMention(guild) },
						{
							name: "Channel",
							value: invite.channel
								? `${channelMention(invite.channel.id)} (${invite.channel.name ?? "unnamed"}/${invite.channel.id})`
								: "Unknown",
							inline: true,
						},
						{ name: "Age", value: age, inline: true },
						{
							name: "Created at",
							value: invite.createdTimestamp ? `<t:${Math.floor(invite.createdTimestamp / 1000)}:F>` : "Unknown",
							inline: true,
						},
						{
							name: "Expires at",
							value: invite.expiresTimestamp ? `<t:${Math.floor(invite.expiresTimestamp / 1000)}:F>` : "Never",
							inline: true,
						},
						{
							name: "Uses",
							value: `${invite.uses ?? 0} / ${invite.maxUses === 0 ? "Unlimited" : (invite.maxUses ?? "Unknown")}`,
							inline: true,
						},
						{ name: "Temporary", value: invite.temporary ? "Yes" : "No", inline: true },
						{ name: "Inviter", value: invite.inviter ? formatUserMention(invite.inviter) : "Unknown" },
					)
					.setTimestamp();
				await interaction.editReply({ embeds: [inviteEmbed] });
			} catch (error: unknown) {
				const message = error instanceof Error ? error.message : "Could not get an invite for that guild.";
				await interaction.editReply(`⛔ ${message}`);
			}
			return;
		}

		await interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
					.setDescription("⛔ Unsupported admin guild operation."),
			],
		});
	},
	autocomplete: async (interaction) => {
		const focused = interaction.options.getFocused(true);
		const query = focused.value.toLowerCase();

		if (focused.name === "guild-id") {
			await interaction.respond(
				[...interaction.client.guilds.cache.values()]
					.filter((guild) => `${guild.name} ${guild.id}`.toLowerCase().includes(query))
					.slice(0, 25)
					.map((guild) => ({ name: `${guild.name} (${guild.id})`, value: guild.id })),
			);
			return;
		}

		if (focused.name === "channel-id") {
			const guildId = interaction.options.getString("guild-id");
			const guild = guildId ? await interaction.client.guilds.fetch(guildId).catch(() => null) : null;
			const channels = guild ? await guild.channels.fetch().catch(() => null) : null;
			await interaction.respond(
				channels
					? [...channels.values()]
							.flatMap((channel) =>
								channel && `${channel.name ?? ""} ${channel.id}`.toLowerCase().includes(query)
									? [
											{
												name: `Name: ${channel.name ?? "unnamed"} | Type: ${ChannelType[channel.type] ?? channel.type} | ID: ${channel.id}`,
												value: channel.id,
											},
										]
									: [],
							)
							.slice(0, 25)
					: [],
			);
		}
	},
};

export default command;
