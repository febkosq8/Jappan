import { MessageFlags } from "discord.js";
import type { QueueRepeatMode } from "discord-player";

import { parseButtonCustomId } from "../helpers/button.js";
import {
	createPlayerControls,
	createPlayerEmbed,
	getNextRepeatMode,
	updatePlayerQueueMessage,
} from "../helpers/player.js";
import { splitString } from "../helpers/string.js";
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
			await interaction.deferUpdate();
			if (!queue.currentTrack) {
				return;
			}
			queue.node.setPaused(!queue.node.isPaused());
			updatePlayerQueueMessage({ queue, content: "" });
			return;
		}

		if (action === "previous") {
			await interaction.deferUpdate();
			if (!queue.history.previousTrack) {
				return;
			}
			await queue.history.previous();
			updatePlayerQueueMessage({ queue, content: "" });
			return;
		}

		if (action === "skip") {
			await interaction.deferUpdate();
			queue.node.skip();
			await updatePlayerQueueMessage({ queue, content: "" });
			return;
		}

		if (action === "repeat") {
			await interaction.deferUpdate();
			const nextRepeatMode = getNextRepeatMode(queue.repeatMode as QueueRepeatMode);
			queue.setRepeatMode(nextRepeatMode);
			updatePlayerQueueMessage({ queue, content: "" });
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
						requestedBy: queue.metadata.requestedByDisplay,
					}),
				],
				components: [],
			});
			return;
		}

		const renderQueuePage = async (requestedPage: number): Promise<void> => {
			const tracks = queue.tracks.toArray();
			const queueBody = tracks.length
				? tracks.map((track, index) => `${index + 1}. **${track.title}**`).join("\n")
				: "No tracks are waiting in the queue.";
			const queueChunks = splitString(queueBody, 2600);
			const queuePages = queueChunks.slice(0, 3);
			if (queueChunks.length > queuePages.length) {
				queuePages[queuePages.length - 1] += "\n... More tracks are not shown.";
			}
			const page = Math.min(Math.max(requestedPage, 0), queuePages.length - 1);
			await interaction.update({
				embeds: [
					createPlayerEmbed({
						title: `🎵 Current queue (${page + 1}/${queuePages.length})`,
						description: `▶️ Now playing: **${queue.currentTrack?.title ?? "Nothing"}**\n\n${queuePages[page] ?? "No tracks are waiting in the queue."}`,
						color: "Blue",
						requestedBy: queue.metadata.requestedByDisplay,
						footerText: `Page ${page + 1}/${queuePages.length}`,
						...(queue.currentTrack?.thumbnail ? { thumbnail: queue.currentTrack.thumbnail } : {}),
					}),
				],
				components: [
					...createPlayerControls({
						queueView: true,
						queueSize: queue.tracks.size,
						queuePage: page,
						queuePageCount: queuePages.length,
						paused: queue.node.isPaused(),
						hasCurrentTrack: Boolean(queue.currentTrack),
						repeatMode: queue.repeatMode,
						hasPrevious: Boolean(queue.history.previousTrack),
						hasNext: Boolean(queue.history.nextTrack),
					}),
				],
			});
		};

		if (action === "queue") {
			const view = parseButtonCustomId(interaction.customId).get("VIEW");
			if (view === "queue") {
				const currentTrack = queue.currentTrack;
				await interaction.update({
					embeds: [
						createPlayerEmbed({
							title: "🎵 Now playing",
							description: currentTrack
								? queue.node.isPaused()
									? "Currently paused."
									: "Currently playing."
								: "No track is currently playing.",
							color: "Blue",
							requestedBy: queue.metadata.requestedByDisplay,
							...(currentTrack?.thumbnail ? { thumbnail: currentTrack.thumbnail } : {}),
							...(currentTrack?.source ? { source: currentTrack.source } : {}),
							queueSize: queue.tracks.size,
							queueDurationMs: queue.tracks
								.toArray()
								.reduce((total, track) => total + (track.durationMS ?? 0), 0),
							...(currentTrack?.durationMS ? { durationMs: currentTrack.durationMS } : {}),
							repeatMode: queue.repeatMode,
						}),
					],
					components: [
						...createPlayerControls({
							queueSize: queue.tracks.size,
							paused: queue.node.isPaused(),
							hasCurrentTrack: Boolean(queue.currentTrack),
							repeatMode: queue.repeatMode,
							hasPrevious: Boolean(queue.history.previousTrack),
							hasNext: Boolean(queue.history.nextTrack),
						}),
					],
				});
				return;
			}
			await renderQueuePage(0);
			return;
		}

		if (action === "queuePage") {
			const requestedPage = Number(parseButtonCustomId(interaction.customId).get("PAGE"));
			await renderQueuePage(Number.isFinite(requestedPage) ? requestedPage : 0);
			return;
		}

		await interaction.reply({
			content: "⛔ This player control is invalid or expired.",
			flags: MessageFlags.Ephemeral,
		});
	},
};

export default button;
