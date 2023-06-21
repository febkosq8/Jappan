const config = require("../config.json");
require("dotenv").config();
const GlobalCommands = require("./GlobalCommands");
const { REST, Routes, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const EventHandler = require("./EventHandler");
const ClientHandler = require("./ClientHandler");
const DatabaseManager = require("../Managers/DatabaseManager");
const LevelHandler = require("./LevelHandler");
const mongoose = require("mongoose");
var token = ClientHandler.getToken();
let confirmCode = "";

class AdminHandler {
	static async adminGuildList(interaction) {
		interaction
			.editReply({
				content: "Loading guild data",
				ephemeral: true,
			})
			.then(async () => {
				let guildList = [];
				const clientId = await ClientHandler.getClientId();
				await interaction.client.guilds.cache.forEach((guild) => {
					const currGuildBotRole = guild.members.cache
						.get(clientId)
						.roles.cache.find((role) => role.permissions.has(PermissionFlagsBits.Administrator));
					let tGuild = {
						name: guild.name,
						id: guild.id,
						memberSize: guild.memberCount,
						admin: currGuildBotRole?.permissions?.has(PermissionFlagsBits.Administrator),
					};
					guildList.push([tGuild]);
				});
				let adminGuildEmbed = new EmbedBuilder()
					.setColor("Orange")
					.setAuthor({
						name: config.botName + " : Guild List",
						iconURL: config.botpfp,
						url: config.botWebsite,
					})
					.setTitle("Total Guild's found : " + guildList.length)
					.setTimestamp()
					.addFields(
						...guildList.map((gld) => {
							return {
								name: "Guild Name : " + gld[0].name,
								value:
									"Guild ID : " +
									gld[0].id +
									"\nMember Count : " +
									gld[0].memberSize +
									"\nAdmin Role : " +
									(gld[0].admin ? ":white_check_mark:" : ":no_entry_sign:"),
							};
						})
					);
				interaction.editReply({
					content: "",
					embeds: [adminGuildEmbed],
					ephemeral: true,
				});
			});
	}
	static async adminSelfKick(interaction) {
		confirmCode = interaction.options.get("confirmcode").value;
		if (confirmCode === process.env.confirmCode) {
			interaction.editReply(":hourglass: Self Kick Initiated").then(async () => {
				interaction.client.guilds.cache.forEach(async (guild) => {
					if (guild.id) {
						let selfKickEmbed = new EmbedBuilder()
							.setColor("Orange")
							.setAuthor({
								name: config.botName,
								iconURL: config.botpfp,
								url: config.botWebsite,
							})
							.setTitle("Admin Self Kick Initiated")
							.setDescription(
								"There has been a technical issue and the bot need's to remove itself from " +
									guild.name +
									" . Please invite the bot again later. Apologies for the inconvenience."
							)
							.setTimestamp();
						let postChannel = await ClientHandler.getClientGuildPostChannel(guild.id, [
							"general",
							"admin",
							"mod",
							"log",
						]);
						await postChannel
							.send({
								embeds: [selfKickEmbed],
							})
							.catch((error) => {
								EventHandler.auditEvent(
									"ERROR",
									"There was an error posting Self Kick message in the Guild ID : " +
										guild.id +
										" with Error : " +
										error.message,
									error
								);
							});
						guild
							.leave()
							.then(() => EventHandler.auditEvent("NOTICE", "Bot kicked from Guild ID : " + guild.id))
							.catch((err) => {
								EventHandler.auditEvent(
									"ERROR",
									"There was an error while leaving the Guild ID : " + guild.id + " with Error : " + err.message,
									error
								);
							});
					}
				});
				interaction.editReply(":white_check_mark: Self Kick successful"); //Wont work as will self kick
			});
		} else {
			interaction.editReply(`:no_entry: Confirm code verification failed.`);
		}
	}
	static async adminKickGuild(interaction) {
		confirmCode = interaction.options.get("confirmcode").value;
		if (confirmCode === process.env.confirmCode) {
			let guildId = interaction.options.get("guildid").value;
			let success = "no";
			let ackEmbed = new EmbedBuilder()
				.setColor("Orange")
				.setAuthor({
					name: config.botName + " : Admin Command",
					iconURL: config.botpfp,
					url: config.botWebsite,
				})
				.setTitle("Kick Guild")
				.setTimestamp()
				.setDescription(":gear::tools: The guild kick process has been initated. Please wait :timer:");
			let guildKickEmbed = new EmbedBuilder()
				.setColor("Orange")
				.setAuthor({
					name: config.botName,
					iconURL: config.botpfp,
					url: config.botWebsite,
				})
				.setTitle("Bot Kick Initaited")
				.setDescription(
					config.botName +
						" admin has decided to remove the bot from this server. Apologies for the inconvenience.\nPlease contact the developer for more info."
				)
				.setTimestamp();
			await interaction
				.editReply({
					embeds: [ackEmbed],
					ephemeral: true,
				})
				.then(async () => {
					let guild = await ClientHandler.getClientGuild(guildId);
					if (guild) {
						let postChannel = await ClientHandler.getClientGuildPostChannel(guild.id, [
							"general",
							"admin",
							"mod",
							"log",
						]);
						postChannel
							.send({
								embeds: [guildKickEmbed],
							})
							.catch((error) => {
								EventHandler.auditEvent(
									"ERROR",
									"There was an error posting Self Kick message in the Guild ID : " +
										guild.id +
										" with Error : " +
										error.message,
									error
								);
							});
						guild
							.leave()
							.then(() => {
								ackEmbed.setTimestamp().setDescription(":white_check_mark: The guild kick process was successful.");
								interaction.editReply({
									embeds: [ackEmbed],
									ephemeral: true,
								});
								success = "yes";
								EventHandler.auditEvent("NOTICE", "Bot force kicked from Guild ID : " + guild.id);
							})
							.catch((error) => {
								EventHandler.auditEvent(
									"ERROR",
									"There was an error while leaving the Guild ID : " + guild.id + " with Error : " + error.message,
									error
								);
							});
					}
					if (success === "no") {
						ackEmbed.setTimestamp().setDescription(":x: The guild kick process failed.");
						interaction.editReply({
							embeds: [ackEmbed],
							ephemeral: true,
						});
					}
				});
		} else {
			interaction.editReply(`:no_entry: Confirm code verification failed.`);
		}
	}
	static async adminGuildMessage(interaction) {
		let message = interaction.options.get("message").value;
		let guildId = interaction.options.get("guildid").value;
		let success = 0;
		let messageEmbed = new EmbedBuilder()
			.setColor("Orange")
			.setAuthor({
				name: config.botName + " : Admin",
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setTitle("Message from " + config.botName + " Admin")
			.setTimestamp()
			.setDescription(message);

		await interaction
			.editReply({
				content: "Guild message process has started",
				ephemeral: true,
			})
			.then(async () => {
				let guild = await ClientHandler.getClientGuild(guildId);
				if (guild) {
					let postChannel = await ClientHandler.getClientGuildPostChannel(guild.id, ["general", "admin", "mod", "log"]);
					postChannel
						.send({
							embeds: [messageEmbed],
						})
						.then((success = 1))
						.catch((error) => {
							EventHandler.auditEvent(
								"ERROR",
								"There was an error posting admin guild message in the Guild ID : " +
									guild.id +
									" with Error : " +
									error.message,
								error
							);
						});
				}
			});
		if (success === 1) {
			await interaction.editReply({
				content: ":white_check_mark: The guild message was posted successfully",
				ephemeral: true,
			});
		} else {
			await interaction.editReply({
				content: ":x: The guild message process failed",
				ephemeral: true,
			});
		}
	}
	static async adminCheckDeploy(interaction) {
		let clientId = await ClientHandler.getClientId();
		let rest = new REST({ version: "10" }).setToken(token);
		const guildId = interaction.guild.id;
		let count = 1;
		await rest.get(Routes.applicationCommands(clientId)).then((globalData) => {
			globalData.map((data) => {
				let cmdEmbed = new EmbedBuilder()
					.setColor("DarkPurple")
					.setAuthor({
						name: config.botName + " : Admin Command",
						iconURL: config.botpfp,
						url: config.botWebsite,
					})
					.setTitle("Global Command : (" + count + "/" + globalData.length + ")")
					.setTimestamp()
					.addFields(
						{
							name: "Command ID :",
							value: data.id,
						},
						{
							name: "Command Name :",
							value: data.name,
						},
						{
							name: "Command Description :",
							value: data.description,
						},
						{
							name: "Bot ID :",
							value: data.application_id,
						}
					);
				count++;
				interaction.followUp({ embeds: [cmdEmbed], ephemeral: true });
			});
		});
		count = 1;
		await rest.get(Routes.applicationGuildCommands(clientId, guildId)).then((guildData) => {
			guildData.map((data) => {
				let cmdEmbed = new EmbedBuilder()
					.setColor("DarkAqua")
					.setAuthor({
						name: config.botName + " : Admin Command",
						iconURL: config.botpfp,
						url: config.botWebsite,
					})
					.setTitle("Guild Command : (" + count + "/" + guildData.length + ")")
					.setTimestamp()
					.addFields(
						{
							name: "Command ID :",
							value: data.id,
						},
						{
							name: "Command Name :",
							value: data.name,
						},
						{
							name: "Command Description :",
							value: data.description,
						},
						{
							name: "Bot ID :",
							value: data.application_id,
						},
						{
							name: "Guild ID :",
							value: data.guild_id,
						}
					);
				count++;
				interaction.followUp({ embeds: [cmdEmbed], ephemeral: true });
			});
		});
		interaction.editReply(":white_check_mark: Guild commands analysis over");
	}
	static async adminRedeploy(interaction, client) {
		let clientId = await ClientHandler.getClientId();
		confirmCode = interaction.options.get("confirmcode").value;
		if (confirmCode === process.env.confirmCode) {
			let startAckEmbed = new EmbedBuilder()
				.setColor("Orange")
				.setAuthor({
					name: config.botName + " : Admin Command",
					iconURL: config.botpfp,
					url: config.botWebsite,
				})
				.setTitle("Redeploy Global Commands")
				.setTimestamp()
				.setDescription(
					":gear::tools: The global commands re-deployment process has been initated. Please wait :timer:"
				);
			let successAckEmbed = new EmbedBuilder()
				.setColor("Orange")
				.setAuthor({
					name: config.botName + " : Admin Command",
					iconURL: config.botpfp,
					url: config.botWebsite,
				})
				.setTitle("Redeploy Global Commands")
				.setTimestamp()
				.setDescription(":white_check_mark: The re-deployment process was successful.");
			let failedAckEmbed = new EmbedBuilder()
				.setColor("Orange")
				.setAuthor({
					name: config.botName + " : Admin Command",
					iconURL: config.botpfp,
					url: config.botWebsite,
				})
				.setTitle("Redeploy Global Commands")
				.setTimestamp()
				.setDescription(":x: The re-deployment process failed.");

			await interaction.editReply({
				embeds: [startAckEmbed],
				ephemeral: true,
			});

			const commands = GlobalCommands.getInstance(client).getGlobalCommands();

			let rest = new REST({ version: "10" }).setToken(token);
			rest
				.put(Routes.applicationCommands(clientId), { body: commands })
				.then((data) => {
					EventHandler.auditEvent("INFO", "Successfully registered " + data.length + " application commands");
					interaction.editReply({
						embeds: [successAckEmbed],
						ephemeral: true,
					});
				})
				.catch((error) => {
					EventHandler.auditEvent("ERROR", "Failed to register application commands with Error : " + error, error);
					interaction.editReply({
						embeds: [failedAckEmbed],
						ephemeral: true,
					});
				});
		} else {
			interaction.editReply(`:no_entry: Confirm code verification failed.`);
		}
	}
	static async adminCheckVoice(interaction, client) {
		let count = 0;
		client.guilds.cache.forEach((guild) => {
			if (guild.members.me.voice.channelId) {
				count++;
				let cId = guild.members.me.voice.channelId;
				let cName = guild.channels.cache.find((channel) => channel.id === cId);
				let mNum = cName.members.size.toString();
				cName = cName.name;
				let sId = guild.members.me.voice.sessionId;
				let sMute;
				let sDeaf;
				if (guild.members.me.voice.serverDeaf) {
					sDeaf = "Active";
				} else {
					sDeaf = "Not Active";
				}
				if (guild.members.me.voice.serverMute) {
					sMute = "Active";
				} else {
					sMute = "Not Active";
				}
				let voiceEmbed = new EmbedBuilder()
					.setColor("DarkButNotBlack")
					.setAuthor({
						name: config.botName + " : Admin Command",
						iconURL: config.botpfp,
						url: config.botWebsite,
					})
					.setTitle("Active Voice Channel : #" + count)
					.setTimestamp()
					.addFields(
						{
							name: "Guild ID :",
							value: guild.id,
						},
						{
							name: "Guild Name :",
							value: guild.name,
						},
						{
							name: "Channel ID :",
							value: cId,
						},
						{
							name: "Channel Name :",
							value: cName,
						},
						{
							name: "Member Count :",
							value: mNum,
						},
						{
							name: "Session ID :",
							value: sId,
						},
						{
							name: "Server Deaf :",
							value: sDeaf,
						},
						{
							name: "Server Mute :",
							value: sMute,
						}
					);
				interaction.followUp({
					embeds: [voiceEmbed],
					ephemeral: true,
				});
			}
		});
		interaction.editReply(":white_check_mark: Voice Status Analysis : " + count + " guilds found.");
	}
	static async adminDestroyClient(interaction) {
		confirmCode = interaction.options.get("confirmcode").value;
		if (confirmCode === process.env.confirmCode) {
			interaction.editReply(`:white_check_mark: Destroying Discord client`);
			console.log("Destroying Discord Client");
			ClientHandler.destroyClient();
		} else {
			interaction.editReply(`:no_entry: Confirm code verification failed.`);
		}
	}
	static async adminDestroyHeroku(interaction) {
		confirmCode = interaction.options.get("confirmcode").value;
		if (confirmCode === process.env.confirmCode) {
			interaction.editReply(`:white_check_mark: Destroying Heroku dyno in 5 seconds`);
			setTimeout(() => {
				process.kill(process.pid, "SIGTERM");
			}, 5000);
		} else {
			interaction.editReply(`:no_entry: Confirm code verification failed.`);
		}
	}
	static async adminDestroyMongo(interaction) {
		confirmCode = interaction.options.get("confirmcode").value;
		if (confirmCode === process.env.confirmCode) {
			interaction.editReply(`:white_check_mark: Destroying MongoDB instance`);
			console.log("Destroying MongoDB instance");
			mongoose.connection.close();
		} else {
			interaction.editReply(`:no_entry: Confirm code verification failed.`);
		}
	}
	static async adminCleanMemberList(interaction) {
		confirmCode = interaction.options.get("confirmcode").value;
		if (confirmCode === process.env.confirmCode) {
			let threshold = interaction.options.get("threshold").value;
			let result = await LevelHandler.cleanGuildMember(threshold);
			interaction.editReply(
				`:white_check_mark: Cleaned-up a total of : ` + result + ` members matching the threshold.`
			);
		} else {
			interaction.editReply(`:no_entry: Confirm code verification failed.`);
		}
	}
	static async adminBackupMongoDB(interaction) {
		let result = await await DatabaseManager.backupMongo();
		if (result) {
			interaction.editReply(`:white_check_mark: MongoDB backup process successful.`);
		} else {
			interaction.editReply(`:x: MongoDB backup process failed.`);
		}
	}
	static async adminGetInviteGuild(interaction) {
		let guildId = interaction.options.get("guildid").value;
		let prefix = "https://discord.gg/";
		let inviteGuildEmbed;
		let guild = interaction.client.guilds.cache.find((guild) => guild.id === guildId);
		if (guild) {
			inviteGuildEmbed = new EmbedBuilder()
				.setColor("DarkButNotBlack")
				.setAuthor({
					name: config.botName + " : Admin Command",
					iconURL: config.botpfp,
					url: config.botWebsite,
				})
				.setTitle("Guild Invite Fetch : " + guild.name)
				.setTimestamp()
				.addFields(
					{
						name: "Guild ID :",
						value: guild.id,
					},
					{
						name: "Guild Name :",
						value: guild.name,
					}
				);
			let invites = await guild.invites.fetch();
			if (invites.size > 0) {
				let invite = invites.first();
				inviteGuildEmbed.addFields({
					name: "Existing Invite Link :",
					value: prefix + invite.code,
				});
			} else {
				let inviteChannel = await ClientHandler.getClientGuildPostChannel(guild.id, []);
				let newInvite = await guild.invites.create(inviteChannel.id);
				inviteGuildEmbed.addFields({
					name: "New Invite Link :",
					value: prefix + newInvite.code,
				});
			}

			interaction.editReply({ embeds: [inviteGuildEmbed] });
		} else {
			interaction.editReply(`:x: Guild not found`);
		}
	}
}

module.exports = AdminHandler;
