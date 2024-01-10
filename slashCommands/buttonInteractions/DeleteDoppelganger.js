const config = require("../../config.json");
const ClientHandler = require("../../Components/ClientHandler");
class DeleteDoppelganger {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new DeleteDoppelganger(client);
		}
		return this.instance;
	}
	async execute(interaction) {
		interaction.reply({ content: "We are working on purging that message" });
		const index = interaction.customId.indexOf("|");
		let triggerData = interaction.customId.substring(index + 1).split("|");
		let channel = await ClientHandler.getClientChannel(triggerData[1]);
		let message = await channel.messages
			.fetch(triggerData[0])
			.then(async (message) => {
				await message.delete();
				return message;
			})
			.catch(() => {});
		let triggerUser = await ClientHandler.getClientUser(triggerData[2]);
		let dmChannel = await interaction.user.createDM();
		let dmMessage = await dmChannel.messages.fetch(interaction.message.id);
		dmMessage.delete();
		interaction.deleteReply();
		interaction.user.send({
			content: ":white_check_mark: Deleted that message and notified the user who triggered it",
		});
		triggerUser.send({
			content:
				`${interaction.user}` +
				" didn't like that you used `/doppelganger` on them." +
				"\n They requested me to delete that message" +
				(message ? " (||" + message.content + "||)" : ""),
			files: ["https://media.giphy.com/media/97SMZqrK8WQy6kQ4JM/giphy.gif"],
		});
	}
}
module.exports = DeleteDoppelganger;
