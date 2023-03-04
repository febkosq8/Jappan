var pjson = require("../package.json");
const config = require("../config.json");
const { EmbedBuilder, WebhookClient } = require("discord.js");
const ClientHandler = require("./ClientHandler");
require("dotenv").config();
class DiscordEventHandler {
	static async sendDiscordEvent(type, desc, event) {
		let eventEmbed = new EmbedBuilder()
			.setColor("Green")
			.setAuthor({
				name: config.botName,
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setTitle("Event : " + config.botName + " / " + process.env.botMode)
			.setTimestamp()
			.addFields(
				{
					name: "Bot Version",
					value: pjson.version,
				},
				{
					name: "Type",
					value: type,
				},
				{
					name: "Description",
					value: desc,
				}
			);
		if (event) {
			eventEmbed.addFields({
				name: "Event",
				value: event.toString(),
			});
		}
		let webhookClient = new WebhookClient({
			url: process.env.discordEventWebhook,
		});
		webhookClient.send({
			embeds: [eventEmbed],
		});
	}
	static async sendDiscordDMEvent(message) {
		let dmEmbed = new EmbedBuilder()
			.setColor("Yellow")
			.setAuthor({
				name: config.botName,
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setTitle("DM Event : " + config.botName + " / " + process.env.botMode)
			.setTimestamp()
			.addFields(
				{
					name: "Bot Version",
					value: pjson.version,
				},
				{
					name: "Author",
					value: `${message.author}`,
				},
				{
					name: "Content",
					value: message.content,
				}
			);
		let webhookClient = new WebhookClient({
			url: process.env.discordDmWebhook,
		});
		webhookClient.send({
			embeds: [dmEmbed],
		});
	}
	static async sendDiscordDebugEvent(type, desc, event) {
		let debugEmbed = new EmbedBuilder()
			.setColor("Yellow")
			.setAuthor({
				name: config.botName,
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setTitle("DEBUG Event : " + config.botName + " / " + process.env.botMode)
			.setTimestamp()
			.addFields(
				{
					name: "Bot Version",
					value: pjson.version,
				},
				{
					name: "Type",
					value: type,
				},
				{
					name: "Description",
					value: desc,
				}
			);
		if (event) {
			debugEmbed.addFields({
				name: "Debug Event",
				value: event.toString(),
			});
		}
		let webhookClient = new WebhookClient({
			url: process.env.discordDebugWebhook,
		});
		webhookClient.send({
			embeds: [debugEmbed],
		});
	}
	static async sendDiscordErrorEvent(type, desc, event) {
		let errorEmbed = new EmbedBuilder()
			.setColor("Red")
			.setAuthor({
				name: config.botName,
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setTitle("Error Event : " + config.botName + " / " + process.env.botMode)
			.setTimestamp()
			.addFields(
				{
					name: "Bot Version",
					value: pjson.version,
				},
				{
					name: "Type",
					value: type,
				},
				{
					name: "Description",
					value: desc,
				}
			);
		if (event) {
			errorEmbed.addFields({
				name: "Error",
				value: event.toString(),
			});
		}
		let devRole = await ClientHandler.getClientGuildRole("520238382140358678", "1039624543532220467");
		let webhookClient = new WebhookClient({
			url: process.env.discordErrorWebhook,
		});
		webhookClient.send({ content: `${devRole}`, embeds: [errorEmbed] });
	}
}
module.exports = DiscordEventHandler;
