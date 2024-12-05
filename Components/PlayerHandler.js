const { GuildMember, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const config = require("../config.json");
const { useQueue, usePlayer, useMainPlayer, QueueRepeatMode } = require("discord-player");
const ClientHandler = require("./ClientHandler");
const EventHandler = require("./EventHandler");
require("dotenv").config();
const isPlayerDisabled = process.env.isPlayerDisabled === "true";
class PlayerHandler {
	static async playGuildPlayer({ interaction, searchResult, repeatMode = 0, replyText }) {
		if (isPlayerDisabled) {
			return await interaction.editReply({
				content:
					":warning: Music commands are currently disabled due to a technical issue.\nCheck our discord server for status updates.",
			});
		}
		const player = useMainPlayer();
		await player.play(interaction.member.voice.channel, searchResult, {
			nodeOptions: {
				metadata: {
					channel: interaction.channel,
					pendingMessages: [],
					message: await interaction.fetchReply(),
				},
				bufferingTimeout: 15000,
				leaveOnStop: true,
				leaveOnStopCooldown: 5000,
				leaveOnEnd: true,
				leaveOnEndCooldown: 15000,
				leaveOnEmpty: true,
				leaveOnEmptyCooldown: 300000,
				skipOnNoStream: true,
				repeatMode,
			},
			requestedBy: interaction.user,
		});
		await interaction.editReply({
			content: replyText ?? `⏱ | Loading your ${searchResult.playlist ? "playlist" : "track"}`,
		});
	}
	static async queueGuildPlayer(interaction) {
		await interaction.deferReply();
		let queue = useQueue();
		if (!queue && !queue.currentTrack) {
			interaction.followUp({
				content: ":x: | No music is being played!",
			});
			return;
		} else {
			let currQueue = queue.tracks.toArray();
			let queueLength = currQueue.length;
			let loopMode = queue.repeatMode;
			let maxSongs = queueLength > 50 ? 50 : queueLength;
			let queueTracks = "`No songs in queue`";
			loopMode =
				loopMode === QueueRepeatMode.TRACK
					? ":repeat_one: Track"
					: loopMode === QueueRepeatMode.QUEUE
						? ":repeat: Queue"
						: ":arrow_forward: Off";
			if (queueLength > 0) {
				currQueue = queueLength > maxSongs ? currQueue.slice(0, maxSongs) : currQueue;
				queueTracks = currQueue.map((track, idx) => `${++idx}: **${track.title}**`).join("\n");
				while (queueTracks.length > 1000) {
					maxSongs--;
					currQueue = queueLength > maxSongs ? currQueue.slice(0, maxSongs) : currQueue;
					queueTracks = currQueue.map((track, idx) => `${++idx}: **${track.title}**`).join("\n");
				}
				if (queueLength > maxSongs) {
					queueTracks += `\nand ${queueLength - maxSongs} more...`;
				}
			}

			let queueEmbed = new EmbedBuilder()
				.setColor("LightGrey")
				.setAuthor({
					name: interaction.member.guild.name,
					iconURL: interaction.guild.iconUrl ? interaction.guild.iconUrl : config.botpfp,
					url: config.botWebsite,
				})
				.setTimestamp()
				.addFields(
					{
						name: ":musical_note: Now Playing",
						value: queue.currentTrack.title,
						inline: false,
					},
					{
						name: "Loop Mode",
						value: loopMode,
						inline: true,
					},
					{
						name: "Requested by",
						value: `${queue.currentTrack.requestedBy}`,
						inline: true,
					},
					{
						name: ":notes: Queue",
						value: queueTracks,
						inline: false,
					},
				);
			await interaction.editReply({
				embeds: [queueEmbed],
			});
			return;
		}
	}
	static async pauseGuildPlayer(interaction) {
		await interaction.deferReply();
		if (!(interaction.member instanceof GuildMember) || !interaction.member.voice.channel) {
			return void interaction.editReply({
				content: "You are not in a voice channel!",
				ephemeral: true,
			});
		}

		if (
			interaction.guild.members.me.voice.channelId &&
			interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId
		) {
			return void interaction.editReply({
				content: "You are not in my voice channel!",
				ephemeral: true,
			});
		}

		const guildPlayerNode = usePlayer();
		if (!guildPlayerNode?.queue) {
			await interaction.followUp({
				content: ":x: | No music is being played!",
			});
			return;
		}
		const newPauseState = !guildPlayerNode.isPaused();
		guildPlayerNode.setPaused(newPauseState);
		await interaction.editReply({
			content: newPauseState ? ":pause_button: | Paused player" : ":arrow_forward: | Resumed player",
		});
		return;
	}
	static async previousGuildPlayer(interaction) {
		await interaction.deferReply();
		if (!(interaction.member instanceof GuildMember) || !interaction.member.voice.channel) {
			return void interaction.editReply({
				content: "You are not in a voice channel!",
				ephemeral: true,
			});
		}

		if (
			interaction.guild.members.me.voice.channelId &&
			interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId
		) {
			return void interaction.editReply({
				content: "You are not in my voice channel!",
				ephemeral: true,
			});
		}
		const guildPlayerNode = usePlayer();
		if (!guildPlayerNode?.queue) {
			await interaction.followUp({
				content: ":x: | No music is being played!",
			});
			return;
		}
		const history = guildPlayerNode.queue.history;
		if (!history?.previousTrack) {
			return interaction.editReply({
				content: `:x: | We found no tracks in history!`,
			});
		}
		await history.previous();
		await interaction.editReply({
			content: ":arrow_backward: | Going back a song in the queue history",
		});
		return;
	}
	static async skipGuildPlayer(interaction) {
		await interaction.deferReply();
		if (!(interaction.member instanceof GuildMember) || !interaction.member.voice.channel) {
			return void interaction.editReply({
				content: "You are not in a voice channel!",
				ephemeral: true,
			});
		}

		if (
			interaction.guild.members.me.voice.channelId &&
			interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId
		) {
			return void interaction.editReply({
				content: "You are not in my voice channel!",
				ephemeral: true,
			});
		}
		const guildPlayerNode = usePlayer();
		if (!guildPlayerNode?.queue) {
			interaction.followUp({
				content: ":x: | No music is being played!",
			});
			return;
		}
		const currentTrack = guildPlayerNode.queue.currentTrack;
		const success = guildPlayerNode.skip();
		await interaction.followUp({
			content: success ? `✅ | Skipped **${currentTrack}**!` : ":x: | Something went wrong!",
		});
		return;
	}
	static async stopGuildPlayer(interaction) {
		await interaction.deferReply();
		if (!(interaction.member instanceof GuildMember) || !interaction.member.voice.channel) {
			await interaction.editReply({
				content: "You are not in a voice channel!",
				ephemeral: true,
			});
			return;
		}

		if (
			interaction.guild.members.me.voice.channelId &&
			interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId
		) {
			await interaction.editReply({
				content: "You are not in my voice channel!",
				ephemeral: true,
			});
			return;
		}
		const queue = useQueue();
		if (!queue) {
			await interaction.followUp({
				content: ":x: | No music is being played!",
			});
			return;
		}
		queue.delete();
		await interaction.followUp({ content: "🛑 | Stopped the player!" });
		return;
	}
	static async nowPlayingQueue(guildID) {
		const butttonLabelList = [
			{ key: "PlayerQueue", value: "Current Queue", style: ButtonStyle.Primary },
			{ key: "PlayerPrevious", value: "⏮️ Previous", style: ButtonStyle.Secondary },
			{ key: "PlayerPause", value: "⏯️ Toggle Pause", style: ButtonStyle.Secondary },
			{ key: "PlayerSkip", value: "⏭️ Skip", style: ButtonStyle.Secondary },
			{ key: "PlayerStop", value: "⏹️ Stop", style: ButtonStyle.Danger },
		];

		let buttonRow = new ActionRowBuilder();
		for (let i = 0; i < butttonLabelList.length; i++) {
			buttonRow.addComponents(
				new ButtonBuilder()
					.setCustomId(butttonLabelList[i].key)
					.setLabel(butttonLabelList[i].value)
					.setStyle(butttonLabelList[i].style),
			);
		}

		const guildPlayerNode = usePlayer(guildID);
		const currentTrack = guildPlayerNode?.queue?.currentTrack;
		if (!guildPlayerNode?.queue || !currentTrack) {
			return null;
		}
		const progress = guildPlayerNode.createProgressBar();
		const perc = guildPlayerNode.getTimestamp();
		const nowPlayingEmbed = new EmbedBuilder()
			.setColor(0xffffff)
			.setTitle("Now Playing")
			.setAuthor({
				name: config.botName,
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setThumbnail(currentTrack.thumbnail)
			.setFields(
				{
					name: "\u200b",
					value: progress,
				},
				{ name: "Next", value: `${guildPlayerNode?.queue?.tracks?.toArray()?.[0]?.description ?? "Nothing"}` },
				{ name: "Queue size", value: `${guildPlayerNode.queue.getSize()}` },
			)
			.setDescription(`:musical_note: | **${currentTrack.title}** | **${perc.progress} %**`)
			.setFooter({ text: `Song requested by ${currentTrack.requestedBy.username ?? "Someone"}` })
			.setTimestamp();
		return {
			embeds: [nowPlayingEmbed],
			components: [buttonRow],
		};
	}
	static async processQueueMessages(player) {
		const allActiveQueues = player.queues.cache
			.filter((queue) => queue?.metadata?.pendingMessages?.length > 0)
			.map((queue) => queue.metadata);
		for (const queue of allActiveQueues) {
			const { pendingMessages, message, nowPlaying } = queue;
			// console.log({ pendingMessages, nowPlaying });
			if (pendingMessages.length > 0) {
				await message.edit(pendingMessages[0]);
				queue.pendingMessages.shift();
			}
		}
	}
	static async handleShutdown() {
		const client = await ClientHandler.getClient();
		const activePlayerGuilds = client.guilds.cache.filter((guild) => !!guild?.members?.me?.voice?.channelId);
		if (activePlayerGuilds.size > 0) {
			EventHandler.auditEvent("NOTICE", `Bot is active in total ${activePlayerGuilds.size} guild(s)`);
			await Promise.all(
				activePlayerGuilds.map(async (guild) => {
					const queue = useQueue(guild.id);
					if (queue) {
						await queue.metadata.message.edit(`:warning: Bot is restarting, please re-queue in few seconds.`);
						queue.delete();
					}
				}),
			);
		}
		return;
	}
}

module.exports = PlayerHandler;
