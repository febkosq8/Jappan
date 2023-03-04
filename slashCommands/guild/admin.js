const config = require("../../config.json");
require("dotenv").config();
const GlobalCommands = require("../../Components/GlobalCommands");
const { REST, Routes, EmbedBuilder, SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const EventHandler = require("../../Components/EventHandler");
const ClientHandler = require("../../Components/ClientHandler");
const AdminHandler = require("../../Components/AdminHandler");
var token = ClientHandler.getToken();
let confirmCode = "";

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
	constructor(client) {
		this.processCommand(client);
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
		this.#id = "1040456255715676252";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addSubcommandGroup((group) =>
				group
					.setName("guild")
					.setDescription("Guild Commands")
					.addSubcommand((subcommand) =>
						subcommand.setName("guildlist").setDescription("Get a list of guild's the bot is currently in")
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("selfkick")
							.setDescription("Self kick the bot from all guild's it's currently in")
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true)
							)
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("kickguild")
							.setDescription("Kick the bot from a guild")
							.addStringOption((option) =>
								option.setName("guildid").setDescription("Guild ID to kick").setRequired(true)
							)
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true)
							)
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("messageguild")
							.setDescription("Send a message to a guild")
							.addStringOption((option) =>
								option.setName("guildid").setDescription("Guild ID to message").setRequired(true)
							)
							.addStringOption((option) =>
								option.setName("message").setDescription("Message to post in the guild").setRequired(true)
							)
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("getinviteguild")
							.setDescription("Get a invite link to a guild")
							.addStringOption((option) =>
								option.setName("guildid").setDescription("Guild ID to get Invite for").setRequired(true)
							)
					)
			)
			.addSubcommandGroup((group) =>
				group
					.setName("deploy")
					.setDescription("Deployment Commands")
					.addSubcommand((subcommand) =>
						subcommand.setName("checkdeploy").setDescription("Check deployment status of global and guild commands")
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("redeploy")
							.setDescription("Re deploy global commands to all guild's")
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true)
							)
					)
			)
			.addSubcommandGroup((group) =>
				group
					.setName("bot")
					.setDescription("Bot Commands")
					.addSubcommand((subcommand) =>
						subcommand.setName("checkvoice").setDescription("Check voice connection status of the bot")
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("destroyclient")
							.setDescription("Stop the discord bot client")
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true)
							)
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("destroyheroku")
							.setDescription("Force heroku client to stop dyno")
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true)
							)
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("destroymongo")
							.setDescription("Stop the mongodb instance")
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true)
							)
					)
					.addSubcommand((subcommand) =>
						subcommand
							.setName("cleanmemberlist")
							.setDescription("Clean the member list for every guild")
							.addNumberOption((option) =>
								option
									.setName("threshold")
									.setDescription("Amount of threshold to clean member's based upon")
									.setRequired(true)
							)
							.addStringOption((option) =>
								option
									.setName("confirmcode")
									.setDescription("Confirmation Code to process the request")
									.setRequired(true)
							)
					)
					.addSubcommand((subcommand) =>
						subcommand.setName("backupmongo").setDescription("Backup the mongodb collection locally")
					)
			)
			.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction, client) {
		// console.log(interaction.options.data[0].name); //option : guild
		// console.log(interaction.options._group); //option : guild
		// console.log(interaction.options.data[0].options[0].name); //choice : kickguild
		// console.log(interaction.options._subcommand); //choice : kickguild
		// console.log(interaction.options.data[0].options[0].options); //choices
		// console.log(interaction.options.data[0].options[0].options[0].name); //choice1 name : guildid
		// console.log(interaction.options.data[0].options[0].options[0].value); //choice1 value : 123
		// console.log(interaction.options.data[0].options[0].options[1].name); //choice2 name : confirmcode
		// console.log(interaction.options.data[0].options[0].options[1].value); //choice2 value : yes
		await interaction.deferReply({ ephemeral: true });
		let option = interaction.options._group;
		let clientId = await ClientHandler.getClientId();
		if (process.env.botAdmin.includes(interaction.member.id)) {
			if (option === "guild") {
				let choice = interaction.options._subcommand;
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
				}
			} else if (option === "deploy") {
				let choice = interaction.options._subcommand;
				if (choice === "checkdeploy") {
					await AdminHandler.adminCheckDeploy(interaction);
				} else if (choice === "redeploy") {
					await AdminHandler.adminRedeploy(interaction, client);
				}
			} else if (option === "bot") {
				let choice = interaction.options._subcommand;
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
					" command and was rejected access."
			);
			interaction.editReply(
				`:no_entry: You've yeed your last haw. Time to pay for your sins.:imp: :chart_with_upwards_trend:`
			);
		}
	}
}
module.exports = admin;
