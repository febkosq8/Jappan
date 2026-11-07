import type { Guild, User } from "discord.js";
import {
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	userMention,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../../helpers/command.js";
import { sendResponse } from "../../helpers/response.js";
import {
	formatChannelMention,
	formatGuild,
	formatGuildMention,
	formatUser,
	formatUserMention,
} from "../../helpers/discord.js";
import { DISCORD_INTERACTION_TIME_LIMIT_MS } from "../../helpers/interaction.js";
import { isAdminUser, kickGuild } from "../../services/adminGuild.js";
import type { Config } from "../../services/config.js";
import { logger } from "../../services/logger.js";

const commandData = {
	name: "admin-guild",
	description: "Manage the bot's guilds",
	category: "admin",
	defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
	hasSubCommands: true,
	subCommands: [
		{
			name: "selfkick",
			description: "Leave every other guild with an optional message and progress updates",
			category: "admin",
		},
	],
	isDBDependant: false,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.EmbedLinks,
	],
} satisfies BotCommandData;

function createGuildLeftEmbed({
	guild,
	config,
	owner,
	kickResult,
	pageNumber,
	totalPages,
}: {
	guild: Guild;
	config: Config;
	owner: User | null;
	kickResult: Awaited<ReturnType<typeof kickGuild>>;
	pageNumber: number;
	totalPages: number;
}): EmbedBuilder {
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
			{ name: "Created", value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`, inline: true },
			{ name: "Joined", value: `<t:${Math.floor(guild.joinedTimestamp / 1000)}:F>`, inline: true },
			{ name: "Locale", value: guild.preferredLocale, inline: true },
			{ name: "Description", value: guild.description ?? "None" },
			{ name: "Features", value: guild.features.length > 0 ? guild.features.join(", ") : "None" },
			{
				name: "Departure channel",
				value: kickResult.departureMessage
					? formatChannelMention({
							id: kickResult.departureMessage.channelId,
							name: kickResult.departureMessage.channelName,
						})
					: "No message was posted.",
				inline: true,
			},
			{
				name: "Departure message",
				value: kickResult.departureMessage?.messageUrl ?? "No message was posted.",
				inline: true,
			},
		)
		.setFooter({ text: `Page ${pageNumber} / ${totalPages}` })
		.setTimestamp();
	const guildIcon = guild.iconURL();
	if (guildIcon) {
		guildEmbed.setThumbnail(guildIcon);
	}
	return guildEmbed;
}

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("selfkick")
				.setDescription("Leave every other guild with an optional message and progress updates")
				.addBooleanOption((option) =>
					option.setName("confirm").setDescription("Confirm this destructive action").setRequired(true),
				)
				.addStringOption((option) =>
					option
						.setName("message")
						.setDescription("Additional message to send before leaving")
						.setRequired(false),
				),
		)
		.setDefaultMemberPermissions(commandData.defaultMemberPermissions)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		const deadlineAt = Date.now() + DISCORD_INTERACTION_TIME_LIMIT_MS;
		const invoker = { userName: interaction.user.tag, userId: interaction.user.id };
		if (!isAdminUser(interaction.user.id, config)) {
			logger.warn("ADMIN", "Unauthorized admin command attempt", {
				user: `${interaction.user.tag} <${interaction.user.id}>`,
				guild: interaction.guild ? formatGuild(interaction.guild) : undefined,
				subcommand: interaction.options.getSubcommand(),
			});
			await interaction.editReply("⛔ You are not authorized to use this command.");
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		if (subcommand === "selfkick") {
			if (!interaction.options.getBoolean("confirm", true)) {
				await interaction.editReply("⛔ Confirmation is required for this destructive action.");
				return;
			}
			const guilds = [...interaction.client.guilds.cache.values()].filter(
				(guild) => guild.id !== interaction.guildId,
			);
			await interaction.editReply(`Found ${guilds.length} guilds. Starting kicks now...`);
			const additionalMessage = interaction.options.getString("message");
			let leftGuilds = 0;
			let timeLimitReached = false;
			const successfulKicks: {
				guild: Guild;
				owner: User | null;
				kickResult: Awaited<ReturnType<typeof kickGuild>>;
			}[] = [];
			for (const [guildIndex, guild] of guilds.entries()) {
				if (Date.now() >= deadlineAt) {
					timeLimitReached = true;
					break;
				}
				try {
					const result = await kickGuild({
						guild,
						config,
						...(additionalMessage ? { additionalMessage } : {}),
						invoker,
					});
					if (result.success) {
						leftGuilds += 1;
						successfulKicks.push({
							guild,
							owner: await interaction.client.users.fetch(guild.ownerId).catch(() => null),
							kickResult: result,
						});
					}
				} catch (error: unknown) {
					logger.error("ADMIN", "Failed to leave guild during self-kick", {
						user: `${invoker.userName} <${invoker.userId}>`,
						guild: formatGuild(guild),
						error,
					});
				}
				if (Date.now() >= deadlineAt && guildIndex + 1 < guilds.length) {
					timeLimitReached = true;
				}
				await interaction
					.editReply(
						`Processed ${guildIndex + 1} of ${guilds.length} guilds. Successfully left ${leftGuilds}.${timeLimitReached ? " Maximum run time reached; run this command again to continue." : ""}`,
					)
					.catch(() => undefined);
			}
			const totalPages = Math.max(1, successfulKicks.length);
			if (successfulKicks.length === 0) {
				await interaction.editReply({
					embeds: [
						new EmbedBuilder()
							.setColor("Orange")
							.setAuthor({
								name: `${config.BOT_NAME} Admin`,
								iconURL: config.BOT_PFP,
								url: config.BOT_WEBSITE,
							})
							.setTitle("Self-kick completed")
							.setDescription(
								[
									`Left ${leftGuilds} of ${guilds.length} guilds.`,
									timeLimitReached
										? "Maximum run time reached before all guilds were processed. Run this command again to continue."
										: undefined,
								]
									.filter(Boolean)
									.join("\n"),
							)
							.setFooter({ text: "Page 1 / 1" })
							.setTimestamp(),
					],
				});
				return;
			}
			if (timeLimitReached) {
				await interaction.editReply(
					`Maximum run time reached. Left ${leftGuilds} of ${guilds.length} guilds. Run this command again to continue.`,
				);
			}
			const selfKickEmbeds = successfulKicks.map(({ guild, owner, kickResult }, index) =>
				createGuildLeftEmbed({ guild, config, owner, kickResult, pageNumber: index + 1, totalPages }),
			);
			await sendResponse({
				destination: interaction,
				content: { embeds: selfKickEmbeds, flags: MessageFlags.Ephemeral },
			});
			return;
		}

		await interaction.editReply({
			embeds: [
				new EmbedBuilder()
					.setAuthor({ name: `${config.BOT_NAME} Admin`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
					.setDescription("⛔ Unsupported admin guild operation.")
					.setTimestamp(),
			],
		});
	},
};

export default command;
