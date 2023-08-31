const { GuildMember, EmbedBuilder } = require("discord.js");
const config = require("../config.json");
const { useQueue, usePlayer, useMainPlayer, QueueRepeatMode } = require("discord-player");

class PlayerHandler {
	static async playGuildPlayer(interaction, searchResult) {
		const player = useMainPlayer();
		await player.play(interaction.member.voice.channel, searchResult, {
			nodeOptions: {
				metadata: interaction.channel,
				bufferingTimeout: 15000,
				leaveOnStop: true,
				leaveOnStopCooldown: 5000,
				leaveOnEnd: true,
				leaveOnEndCooldown: 15000,
				leaveOnEmpty: true,
				leaveOnEmptyCooldown: 300000,
				skipOnNoStream: true,
			},
		});
	}
	static async queueGuildPlayer(interaction) {
		await interaction.deferReply();
		let queue = useQueue(interaction.guild.id);
		if (!queue) {
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
						inline: true,
					},
					{
						name: "Loop Mode",
						value: loopMode,
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

		const guildPlayerNode = usePlayer(interaction.guild.id);
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
		const guildPlayerNode = usePlayer(interaction.guild.id);
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
		const guildPlayerNode = usePlayer(interaction.guild.id);
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
		const queue = useQueue(interaction.guild.id);
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
}

module.exports = PlayerHandler;
