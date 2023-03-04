const EventHandler = require("./EventHandler");
const { SnowflakeUtil } = require("discord.js");
class ClearHandler {
	static async clearChannelMessages(interaction) {
		try {
			let count = interaction.options.get("count");
			let user = interaction.options.getUser("username");
			let channel = interaction.channel;
			if (!count) {
				count = 100;
			} else {
				count = count.value;
			}
			if (count > 100) {
				interaction.editReply({
					content: ":no_entry: Max Limit is 100. Please re-run the command.",
					ephemeral: true,
				});
			} else {
				let channelMessages = await channel.messages.fetch({
					limit: user?.id ? 100 : count === 100 ? count : count + 1,
					after: SnowflakeUtil.generate({ timestamp: Date.now() - 1209600000 }),
				});
				if (channelMessages.size === 0) {
					interaction.editReply({
						content: `:warning: Didn't find any messages to delete within the last 14 days.`,
						ephemeral: true,
					});
				} else {
					if (!user?.id && count) {
						let result = await channel.bulkDelete(count, true);
						interaction.editReply({
							content: `:white_check_mark: Successfully deleted ${result.size} messages.`,
							ephemeral: true,
						});
					} else {
						if (user?.id) {
							channelMessages = channelMessages.filter((m) => m.author.id === user.id);
						}
						if (channelMessages.size > count) {
							channelMessages = channelMessages.first(count);
						}
						let result = await channel.bulkDelete(channelMessages);
						interaction.editReply({
							content: `:white_check_mark: Successfully deleted ${result.size} messages.`,
							ephemeral: true,
						});
					}
				}
			}
		} catch (error) {
			interaction.editReply({
				content: ":warning: There was an error while clearing messages from this guild",
				ephemeral: true,
			});
			EventHandler.auditEvent(
				"ERROR",
				"There was an error while clearing messages in Guild ID : " + interaction.guildId + " with Error : " + error,
				error
			);
		}
	}
	static async clearGuildUserMessages(interaction) {
		try {
			let user = interaction.options.getUser("username");
			let guild = interaction.guild;
			let channels = await guild.channels.fetch();
			let channelMessages;
			let deleteCount = 0;
			let messagesLength = 0;
			for (let channel of channels) {
				if (channel[1].type != 4 && channel[1].type != 13 && channel[1].type != 15) {
					channelMessages = await channel[1]?.messages?.fetch({ limit: 100 });
					messagesLength += channelMessages?.filter(
						(m) => m.author.id === user.id && interaction.id !== m.interaction?.id
					).size;
					channelMessages?.forEach((message) => {
						if (interaction.id !== message.interaction?.id) {
							if (user.id === message.author.id) {
								deleteCount++;
								message.delete().then(() => {
									if (deleteCount === messagesLength) {
										interaction.editReply({
											content: `:white_check_mark: Successfully deleted ${deleteCount} messages.`,
											ephemeral: true,
										});
									}
								});
							}
						}
					});
				}
			}
		} catch (error) {
			interaction.editReply({
				content: ":warning: There was an error while bulk clearing messages from this guild",
				ephemeral: true,
			});
			EventHandler.auditEvent(
				"ERROR",
				"There was an error while bulk clearing messages in Guild ID : " +
					interaction.guildId +
					" with Error : " +
					error,
				error
			);
		}
	}
}

module.exports = ClearHandler;
