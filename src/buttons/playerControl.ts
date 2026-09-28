import { MessageFlags } from "discord.js";

import { parseButtonCustomId } from "../helpers/button.js";
import { createPlayerControls, createPlayerEmbed } from "../helpers/player.js";
import { getPlayer } from "../services/player.js";
import type { ButtonModule } from "../services/buttonLoader.js";

const button: ButtonModule = {
	buttonData: { id: "PlayerControl" },
	execute: async ({ interaction }) => {
		if (!interaction.guildId || !interaction.guild) {
			await interaction.reply({
				content: "⛔ Player controls are only available in a server.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const member = interaction.member;
		const memberVoiceChannelId =
			member && typeof member === "object" && "voice" in member ? member.voice.channelId : null;
		const botVoiceChannelId = interaction.guild.members.me?.voice.channelId;
		if (!memberVoiceChannelId || (botVoiceChannelId && memberVoiceChannelId !== botVoiceChannelId)) {
			await interaction.reply({
				content: "⛔ You must be in my voice channel to use player controls.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const action = parseButtonCustomId(interaction.customId).get("ACTION");
		const queue = getPlayer().queues.get(interaction.guildId);
		if (!queue) {
			await interaction.reply({ content: "⛔ There is no active player queue.", flags: MessageFlags.Ephemeral });
			return;
		}

		if (action === "pause") {
			queue.node.setPaused(!queue.node.isPaused());
			const paused = queue.node.isPaused();
			await interaction.update({
				components: [
					createPlayerControls({
						paused,
						hasPrevious: Boolean(queue.history.previousTrack),
						hasNext: queue.tracks.size > 0,
					}),
				],
			});
			await interaction.followUp({
				content: paused ? "⏸️ Player paused." : "▶️ Player resumed.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (action === "previous") {
			if (!queue.history.previousTrack) {
				await interaction.reply({ content: "⛔ There is no previous track.", flags: MessageFlags.Ephemeral });
				return;
			}
			await queue.history.previous();
			await interaction.reply({ content: "⏮️ Playing the previous track.", flags: MessageFlags.Ephemeral });
			return;
		}

		if (action === "skip") {
			const skipped = queue.node.skip();
			await interaction.reply({
				content: skipped ? "⏭️ Track skipped." : "⛔ The current track could not be skipped.",
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		if (action === "stop") {
			queue.delete();
			await interaction.update({
				embeds: [
					createPlayerEmbed({
						title: "⏹️ Player stopped",
						description: "Playback has been stopped.",
						color: "Blue",
					}),
				],
				components: [],
			});
			return;
		}

		if (action === "queue") {
			const view = parseButtonCustomId(interaction.customId).get("VIEW");
			if (view === "queue") {
				const currentTrack = queue.currentTrack;
				await interaction.update({
					embeds: [
						createPlayerEmbed({
							title: "🎵 Now playing",
							description: currentTrack
								? `▶️ **${currentTrack.title}**`
								: "No track is currently playing.",
							color: "Blue",
						}),
					],
					components: [
						createPlayerControls({
							paused: queue.node.isPaused(),
							hasPrevious: Boolean(queue.history.previousTrack),
							hasNext: queue.tracks.size > 0,
						}),
					],
				});
				return;
			}
			const tracks = queue.tracks.toArray();
			const description = tracks.length
				? tracks
						.map((track, index) => `${index + 1}. **${track.title}**`)
						.join("\n")
						.slice(0, 3900)
				: "No tracks are waiting in the queue.";
			await interaction.update({
				embeds: [createPlayerEmbed({ title: "🎵 Current queue", description, color: "Blue" })],
				components: [
					createPlayerControls({
						queueView: true,
						paused: queue.node.isPaused(),
						hasPrevious: Boolean(queue.history.previousTrack),
						hasNext: queue.tracks.size > 0,
					}),
				],
			});
			return;
		}

		await interaction.reply({
			content: "⛔ This player control is invalid or expired.",
			flags: MessageFlags.Ephemeral,
		});
	},
};

export default button;
