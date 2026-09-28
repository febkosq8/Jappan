import {
	EmbedBuilder,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	roleMention,
	SlashCommandBuilder,
	underline,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../helpers/command.js";
import type { Config } from "../services/config.js";
import { getLevelingStatus, setLeveling } from "../services/leveling.js";

const commandData = {
	name: "level",
	description: "Control the leveling feature for this server",
	category: "level",
	hasSubCommands: true,
	subCommands: [
		{ name: "on", description: "Turn on the leveling system", category: "level" },
		{ name: "off", description: "Turn off the leveling system", category: "level" },
		{ name: "check", description: "Check the leveling status", category: "level" },
	],
	isDBDependant: true,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.EmbedLinks,
	],
} satisfies BotCommandData;

function createStatusEmbed({
	guildName,
	enabled,
	threshold,
	roleId,
	config,
}: {
	guildName: string;
	enabled: boolean;
	threshold: number | null;
	roleId: string | null;
	config: Config;
}): EmbedBuilder {
	return new EmbedBuilder()
		.setColor(enabled ? "Green" : "Red")
		.setTitle("Leveling Settings")
		.setDescription(`**${guildName}**`)
		.setAuthor({ name: `${config.BOT_NAME} : Leveling Status`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.addFields(
			{ name: "LEVELING", value: enabled ? "✅ Enabled" : "❌ Disabled", inline: false },
			{
				name: "ROLE REWARD",
				value: threshold && roleId ? `✅ ${roleMention(roleId)} at ${threshold} points` : "Not configured",
				inline: false,
			},
		)
		.setTimestamp();
}

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("on")
				.setDescription("Turn on the leveling system")
				.addIntegerOption((option) =>
					option
						.setName("threshold")
						.setDescription("Optional points required for the reward role")
						.setMinValue(1),
				)
				.addRoleOption((option) =>
					option.setName("role").setDescription("Optional role awarded at the threshold"),
				),
		)
		.addSubcommand((subcommand) => subcommand.setName("off").setDescription("Turn off the leveling system"))
		.addSubcommand((subcommand) => subcommand.setName("check").setDescription("Check the leveling status"))
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction, config }) => {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		if (!interaction.guild) {
			await interaction.editReply("⛔ This command can only be used in a guild.");
			return;
		}

		if (interaction.options.getSubcommand() === "on") {
			const threshold = interaction.options.getInteger("threshold");
			const role = interaction.options.getRole("role");
			if ((threshold === null) !== (role === null)) {
				await interaction.editReply(`⛔ Provide both a threshold and a role to configure a leveling reward.`);
				return;
			}
			if (role) {
				const botMember = await interaction.guild.members.fetchMe();
				const botHasGuildManageRolesPermission = botMember.permissions.has(PermissionFlagsBits.ManageRoles);
				if (!botHasGuildManageRolesPermission) {
					await interaction.editReply(
						`⛔ I need the guild-level ${underline("Manage Roles")} permission to assign leveling reward roles.`,
					);
					return;
				}

				const selectedRole = await interaction.guild.roles.fetch(role.id);
				if (!selectedRole) {
					await interaction.editReply(
						`⛔ The selected reward role ${roleMention(role.id)} could not be found.`,
					);
					return;
				}
				if (selectedRole.id === interaction.guild.id) {
					await interaction.editReply(`⛔ The @everyone role cannot be used as a leveling reward.`);
					return;
				}
				if (selectedRole.managed) {
					await interaction.editReply(
						`⛔ The selected reward role ${roleMention(role.id)} is managed by an integration and cannot be assigned by this bot.`,
					);
					return;
				}
				if (botMember.roles.highest.comparePositionTo(selectedRole) <= 0) {
					await interaction.editReply(
						`⛔ The selected reward role ${roleMention(role.id)} is at or above my highest role. Choose a lower role.`,
					);
					return;
				}
			}
			await setLeveling({
				guildId: interaction.guild.id,
				guildName: interaction.guild.name,
				enabled: true,
				threshold,
				roleId: role?.id ?? null,
			});
		}

		if (interaction.options.getSubcommand() === "off") {
			await setLeveling({
				guildId: interaction.guild.id,
				guildName: interaction.guild.name,
				enabled: false,
				threshold: null,
				roleId: null,
			});
		}

		const status = await getLevelingStatus(interaction.guild);
		await interaction.editReply({
			embeds: [
				createStatusEmbed({
					guildName: status.guildName,
					enabled: status.leveling.enabled,
					threshold: status.leveling.threshold ?? null,
					roleId: status.leveling.roleId ?? null,
					config,
				}),
			],
		});
	},
};

export default command;
