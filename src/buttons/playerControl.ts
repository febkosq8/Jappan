import { MessageFlags } from "discord.js";

import { parseButtonCustomId } from "../helpers/button.js";
import { formatUser } from "../helpers/discord.js";
import {
	createPlayerControls,
	createPlayerEmbed,
	getPlayerStatusDetails,
	type PlayerQueueMetadata,
} from "../helpers/player.js";
import {
	pausePlayer,
	playPreviousTrack,
	resumePlayer,
	setRepeat,
	setSessionLocked,
	setShuffle,
	skipTrack,
	stopPlayer,
	type PlayerActionResult,
} from "../helpers/playerActions.js";
import { splitString } from "../helpers/string.js";
import { getPlayer } from "../services/player.js";
import type { PlayerActor } from "../services/playerAccess.js";
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
		const queue = getPlayer().nodes.get<PlayerQueueMetadata>(interaction.guildId);
		if (!queue) {
			await interaction.reply({ content: "⛔ There is no active player queue.", flags: MessageFlags.Ephemeral });
			return;
		}

		const actor: PlayerActor = {
			userId: interaction.user.id,
			username: interaction.user.username,
			source: "discord",
			isAdmin: false,
			inVoiceChannel: true,
		};
		const context = { queue, actor };
		const reportRefusal = async (result: PlayerActionResult): Promise<void> => {
			if (!result.success) {
				await interaction.followUp({ content: `⛔ ${result.error}.`, flags: MessageFlags.Ephemeral });
			}
		};
		if (action === "pause") {
			await interaction.deferUpdate();
			await reportRefusal(queue.node.isPaused() ? resumePlayer(context) : pausePlayer(context));
			return;
		}
		if (action === "previous") {
			await interaction.deferUpdate();
			await reportRefusal(await playPreviousTrack(context));
			return;
		}
		if (action === "skip") {
			await interaction.deferUpdate();
			await reportRefusal(skipTrack(context));
			return;
		}
		if (action === "repeat") {
			await interaction.deferUpdate();
			await reportRefusal(setRepeat(context));
			return;
		}
		if (action === "shuffle") {
			await interaction.deferUpdate();
			await reportRefusal(setShuffle(context));
			return;
		}
		if (action === "lock") {
			await interaction.deferUpdate();
			await reportRefusal(setSessionLocked({ ...context, locked: !queue.metadata.locked }));
			return;
		}
		if (action === "stop") {
			// Stopping replaces this message with the "Player stopped" embed
			await interaction.deferUpdate();
			await reportRefusal(await stopPlayer(context));
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
						...getPlayerStatusDetails(queue),
						title: `🎵 Current queue (${page + 1}/${queuePages.length})`,
						description: `▶️ Now playing: **${queue.currentTrack?.title ?? "Nothing"}**\n\n${queuePages[page] ?? "No tracks are waiting in the queue."}`,
						color: "Blue",
						requestedBy: formatUser(queue.metadata.owner),
						footerText: `Page ${page + 1}/${queuePages.length}`,
						...(queue.currentTrack?.thumbnail ? { thumbnail: queue.currentTrack.thumbnail } : {}),
					}),
				],
				components: [
					...createPlayerControls({
						sessionId: queue.metadata.sessionId,
						locked: Boolean(queue.metadata.locked),
						queueView: true,
						queueSize: queue.tracks.size,
						queuePage: page,
						queuePageCount: queuePages.length,
						paused: queue.node.isPaused(),
						hasCurrentTrack: Boolean(queue.currentTrack),
						shuffle: queue.metadata.shuffle ?? false,
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
							...getPlayerStatusDetails(queue),
							title: "🎵 Now playing",
							description: currentTrack
								? queue.node.isPaused()
									? "Currently paused."
									: "Currently playing."
								: "No track is currently playing.",
							color: "Blue",
							requestedBy: formatUser(queue.metadata.owner),
							...(currentTrack?.thumbnail ? { thumbnail: currentTrack.thumbnail } : {}),
							...(currentTrack?.source ? { source: currentTrack.source } : {}),
							queueSize: queue.tracks.size,
							queueDurationMs: queue.tracks
								.toArray()
								.reduce((total, track) => total + (track.durationMS ?? 0), 0),
							...(currentTrack?.durationMS ? { durationMs: currentTrack.durationMS } : {}),
							shuffle: queue.metadata.shuffle ?? false,
							repeatMode: queue.repeatMode,
						}),
					],
					components: [
						...createPlayerControls({
							sessionId: queue.metadata.sessionId,
							locked: Boolean(queue.metadata.locked),
							queueSize: queue.tracks.size,
							paused: queue.node.isPaused(),
							hasCurrentTrack: Boolean(queue.currentTrack),
							shuffle: queue.metadata.shuffle ?? false,
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
