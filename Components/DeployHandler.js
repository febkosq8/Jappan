const { REST, Routes, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const config = require("../config.json");
const GlobalCommands = require("./GlobalCommands");
const GuildCommands = require("./GuildCommands");
const TestCommands = require("./TestCommands");
const ClientHandler = require("./ClientHandler");
const EventHandler = require("./EventHandler");
var token = ClientHandler.getToken();
class DeployHandler {
	globalCommands;
	guildCommands;
	testCommands;
	constructor(client) {
		this.globalCommands = GlobalCommands.getInstance(client).getGlobalCommands();
		this.guildCommands = GuildCommands.getInstance(client).getGuildCommands();
		this.testCommands = TestCommands.getInstance(client).getTestCommands();
	}
	static async postNewGuildConfirmation(guild) {
		try {
			let buttonRow = new ActionRowBuilder();
			buttonRow.addComponents(
				new ButtonBuilder().setCustomId("Help").setLabel("Help Docs").setStyle(ButtonStyle.Primary)
			);

			let welcomeEmbed = new EmbedBuilder()
				.setColor("Orange")
				.setAuthor({
					name: config.botName,
					iconURL: config.botpfp,
					url: config.botWebsite,
				})
				.setTitle("Thanks for inviting " + config.botName + " over.\nWe currently feature :")
				.setTimestamp()
				.addFields(
					{
						name: "Music Commands",
						value: "Play songs from popular sources",
					},
					{
						name: "Fun Commands",
						value: "Impersonate someone or use the soundboard. More fun",
					},
					{
						name: "Leveling System",
						value: "Keep track of active users with a leveling system",
					},
					{
						name: "Moderator Tools",
						value: "Tools to help manage and moderate a server",
					}
				)
				.setFooter({
					text: "Refer our help to learn more",
				});
			let welcomeChannel = await ClientHandler.getClientGuildPostChannel(guild.id, ["general", "welcome", "chat"]);
			welcomeChannel.send({ embeds: [welcomeEmbed], components: [buttonRow] });
			EventHandler.auditEvent("INFO", "Deployment confirmation posted in : " + welcomeChannel.name + " Channel");
		} catch (error) {
			EventHandler.auditEvent("WARN", "Bot deployment failed for : " + guild.name + " with Error : " + error);
		}
	}
	async deployGuildCommands(message) {
		if (process.env.botAdmin.includes(message.author.id)) {
			const guildId = message.guild.id;
			let rest = new REST({ version: "10" }).setToken(token);
			let clientId = await ClientHandler.getClientId();
			await rest
				.put(Routes.applicationGuildCommands(clientId, guildId), {
					body: this.guildCommands,
				})
				.then((data) => {
					message.reply("Guild commands deployed in " + message.guild.name);
					EventHandler.auditEvent(
						"INFO",
						"Successfully registered " + data.length + " guild commands in " + message.guild.name
					);
				})
				.catch((error) => {
					message.reply("Guild commands deployment failed");
					EventHandler.auditEvent(
						"ERROR",
						"Failed to register guild commands in " + message.guild.name + " with Error : " + error,
						error
					);
				});
		} else {
			EventHandler.auditEvent(
				"NOTICE",
				"User : (" +
					message.author.username +
					"/" +
					message.author.id +
					") tried accessing deploy command and was rejected access."
			);
			message.reply(`:no_entry: You've yeed your last haw. Time to pay for your sins.:imp:`);
		}
	}
	async deployTestCommands(message) {
		if (process.env.botAdmin.includes(message.author.id)) {
			const guildId = message.guild.id;
			let rest = new REST({ version: "10" }).setToken(token);
			let clientId = await ClientHandler.getClientId();
			await rest
				.put(Routes.applicationGuildCommands(clientId, guildId), {
					body: this.testCommands,
				})
				.then((data) => {
					message.reply("Test commands deployed in " + message.guild.name);
					EventHandler.auditEvent(
						"INFO",
						"Successfully registered " + data.length + " test commands in " + message.guild.name
					);
				})
				.catch((error) => {
					message.reply("Test commands deployment failed");
					EventHandler.auditEvent(
						"ERROR",
						"Failed to register test commands in " + message.guild.name + " with Error : " + error,
						error
					);
				});
		} else {
			EventHandler.auditEvent(
				"NOTICE",
				"User : (" +
					message.author.username +
					"/" +
					message.author.id +
					") tried accessing test deploy command and was rejected access."
			);
			message.reply(`:no_entry: You've yeed your last haw. Time to pay for your sins.:imp:`);
		}
	}
	async unDeployGlobalCommands(message) {
		if (process.env.botAdmin.includes(message.author.id)) {
			let rest = new REST({ version: "10" }).setToken(token);
			let clientId = await ClientHandler.getClientId();
			await rest
				.put(Routes.applicationCommands(clientId), { body: [] })
				.then(() => {
					message.reply("Global commands has been un deployed from all guilds.:white_check_mark:");
					EventHandler.auditEvent("INFO", "Successfully deleted all Global commands");
				})
				.catch((error) => {
					message.reply("Global commands undeployment failed :no_entry_sign:");
					EventHandler.auditEvent(
						"ERROR",
						"Failed to unregister global commands in " + message.guild.name + " with Error : " + error,
						error
					);
				});
		} else {
			EventHandler.auditEvent(
				"NOTICE",
				"User : (" +
					message.author.username +
					"/" +
					message.author.id +
					") tried accessing unDeployGlobal command and was rejected access"
			);
			message.reply(`:no_entry: You've yeed your last haw. Time to pay for your sins.:imp:`);
		}
	}
	async unDeployGuildCommands(message) {
		if (process.env.botAdmin.includes(message.author.id)) {
			let guildId = message.guild.id;
			let rest = new REST({ version: "10" }).setToken(token);
			let clientId = await ClientHandler.getClientId();
			await rest
				.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] })
				.then(() => {
					message.reply("Guild commands has been un deployed in " + message.guild.name + " :white_check_mark:");
					EventHandler.auditEvent("INFO", "Successfully deleted all guild commands");
				})
				.catch((error) => {
					message.reply("Guild commands undeployment failed :no_entry_sign: ");
					EventHandler.auditEvent(
						"ERROR",
						"Failed to unregister guild commands in " + message.guild.name + " with Error : " + error,
						error
					);
				});
		} else {
			EventHandler.auditEvent(
				"NOTICE",
				"User : (" +
					message.author.username +
					"/" +
					message.author.id +
					") tried accessing unDeployGuild command and was rejected access"
			);
			message.reply(`:no_entry: You've yeed your last haw. Time to pay for your sins.:imp:`);
		}
	}
}

module.exports = DeployHandler;
