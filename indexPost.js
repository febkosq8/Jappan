const ChannelHandler = require("./Components/ChannelHandler");
const PlayerHandler = require("./Components/PlayerHandler");

class indexPost {
	static async init(client) {
		//Client
		const ClientHandler = require("./Components/ClientHandler");
		ClientHandler.setClient(client);
		await ClientHandler.setCommandIdList();

		//MongoDB
		const DatabaseManager = require("./Managers/DatabaseManager");
		DatabaseManager.init();

		//Config
		const config = require("./config.json");
		const prefix = config.prefix;
		require("dotenv").config();

		//Discord Player
		const { Player, useMainPlayer } = require("discord-player");
		const { YoutubeiExtractor } = require("discord-player-youtubei");
		let playerDebugState = process.env.defaultPlayerDebugState === "true";
		const player = new Player(client, { skipFFmpeg: false });
		player.on("debug", async (message) => {
			if (playerDebugState) {
				console.log(`DP Debug : ${message}`);
			}
		});
		player.events.on("debug", async (queue, message) => {
			if (playerDebugState) {
				console.log(`DP Queue Debug : ${message}`);
			}
		});
		player.events.on("error", (queue, error) => {
			EventHandler.auditEvent(
				"ERROR",
				`[${queue?.guild?.name}] Discord Player Queue error emitted ${queue.currentTrack ? `for [${queue.currentTrack.title}] from the queue` : ``}: ${error?.message}`,
				error,
			);
		});
		player.events.on("playerError", (queue, error) => {
			EventHandler.auditEvent(
				"DEBUG",
				`[${queue?.guild?.name}] Discord Player error emitted ${queue.currentTrack ? `for [${queue?.currentTrack?.title}] from the connection` : ``}: ${error?.message}`,
				error,
			);
		});
		player.events.on("playerStart", async (queue, track) => {
			if (playerDebugState) {
				console.log(`Guild : ${queue?.guild?.name} emitted PlayerStart for ${track.title}`);
			}
			queue.metadata.pendingMessages.push(`▶ | Started playing: **${track.title}**`);
		});
		player.events.on("playerSkip", async (queue, track, reason) => {
			if (playerDebugState) {
				console.log(`Guild : ${queue?.guild?.name} emitted PlayerSkip with reason : ${reason}`);
			}
			if (["ERR_NO_STREAM"].includes(reason)) {
				queue.metadata.pendingMessages.push(`:warning: Skipping : **${track.title}** due to an issue !`);
			}
		});
		player.events.on("audioTrackAdd", async (queue, track) => {
			if (playerDebugState) {
				console.log(`Guild : ${queue.guild.name} emitted audioTrackAdd for ${track.title}`);
			}
			queue.metadata.pendingMessages.push(`:musical_note: | Track **${track.title}** queued`);
		});
		player.events.on("audioTracksAdd", async (queue, track) => {
			if (playerDebugState) {
				console.log(`Guild : ${queue.guild.name} emitted audioTracksAdd`);
			}
			queue.metadata.pendingMessages.push(`🎶 | Multiple Track's queued`);
		});
		player.events.on("disconnect", async (queue) => {
			if (playerDebugState) {
				console.log(`Guild : ${queue.guild.name} emitted disconnect`);
			}
			queue.metadata.pendingMessages.push(":x::warning: | My job here is done, leaving now!");
		});
		player.events.on("emptyChannel", async (queue) => {
			if (playerDebugState) {
				console.log(`Guild : ${queue.guild.name} emitted emptyChannel`);
			}
			queue.metadata.pendingMessages.push(
				":warning: | Nobody has been active in the voice channel for the past 5 minutes , Adios :cowboy:",
			);
		});
		player.events.on("emptyQueue", async (queue) => {
			if (playerDebugState) {
				console.log(`Guild : ${queue.guild.name} emitted emptyQueue`);
			}
			queue.metadata.pendingMessages.push("✅ | Queue finished!");
		});
		process.nextTick(async () => {
			await player.extractors.register(YoutubeiExtractor);
			await player.extractors.loadDefault((ext) => !["YouTubeExtractor"].includes(ext));
			// await player.extractors.loadDefault();
			setInterval(() => {
				PlayerHandler.processQueueMessages(player);
			}, 3000);
		});

		//Slash Commands
		const GlobalCommands = require("./Components/GlobalCommands");
		const GuildCommands = require("./Components/GuildCommands");
		const TestCommands = require("./Components/TestCommands");
		const { getRootPath } = require("./Components/FileHelper");
		const globalCommands = GlobalCommands.getInstance(client).getGlobalCommands();
		const guildCommands = GuildCommands.getInstance(client).getGuildCommands();
		const testCommands = TestCommands.getInstance(client).getTestCommands();

		//GuildLevel, Deployment, Announce, Event Management
		const LevelHandler = require("./Components/LevelHandler");
		const GuildHandler = require("./Components/GuildHandler");
		const AnnounceHandler = require("./Components/AnnounceHandler");
		const AuditHandler = require("./Components/AuditHandler");
		const DeployHandler = require("./Components/DeployHandler");
		const deployHandler = new DeployHandler(client);
		const EventHandler = require("./Components/EventHandler");

		client.on("guildCreate", async (guild) => {
			EventHandler.auditEvent("INFO", "Bot added to new guild : " + guild.name);
			GuildHandler.initGuild(guild.id, guild.name);
			DeployHandler.postNewGuildConfirmation(guild);
		});
		client.on("guildMemberAdd", async (member) => {
			AnnounceHandler.checkAnnounceGuild(member, "guildMemberAdd");
			AuditHandler.auditEventGuildMember(member, member, "guildMemberAdd");
		});
		client.on("guildMemberRemove", async (member) => {
			AnnounceHandler.checkAnnounceGuild(member, "guildMemberRemove");
			AuditHandler.auditEventGuildMember(member, member, "guildMemberRemove");
		});
		client.on("guildMemberUpdate", async (oldMember, newMember) => {
			AuditHandler.auditEventGuildMember(oldMember, newMember, "guildMemberUpdate");
		});
		client.on("guildBanAdd", async (ban) => {
			AuditHandler.auditEventMemberBan(ban, "guildBanAdd");
		});
		client.on("guildBanRemove", async (ban) => {
			AuditHandler.auditEventMemberBan(ban, "guildBanRemove");
		});
		client.on("inviteCreate", async (invite) => {
			AuditHandler.auditEventInvite(invite, "inviteCreate");
		});
		client.on("inviteDelete", async (invite) => {
			AuditHandler.auditEventInvite(invite, "inviteDelete");
		});
		client.on("guildAuditLogEntryCreate", async (event, guild) => {
			AuditHandler.auditEventGuildAuditEntryCreate(event, guild);
		});
		client.on("messageCreate", async (message) => {
			if (message.author.bot) return;
			if (!message.guild) {
				return EventHandler.auditEvent(
					"DM_INFO",
					"Bot recieved a new DM message : " +
						message.content +
						" from User : (" +
						message.author.username +
						" / " +
						message.author.id +
						")",
					message,
				);
			}
			if (!message.content.startsWith(prefix)) {
				return LevelHandler.checkGuildMessage(message);
			}
			if (message.content.startsWith(prefix)) {
				const args = message.content.slice(prefix.length).trim().split(/ +/g);
				const commandsList = [
					"deploy",
					"testDeploy",
					"unDeployGlobal",
					"unDeployGuild",
					"playerDebug",
					"playerDeps",
					"ping",
				];
				if (commandsList.includes(args[0])) {
					const command = args.shift();
					EventHandler.auditEvent(
						"INFO",
						"A instance of : " +
							command +
							" with args : " +
							args +
							" was triggered in Guild : " +
							message.guild.name +
							" / " +
							message.guild.id +
							" by User : " +
							message.author.username +
							" / " +
							message.author.id,
					);

					if (command === "deploy") {
						deployHandler.deployGuildCommands(message);
					}
					if (command === "testDeploy") {
						deployHandler.deployTestCommands(message);
					}
					if (command === "unDeployGlobal") {
						deployHandler.unDeployGlobalCommands(message);
					}
					if (command === "unDeployGuild") {
						deployHandler.unDeployGuildCommands(message);
					}
					if (command === "playerDebug") {
						if (process.env.botAdmin.includes(message.author.id)) {
							playerDebugState = !playerDebugState;
							EventHandler.auditEvent("NOTICE", `PlayerDebugState was toggled to ${playerDebugState}`);
							message.reply(`:white_check_mark: PlayerDebugState was toggled to ${playerDebugState}`);
						} else {
							EventHandler.auditEvent(
								"NOTICE",
								"User : (" +
									message.author.username +
									"/" +
									message.author.id +
									") tried accessing playerDebug command and was rejected access.",
							);
							message.reply(`:no_entry: You've yeed your last haw. Time to pay for your sins.:imp:`);
						}
					}
					if (command === "playerDeps") {
						if (process.env.botAdmin.includes(message.author.id)) {
							EventHandler.auditEvent("NOTICE", `playerDeps being logged to console`);
							let playerDeps = player.scanDeps();
							console.log(playerDeps);
							message.reply(`:white_check_mark: playerDeps attached below\n` + playerDeps);
						} else {
							EventHandler.auditEvent(
								"NOTICE",
								"User : (" +
									message.author.username +
									"/" +
									message.author.id +
									") tried accessing playerDeps command and was rejected access.",
							);
							message.reply(`:no_entry: You've yeed your last haw. Time to pay for your sins.:imp:`);
						}
					}
					if (command === "ping") {
						message.reply("Loading old style ping data").then(async (msg) => {
							msg.delete();
							message.reply(
								`:robot: Latency is ${msg.createdTimestamp - message.createdTimestamp}ms. API Latency is ${Math.round(
									client.ws.ping,
								)}ms.`,
							);
						});
					}
				}
			}
		});
		client.on("messageDelete", async (message) => {
			if (message.guildId) {
				AuditHandler.auditEventMessageDelete(message);
			}
		});
		client.on("messageDeleteBulk", async (messages) => {
			AuditHandler.auditEventMessageBulkDelete(messages);
		});
		client.on("messageUpdate", async (oldMessage, newMessage) => {
			if (oldMessage.guildId && newMessage.guildId) {
				AuditHandler.auditEventMessageUpdate(oldMessage, newMessage);
			}
		});
		client.on("channelCreate", async (channel) => {
			AuditHandler.auditEventChannel(channel, channel, "channelCreate");
		});
		client.on("channelDelete", async (channel) => {
			AuditHandler.auditEventChannel(channel, channel, "channelDelete");
		});
		client.on("channelUpdate", async (oldChannel, newChannel) => {
			AuditHandler.auditEventChannel(oldChannel, newChannel, "channelUpdate");
		});
		client.on("userUpdate", async (oldUser, newUser) => {
			AuditHandler.auditEventUserUpdate(oldUser, newUser, client);
		});
		client.on("roleCreate", async (role) => {
			AuditHandler.auditEventRoles(role, role, "roleCreate");
		});
		client.on("roleDelete", async (role) => {
			AuditHandler.auditEventRoles(role, role, "roleDelete");
		});
		client.on("roleUpdate", async (oldRole, newRole) => {
			AuditHandler.auditEventRoles(oldRole, newRole, "roleUpdate");
		});
		client.on("voiceStateUpdate", (oldState, newState) => {
			let timeStamp = new Date();
			if (newState.channelId == null) {
				LevelHandler.checkGuildVoice(oldState, "leave", timeStamp);
			} else if (oldState.channelId == null) {
				LevelHandler.checkGuildVoice(oldState, "join", timeStamp);
			}
			ChannelHandler.handleVoiceChange(oldState, newState);
			if (!oldState.member.user.bot) {
				AuditHandler.auditEventVoiceChannel(oldState, newState);
			}
		});
		client.on("interactionCreate", async (interaction) => {
			if (interaction.isButton()) {
				try {
					const index = interaction.customId.indexOf("|");
					const command = index === -1 ? interaction.customId : interaction.customId.substring(0, index);
					const buttonInteraction = require(`./slashCommands/buttonInteractions/${command}.js`).getInstance(client);
					await useMainPlayer().context.provide(
						{ guild: interaction.guild },
						async () => await buttonInteraction.execute(interaction, client),
					);
					if (interaction.member?.guild?.name) {
						LevelHandler.checkGuildInteraction(interaction);
						EventHandler.auditEvent(
							"INFO",
							"A button interaction for : " +
								interaction.customId +
								" was triggered in Guild : " +
								interaction.member.guild.name +
								" / " +
								interaction.member.guild.id +
								" by User : " +
								interaction.user.username +
								" / " +
								interaction.user.id,
						);
					} else {
						EventHandler.auditEvent(
							"INFO",
							"A button interaction for : " +
								interaction.customId +
								" was triggered by User : " +
								interaction.user.username +
								" / " +
								interaction.user.id,
						);
					}
				} catch (error) {
					EventHandler.auditEvent(
						"ERROR",
						"An button interaction for : " + interaction.customId + " has failed to execute with Error : " + error,
						error,
					);
				}
			} else if (interaction.isAutocomplete()) {
				const userInteraction = require(
					`${getRootPath(interaction.commandName, globalCommands, guildCommands, testCommands)}/${
						interaction.commandName
					}.js`,
				).getInstance(client);
				await userInteraction.autocomplete(interaction, client);
			} else if (interaction.isChatInputCommand()) {
				try {
					LevelHandler.checkGuildInteraction(interaction);
					const userInteraction = require(
						`${getRootPath(interaction.commandName, globalCommands, guildCommands, testCommands)}/${
							interaction.commandName
						}.js`,
					).getInstance(client);
					await useMainPlayer().context.provide(
						{ guild: interaction.guild },
						async () => await userInteraction.execute(interaction, client),
					);
					EventHandler.auditEvent(
						"INFO",
						"A interaction for : " +
							interaction.commandName +
							" was triggered in Guild : " +
							interaction.member.guild.name +
							" / " +
							interaction.member.guild.id +
							" by User : " +
							interaction.user.username +
							" / " +
							interaction.user.id,
					);
				} catch (error) {
					EventHandler.auditEvent(
						"ERROR",
						"An interaction for : " + interaction.commandName + " has failed to execute with Error : " + error,
						error,
					);
					interaction.followUp({
						content: ":warning: We failed to execute that command because of an error",
					});
				}
			}
		});
	}
}

module.exports = indexPost;
