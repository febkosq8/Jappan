const { SlashCommandBuilder, EmbedBuilder, GuildMember, InteractionContextType } = require("discord.js");
const { useQueue, useMainPlayer } = require("discord-player");
const config = require("../../config.json");
const userPlaylist = require("../../Managers/Schemas/userPlaylistSchema");
const EventHandler = require("../../Components/EventHandler");
const PlayerHandler = require("../../Components/PlayerHandler");
const ClientHandler = require("../../Components/ClientHandler");

class playlist {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new playlist(client);
		}
		return this.instance;
	}
	constructor() {
		this.processCommand();
	}

	getCommand() {
		return this.#command;
	}
	getDetails() {
		return {
			name: this.#name,
			helpDesc: this.#helpDesc,
			cType: this.#cType,
			id: ClientHandler.getCommandId(this.#name) || this.#id,
		};
	}
	processCommand() {
		this.#name = "playlist";
		this.#desc = "Playlist for music";
		this.#helpDesc =
			"</playlist add:__id__> : Add a playlist for music playback. Takes a listname, the search query, shuffle mode (Overridable during playback) for input. Once set you can use the listname, to play that particular playlist anywhere.\n</playlist play:__id__> : You can play your registered playlist using its name.\n</playlist check:__id__> : Get a list of all the playlists that you have registered currently.";
		this.#cType = "music";
		this.#id = "1083507846433480711";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addSubcommand((group) =>
				group
					.setName("add")
					.setDescription("Add a new playlist to use later")
					.addStringOption((option) =>
						option.setName("listname").setDescription("Name for this playlist").setRequired(true),
					)
					.addStringOption((option) =>
						option
							.setName("query")
							.setDescription("Link of the playlist or Search Query for the song")
							.setRequired(true),
					)
					.addBooleanOption((option) =>
						option
							.setName("shuffle")
							.setDescription(
								"Choose if the playlist should be shuffled on playback. Can be overridden during playback.",
							)
							.setRequired(true),
					)
					.addBooleanOption((option) =>
						option
							.setName("loop")
							.setDescription("Choose if the playlist should be looped on playback. Can be overridden during playback.")
							.setRequired(true),
					),
			)
			.addSubcommand((group) =>
				group
					.setName("play")
					.setDescription("Play a playlist from the saved collection")
					.addStringOption((option) =>
						option
							.setName("listname")
							.setDescription("Name for the saved playlist")
							.setRequired(true)
							.setAutocomplete(true),
					)
					.addBooleanOption((option) =>
						option
							.setName("shuffle")
							.setDescription("Shuffle the playlist (Optional : Will use server value if not provided)")
							.setRequired(false),
					)
					.addBooleanOption((option) =>
						option
							.setName("loop")
							.setDescription("Looped the playback (Optional : Will use server value if not provided)")
							.setRequired(false),
					),
			)
			.addSubcommand((group) =>
				group.setName("check").setDescription("Get a list of playlist that you have saved currently"),
			)
			.setContexts([InteractionContextType.Guild])
			.toJSON();
	}

	async autocomplete(interaction) {
		try {
			const focusedValue = interaction.options.getFocused();
			let rawPlaylistData = await userPlaylist.findOne({
				userId: interaction.user.id,
			});
			let returnData = [];
			if (rawPlaylistData) {
				rawPlaylistData.queryList
					.sort((a, b) => a.listname.localeCompare(b.listname))
					.forEach((entry) => {
						if (!focusedValue) {
							returnData.push({ name: entry.listname, value: entry.listname });
						} else {
							if (entry.listname.toLowerCase().includes(focusedValue.toLowerCase())) {
								returnData.push({ name: entry.listname, value: entry.listname });
							}
						}
					});
			}
			await interaction.respond(returnData);
		} catch (error) {}
	}
	async execute(interaction) {
		const player = useMainPlayer();
		await interaction.deferReply();
		let type = interaction.options.getSubcommand();
		if (type === "add") {
			let query = interaction.options.get("query").value;
			const searchResult = await player.search(query, { requestedBy: interaction.user });
			if (!searchResult.hasTracks()) {
				interaction.editReply(`Playlist creation failed as we found no tracks for '${query}' !`);
				return;
			} else {
				let listname = interaction.options.get("listname").value;
				let shuffle = interaction.options.get("shuffle").value;
				let loop = interaction.options.get("loop").value;
				let playlistData;
				let queryListData;
				let rawPlaylistData = await userPlaylist.findOne({
					userId: interaction.user.id,
				});
				let status = 0;
				if (rawPlaylistData) {
					queryListData = rawPlaylistData?.queryList;
					queryListData.some((entry) => {
						if (entry.listname === listname) {
							status++;
							entry.query = query;
							entry.shuffle = shuffle;
							entry.loop = loop;
						}
					});
					if (status === 0) {
						queryListData.push({
							listname: listname,
							query: query,
							shuffle: shuffle,
							loop: loop,
						});
						status++;
					}
					await userPlaylist.findOneAndUpdate(
						{ userId: interaction.user.id },
						{
							$set: {
								username: interaction.user.username,
								queryList: queryListData,
							},
						},
					);
				} else {
					playlistData = {
						userId: interaction.user.id,
						username: interaction.user.username,
						queryList: [
							{
								listname: listname,
								query: query,
								shuffle: shuffle,
								loop: loop,
							},
						],
					};
					new userPlaylist(playlistData).save();
					status++;
				}
				if (status != 0) {
					await interaction.editReply({
						content: ":white_check_mark: We saved your playlist info successfully",
						ephemeral: true,
					});
				} else {
					await interaction.editReply({
						content: ":x: We could not save your playlist info",
						ephemeral: true,
					});
				}
			}
		} else if (type === "play") {
			let listname = interaction.options.get("listname").value;
			let rawPlaylistData = await userPlaylist.findOne({
				userId: interaction.user.id,
			});
			if (!rawPlaylistData) {
				await interaction.editReply({
					content: ":x: We found no playlist registered for you",
					ephemeral: true,
				});
			} else {
				let query;
				let shuffle;
				let loop;
				let newShuffle = interaction.options.get("shuffle");
				if (newShuffle) {
					shuffle = newShuffle.value;
				}
				let newLoop = interaction.options.get("loop");
				if (newLoop) {
					loop = newLoop.value;
				}
				rawPlaylistData.queryList.forEach((entry) => {
					if (
						entry.listname === listname ||
						entry.listname.toLowerCase() === listname.toLowerCase() ||
						entry.listname.includes(listname)
					) {
						query = entry.query;
						if (!newShuffle) {
							shuffle = entry.shuffle;
						}
						if (!newLoop) {
							loop = entry.loop;
						}
					}
				});
				if (query) {
					try {
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
						let searchResult = await player.search(query, { requestedBy: interaction.user });
						if (!searchResult.hasTracks()) {
							interaction.editReply(`We found no tracks for '${query}' !`);
							return;
						} else {
							if (shuffle) {
								searchResult._data.tracks = searchResult.tracks.sort((a, b) => 0.5 - Math.random());
							}
							let paramString = "";
							if (shuffle && loop) {
								paramString += "looped & shuffled";
							} else if (shuffle) {
								paramString += "shuffled";
							} else if (loop) {
								paramString += "looped";
							}
							await PlayerHandler.playGuildPlayer({
								interaction,
								searchResult,
								repeatMode: loop ? 2 : 0,
								replyText: `⏱ | Loading your ${paramString} playlist`,
							});
						}
					} catch (error) {
						EventHandler.auditEvent("ERROR", "Failed to execute player play command with Error : " + error, error);
						interaction.followUp({
							content: ":warning: We failed to execute that command because of an error",
						});
					}
				} else {
					interaction.editReply({
						content: ":x: We found no playlist registered with that name",
					});
				}
			}
		} else if (type === "check") {
			let rawPlaylistData = await userPlaylist.findOne({
				userId: interaction.user.id,
			});
			if (!rawPlaylistData) {
				await interaction.editReply({
					content: ":x: We found no playlist registered for you",
					ephemeral: true,
				});
			} else {
				let avatar = interaction.user.displayAvatarURL();
				let playlistEmbed = new EmbedBuilder().setColor("DarkGold").setTitle("Registered user playlist").setAuthor({
					name: rawPlaylistData.username,
					iconURL: avatar,
				});
				rawPlaylistData.queryList.map((entry) => {
					playlistEmbed.addFields({
						name: "Listname : " + `${entry.listname}`,
						value:
							"Query : " +
							`${entry.query}` +
							"\nShuffle : " +
							`\`${entry.shuffle}\`\n` +
							"Loop : " +
							`\`${entry.loop}\``,
					});
				});
				await interaction.editReply({
					embeds: [playlistEmbed],
					ephemeral: true,
				});
			}
		}
	}
}

module.exports = playlist;
