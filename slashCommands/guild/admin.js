const config = require("../../config.json");
require("dotenv").config();
const { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType } = require("discord.js");
const EventHandler = require("../../Components/EventHandler");
const ClientHandler = require("../../Components/ClientHandler");
const AdminHandler = require("../../Components/AdminHandler");
const DiscordEventHandler = require("../../Components/DiscordEventHandler");

class admin {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new admin(client);
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
		this.#name = "admin";
		this.#desc = "Admin Commands";
		this.#helpDesc = "Admin Commands";
		this.#cType = "admin";
		this.#id = "1083507815777308683";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addSubcommandGroup((group) =>
				group
					.setName("guild")
					.setDescription("Guild Commands")
					.addSubcommand((subcommand) =>
						subcommand.setName("guildlist").setDescription("Get a list of guild's the bot is currently in"),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("getchannel")
							.setDescription("Get a channel from a guild using id")
							.addStringOption((option) =>
								option.setName("guildid").setDescription("Guild id to get channel from").setRequired(true),
							)
							.addStringOption((option) =>
								option.setName("channelid").setDescription("Channel id to get").setRequired(true),
							),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("selfkick")
							.setDescription("Self kick the bot from all guild's it's currently in")
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true),
							),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("kickguild")
							.setDescription("Kick the bot from a guild")
							.addStringOption((option) =>
								option.setName("guildid").setDescription("Guild ID to kick").setRequired(true),
							)
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true),
							),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("messageguild")
							.setDescription("Send a message to a guild")
							.addStringOption((option) =>
								option.setName("guildid").setDescription("Guild ID to message").setRequired(true),
							)
							.addStringOption((option) =>
								option.setName("message").setDescription("Message to post in the guild").setRequired(true),
							),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("getinviteguild")
							.setDescription("Get a invite link to a guild")
							.addStringOption((option) =>
								option.setName("guildid").setDescription("Guild ID to get Invite for").setRequired(true),
							),
					),
			)
			.addSubcommandGroup((group) =>
				group
					.setName("deploy")
					.setDescription("Deployment Commands")
					.addSubcommand((subcommand) =>
						subcommand.setName("checkdeploy").setDescription("Check deployment status of global and guild commands"),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("redeploy")
							.setDescription("Re deploy global commands to all guild's")
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true),
							),
					),
			)
			.addSubcommandGroup((group) =>
				group
					.setName("bot")
					.setDescription("Bot Commands")
					.addSubcommand((subcommand) =>
						subcommand.setName("checkvoice").setDescription("Check voice connection status of the bot"),
					)
					.addSubcommand((subcommand) =>
						subcommand.setName("getstates").setDescription("Get the current status of the bot"),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("updatedebug")
							.setDescription("Update the debug logs status of the bot")
							.addBooleanOption((option) =>
								option.setName("newstatus").setDescription("New status of the debug logs").setRequired(true),
							),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("updatepingdev")
							.setDescription("Update the ping dev on logs")
							.addBooleanOption((option) =>
								option.setName("newstatus").setDescription("New status of the ping dev").setRequired(true),
							),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("destroyclient")
							.setDescription("Stop the discord bot client")
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true),
							),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("destroyheroku")
							.setDescription("Force heroku client to stop dyno")
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true),
							),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("destroymongo")
							.setDescription("Stop the mongodb instance")
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true),
							),
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("cleanmemberlist")
							.setDescription("Clean the member list for every guild")
							.addNumberOption((option) =>
								option
									.setName("threshold")
									.setDescription("Amount of threshold to clean member's based upon")
									.setRequired(true),
							)
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true),
							),
					)
					.addSubcommand((subcommand) =>
						subcommand.setName("backupmongo").setDescription("Backup the mongodb collection locally"),
					),
			)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.setContexts([InteractionContextType.Guild])
			.toJSON();
	}
	async execute(interaction, client) {
		// console.log(interaction.options.data[0].name); //option : guild
		// console.log(interaction.options._group); //option : guild
		// console.log(interaction.options.data[0].options[0].name); //choice : kickguild
		// console.log(interaction.options.getSubcommand()); //choice : kickguild
		// console.log(interaction.options.data[0].options[0].options); //choices
		// console.log(interaction.options.data[0].options[0].options[0].name); //choice1 name : guildid
		// console.log(interaction.options.data[0].options[0].options[0].value); //choice1 value : 123
		// console.log(interaction.options.data[0].options[0].options[1].name); //choice2 name : confirmcode
		// console.log(interaction.options.data[0].options[0].options[1].value); //choice2 value : yes
		await interaction.deferReply({ ephemeral: true });
		let option = interaction.options._group;
		if (process.env.botAdmin.includes(interaction.member.id)) {
			if (option === "guild") {
				let choice = interaction.options.getSubcommand();
				if (choice === "guildlist") {
					await AdminHandler.adminGuildList(interaction);
				} else if (choice === "selfkick") {
					await AdminHandler.adminSelfKick(interaction);
				} else if (choice === "kickguild") {
					await AdminHandler.adminKickGuild(interaction);
				} else if (choice === "messageguild") {
					await AdminHandler.adminGuildMessage(interaction);
				} else if (choice === "getinviteguild") {
					await AdminHandler.adminGetInviteGuild(interaction);
				} else if (choice === "getchannel") {
					const guildID = interaction.options.get("guildid").value;
					const channelID = interaction.options.get("channelid").value;
					const guild = client.guilds.cache.get(guildID);
					const channel = guild.channels.cache.get(channelID);
					await interaction.editReply({
						content: `Channel name : ${channel.name}`,
						ephemeral: true,
					});
				}
			} else if (option === "deploy") {
				let choice = interaction.options.getSubcommand();
				if (choice === "checkdeploy") {
					await AdminHandler.adminCheckDeploy(interaction);
				} else if (choice === "redeploy") {
					await AdminHandler.adminRedeploy(interaction, client);
				}
			} else if (option === "bot") {
				let choice = interaction.options.getSubcommand();
				if (choice === "checkvoice") {
					await AdminHandler.adminCheckVoice(interaction, client);
				} else if (choice === "destroyclient") {
					await AdminHandler.adminDestroyClient(interaction, client);
				} else if (choice === "destroyheroku") {
					await AdminHandler.adminDestroyHeroku(interaction);
				} else if (choice === "destroymongo") {
					await AdminHandler.adminDestroyMongo(interaction);
				} else if (choice === "cleanmemberlist") {
					await AdminHandler.adminCleanMemberList(interaction);
				} else if (choice === "backupmongo") {
					await AdminHandler.adminBackupMongoDB(interaction);
				} else if (choice === "updatedebug") {
					const newStatus = interaction.options.get("newstatus").value;
					await EventHandler.setDebugState(newStatus);
					await interaction.editReply({
						content: "Debug state updated to : " + newStatus,
						ephemeral: true,
					});
				} else if (choice === "updatepingdev") {
					const newStatus = interaction.options.get("newstatus").value;
					await DiscordEventHandler.setPingDevState(newStatus);
					await interaction.editReply({
						content: "Ping Dev state updated to : " + newStatus,
						ephemeral: true,
					});
				} else if (choice === "getstates") {
					const currDebugState = await EventHandler.getDebugState();
					const currPingDevState = await DiscordEventHandler.getPingDevState();
					await interaction.editReply({
						content: "Debug state : " + currDebugState + "\nPing Dev state : " + currPingDevState,
						ephemeral: true,
					});
				}
			}
		} else {
			EventHandler.auditEvent(
				"NOTICE",
				"User : (" +
					interaction.member.displayName +
					"/" +
					interaction.member.id +
					") tried accessing admin / " +
					option +
					" / " +
					interaction.options.data[0].options[0].name +
					" command and was rejected access.",
			);
			interaction.editReply(
				`:no_entry: You've yeed your last haw. Time to pay for your sins.:imp: :chart_with_upwards_trend:`,
			);
		}
	}
}
module.exports = admin;
