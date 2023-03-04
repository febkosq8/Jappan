const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const config = require("../../config.json");
const EventHandler = require("../../Components/EventHandler");
const ClientHandler = require("../../Components/ClientHandler");

class makesay {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new makesay(client);
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
	processCommand(client) {
		this.#name = "doppelganger";
		this.#desc = "Make a user say something that you want";
		this.#helpDesc =
			"Clones the target user and makes them say something that you want. The target user will be sent a notification (If thier DM is open) that they have been cloned and will be given the option to delete the cloned message.";
		this.#cType = "fun";
		this.#id = "1050518908186140792";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addUserOption((option) =>
				option.setName("user").setDescription("The user that will be saying the particular message").setRequired(true)
			)
			.addStringOption((option) =>
				option.setName("content").setDescription("The message that you want the user to say").setRequired(true)
			)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction, client) {
		await interaction.deferReply({ ephemeral: true });
		const targetUser = interaction.options.getUser("user");
		const messageContent = interaction.options.getString("content");
		let channelWebhooks = await interaction.channel.fetchWebhooks();
		let finalWebhook;
		channelWebhooks.forEach((webhook) => {
			if (webhook.name === client.user.username + " : Doppelganger" && webhook.owner.id === client.user.id) {
				finalWebhook = webhook;
			}
		});
		if (!finalWebhook) {
			finalWebhook = await interaction.channel.createWebhook({
				name: client.user.username + " : Doppelganger",
				avatar: config.botpfp,
			});
		}
		let guildTargetUser = await ClientHandler.getClientGuildMember(interaction.guildId, targetUser.id);
		let avatar = targetUser.displayAvatarURL();
		let messageSent = await finalWebhook.send({
			content: messageContent,
			username: guildTargetUser.nickname || targetUser.username,
			avatarURL: avatar,
		});
		const butttonLabelList = [
			{
				key: "DeleteDoppelganger|" + messageSent.id + "|" + messageSent.channelId + "|" + interaction.user.id,
				value: "Delete message",
			},
		];

		let buttonRow = new ActionRowBuilder();
		for (let i = 0; i < butttonLabelList.length; i++) {
			buttonRow.addComponents(
				new ButtonBuilder()
					.setCustomId(butttonLabelList[i].key)
					.setLabel(butttonLabelList[i].value)
					.setStyle(ButtonStyle.Danger)
			);
		}
		const dmEmbed = new EmbedBuilder()
			.setColor(0x0099ff)
			.setTitle("Someone used  `/doppelganger` on you")
			.setAuthor({
				name: config.botName + " : Notification",
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setDescription(
				"This command posts a fake message with your name and profile picture and is intended to be used for fun." +
					"\nIf you find the content of the message offensive, You can delete the message and warn the user who did this by clicking the button below."
			)
			.setFields(
				{
					name: "Content",
					value: messageContent + " | [Jump to Message](" + `${messageSent.url}` + ")",
				},
				{
					name: "Location ",
					value: `${interaction.guild}` + " | " + `${interaction.channel}`,
				}
			);
		targetUser.send({ embeds: [dmEmbed], components: [buttonRow] }).catch((error) => {
			if (error.code !== 50007) {
				EventHandler.auditEvent(
					"ERROR",
					"Failed to send the doppelganger DM to User ID :" + targetUser.id + " with Error : " + error.message,
					error
				);
			}
		});
		interaction.editReply({
			content: ":white_check_mark: Message posted successfully",
			ephemeral: true,
		});
	}
}
module.exports = makesay;
