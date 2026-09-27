import {
	ChannelType,
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
	channelMention,
	chatInputApplicationCommandMention,
	userMention,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../helpers/command.js";
import {
	addVoiceRegionLock,
	getVoiceRegionIds,
	getVoiceRegionLocks,
	removeVoiceRegionLock,
} from "../services/voiceRegion.js";
import { getCommandId } from "../services/commandLoader.js";

const commandData = {
	name: "lock-vc-region",
	description: "Lock a voice channel to a region when a user joins",
	category: "moderator",
	isDBDependant: true,
	requiredBotPermissions: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("add")
				.setDescription("Lock a voice channel when a user joins")
				.addChannelOption((option) =>
					option
						.setName("channel")
						.setDescription("Voice channel to lock")
						.addChannelTypes(ChannelType.GuildVoice)
						.setRequired(true),
				)
				.addUserOption((option) => option.setName("user").setDescription("User to watch").setRequired(true))
				.addStringOption((option) =>
					option.setName("region").setDescription("Voice region to use").setAutocomplete(true).setRequired(true),
				),
		)
		.addSubcommand((subcommand) => subcommand.setName("check").setDescription("List active voice region locks"))
		.addSubcommand((subcommand) =>
			subcommand
				.setName("delete")
				.setDescription("Delete a user's voice region lock")
				.addUserOption((option) => option.setName("user").setDescription("User to stop watching").setRequired(true)),
		)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!interaction.guild) {
			await interaction.editReply("⛔ This command can only be used in a guild.");
			return;
		}

		const subcommand = interaction.options.getSubcommand();
		if (subcommand === "add") {
			const channel = interaction.options.getChannel("channel", true);
			const user = interaction.options.getUser("user", true);
			const region = interaction.options.getString("region", true);
			try {
				await addVoiceRegionLock({
					guild: interaction.guild,
					userId: user.id,
					userName: user.username,
					channelId: channel.id,
					channelName: channel.name ?? "Voice channel",
					region,
				});
				await interaction.editReply(
					`✅ When ${userMention(user.id)} joins ${channelMention(channel.id)}, its voice region will be set to \`${region}\`.`,
				);
			} catch (error: unknown) {
				await interaction.editReply(
					error instanceof Error ? `⛔ ${error.message}` : "⛔ I could not create that voice region lock.",
				);
			}
			return;
		}

		if (subcommand === "delete") {
			const user = interaction.options.getUser("user", true);
			const removed = await removeVoiceRegionLock(interaction.guild, user.id);
			await interaction.editReply(
				removed
					? `✅ Removed the voice region lock for ${userMention(user.id)}.`
					: `⛔ No lock exists for ${userMention(user.id)}.`,
			);
			return;
		}

		const locks = await getVoiceRegionLocks(interaction.guild);
		const commandId = getCommandId("lock-vc-region");
		const addCommand = commandId
			? chatInputApplicationCommandMention("lock-vc-region", "add", commandId)
			: "the command menu";
		const embed = new EmbedBuilder()
			.setColor("DarkGold")
			.setTitle(`Voice Region Locks: ${interaction.guild.name}`)
			.setAuthor({ name: config.BOT_NAME, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
			.setTimestamp();
		if (locks.length === 0) {
			embed.setDescription(`No voice region locks are configured.\nUse ${addCommand} to create one.`);
		} else {
			embed.setDescription(
				locks
					.map((lock) => `${userMention(lock.userId)} in ${channelMention(lock.channelId)} -> \`${lock.region}\``)
					.join("\n"),
			);
		}
		await interaction.editReply({ embeds: [embed] });
	},
	autocomplete: async (interaction) => {
		if (!interaction.guild) {
			await interaction.respond([]);
			return;
		}

		const query = interaction.options.getString("region", false)?.toLowerCase() ?? "";
		const regions = await getVoiceRegionIds(interaction.guild);
		await interaction.respond(
			regions
				.filter((region) => region.toLowerCase().includes(query))
				.slice(0, 25)
				.map((region) => ({ name: region, value: region })),
		);
	},
};

export default command;
