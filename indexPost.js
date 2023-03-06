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
		const { Player } = require("discord-player");
		const player = new Player(client);

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
		const DiscordEventHandler = require("./Components/DiscordEventHandler");

		// player.on("debug", async (message) => {
		// 	await EventHandler.auditEvent("DEBUG", `Discord Player Debug`, message);
		// });

		player.events.on("debug", async (queue, message) => {
			await EventHandler.auditEvent("DEBUG", `Discord Player Debug Event`, message);
		});

		player.events.on("error", (queue, error) => {
			EventHandler.auditEvent(
				"DEBUG",
				`[${queue.guild.name}] Discord Player General error emitted from the queue: ${error.message}`,
				error
			);
		});
		player.events.on("playerError", (queue, error) => {
			EventHandler.auditEvent(
				"DEBUG",
				`[${queue.guild.name}] Discord Player error emitted from the connection: ${error.message}`,
				error
			);
		});
		player.events.on("connectionError", (queue, error) => {
			EventHandler.auditEvent(
				"ERROR",
				`[${queue.guild.name}] Discord Player Connection error emitted from the connection: ${error.message}`,
				error
			);
		});
		player.events.on("playerStart", (queue, track) => {
			queue.metadata.send(`▶ | Started playing: **${track.title}**`);
		});
		player.events.on("audioTrackAdd", (queue, track) => {
			queue.metadata.send(`:musical_note: | Track **${track.title}** queued`);
		});
		player.events.on("audioTracksAdd", (queue, track) => {
			queue.metadata.send(`🎶 | Multiple Track's queued`);
		});
		player.events.on("disconnect", (queue) => {
			queue.metadata.send(":x::warning: | My job here is done, leaving now!");
		});
		player.events.on("emptyChannel", (queue) => {
			queue.metadata.send(
				":warning: | Nobody has been active in the voice channel for the past 5 minutes , Adios :cowboy:"
			);
		});
		player.events.on("emptyQueue", (queue) => {
			queue.metadata.send("✅ | Queue finished!");
		});

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
		client.on("messageCreate", async (message) => {
			if (message.author.bot) return;
			if (!message.guild) {
				EventHandler.auditEvent(
					"DM_INFO",
					"Bot recieved a new DM message : " +
						message.content +
						" from User : (" +
						message.author.username +
						"#" +
						message.author.discriminator +
						" / " +
						message.author.id +
						")",
					message
				);
				return;
			}
			if (!message.content.startsWith(prefix)) {
				LevelHandler.checkGuildMessage(message);
				return;
			}
			if (message.content.startsWith(prefix)) {
				const args = message.content.slice(prefix.length).trim().split(/ +/g);
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
						"#" +
						message.author.discriminator +
						" / " +
						message.author.id
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
				if (command === "ping") {
					message.reply("Loading old style ping data").then(async (msg) => {
						msg.delete();
						message.reply(
							`:robot: Latency is ${msg.createdTimestamp - message.createdTimestamp}ms. API Latency is ${Math.round(
								client.ws.ping
							)}ms.`
						);
					});
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
			if (oldMessage.guildId) {
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
			if (!oldState.member.user.bot) {
				AuditHandler.auditEventVoiceChannel(oldState, newState);
			}
		});
		client.on("interactionCreate", async (interaction) => {
			if (interaction.isButton()) {
				try {
					const index = interaction.customId.indexOf("|");
					const command = index === -1 ? interaction.customId : interaction.customId.substring(0, index);
					require(`./slashCommands/buttonInteractions/${command}.js`).getInstance(client).execute(interaction, client);
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
								"#" +
								interaction.user.discriminator +
								" / " +
								interaction.user.id
						);
					} else {
						EventHandler.auditEvent(
							"INFO",
							"A button interaction for : " +
								interaction.customId +
								" was triggered by User : " +
								interaction.user.username +
								"#" +
								interaction.user.discriminator +
								" / " +
								interaction.user.id
						);
					}
				} catch (error) {
					EventHandler.auditEvent(
						"ERROR",
						"An button interaction for : " + interaction.customId + " has failed to execute with Error : " + error,
						error
					);
				}
			} else if (interaction.isAutocomplete()) {
				const userInteraction = require(`${getRootPath(
					interaction.commandName,
					globalCommands,
					guildCommands,
					testCommands
				)}/${interaction.commandName}.js`).getInstance(client);
				await userInteraction.autocomplete(interaction, client);
				EventHandler.auditEvent(
					"INFO",
					"A autocomplete interaction for : " +
						interaction.commandName +
						" was triggered in Guild : " +
						interaction.member.guild.name +
						" / " +
						interaction.member.guild.id +
						" by User : " +
						interaction.user.username +
						"#" +
						interaction.user.discriminator +
						" / " +
						interaction.user.id
				);
			} else {
				try {
					LevelHandler.checkGuildInteraction(interaction);
					const userInteraction = require(`${getRootPath(
						interaction.commandName,
						globalCommands,
						guildCommands,
						testCommands
					)}/${interaction.commandName}.js`).getInstance(client);
					await userInteraction.execute(interaction, client);
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
							"#" +
							interaction.user.discriminator +
							" / " +
							interaction.user.id
					);
				} catch (error) {
					EventHandler.auditEvent(
						"ERROR",
						"An interaction for : " + interaction.commandName + " has failed to execute with Error : " + error,
						error
					);
					interaction.followUp({
						content: "There was an error trying to execute that command!",
					});
				}
			}
		});
	}
}

module.exports = indexPost;
