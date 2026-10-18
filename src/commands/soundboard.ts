import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import { formatUser } from "../helpers/discord.js";
import { createPlayerEmbed, getValidatedPlayerVoiceChannel } from "../helpers/player.js";
import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { getPlayer, playSearchResult, searchPlayer } from "../services/player.js";

const voiceClips = {
	whatrasudeep: "https://youtu.be/hmXbadIoB8M",
	yametekudasai: "https://youtu.be/gb4ZnGIhPD0",
	mcmiyuki: "https://youtu.be/piGuCMs_qok",
	punishmedaddy: "https://youtu.be/OyQvw7I_Sww",
	butwhy: "https://youtu.be/K4smXP46tG4",
} as const;

const commandData = {
	name: "soundboard",
	description: "Play a soundboard clip",
	category: "fun",
	isDBDependant: false,
	hasSubCommands: false,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.EmbedLinks,
		PermissionFlagsBits.Connect,
		PermissionFlagsBits.Speak,
	],
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addStringOption((option) =>
			option
				.setName("voiceclip")
				.setDescription("Which voice clip to play")
				.setRequired(true)
				.addChoices(
					{ name: "What ra Sudeep", value: "whatrasudeep" },
					{ name: "Yamete Kudasai", value: "yametekudasai" },
					{ name: "MC Miyuki RAP", value: "mcmiyuki" },
					{ name: "Punish me daddy ft. Dafuq", value: "punishmedaddy" },
					{ name: "But Why ft. Mukesh", value: "butwhy" },
				),
		)
		.setContexts([InteractionContextType.Guild]),
	execute: async ({ interaction }) => {
		await interaction.deferReply();

		const voiceChannelResult = getValidatedPlayerVoiceChannel(interaction);
		if (!voiceChannelResult.success) {
			await interaction.editReply({ embeds: [voiceChannelResult.embed] });
			return;
		}
		const { channel: voiceChannel, member } = voiceChannelResult;
		const clipKey = interaction.options.getString("voiceclip", true);
		if (!(clipKey in voiceClips)) {
			await interaction.editReply({ content: "Unknown voiceclip." });
			return;
		}
		if (getPlayer().queues.get(interaction.guildId!)) {
			await interaction.editReply({
				embeds: [
					createPlayerEmbed({
						title: "⚠️ Player session in progress",
						description: "A player session is already in progress.",
						color: "Red",
					}),
				],
			});
			return;
		}
		const searchResponse = await searchPlayer(voiceClips[clipKey as keyof typeof voiceClips], {
			requestedBy: interaction.user.id,
		});
		if (!searchResponse.success) {
			await interaction.editReply({
				embeds: [
					createPlayerEmbed({
						title: "🤖 Player not ready",
						description: "The bot's music player is not ready yet. Please try again shortly.",
					}),
				],
			});
			return;
		}
		const soundResult = searchResponse.data;
		const soundTrack = soundResult.tracks[0];
		if (!soundTrack) {
			await interaction.editReply({ content: "We didn't find that sound clip." });
			return;
		}

		const statusMessage = await interaction.editReply({
			embeds: [
				createPlayerEmbed({
					title: "⏳ Loading soundboard clip",
					description: `Waiting for **${soundTrack.title}** to start.`,
					color: "Blue",
					requestedBy: formatUser(member.user),
				}),
			],
		});
		await playSearchResult({
			channel: voiceChannel.id,
			member,
			searchResult: soundResult,
			statusMessage,
			playNodeOptions: {
				leaveOnEndCooldown: 1000,
			},
		});
	},
};

export default command;
