import { EmbedBuilder, MessageFlags } from "discord.js";
import type { ButtonInteraction } from "discord.js";

import type { Config } from "../services/config.js";
import type { ButtonData, ButtonModule } from "../services/buttonLoader.js";

const buttonData = { id: "DeleteDoppelganger" } satisfies ButtonData;

export async function handleDeleteDoppelganger({
	interaction,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	const fields = new Map(
		interaction.customId
			.split("|")
			.slice(1)
			.flatMap((payload) => payload.split(":"))
			.map((field) => {
				const separatorIndex = field.indexOf("#");
				return [field.slice(0, separatorIndex), field.slice(separatorIndex + 1)] as const;
			}),
	);
	const messageId = fields.get("MID");
	const channelId = fields.get("CID");
	const authorizedUserId = fields.get("UID");
	if (!messageId || !channelId || !authorizedUserId) {
		await interaction.reply({ content: "This delete button is invalid or expired.", flags: MessageFlags.Ephemeral });
		return;
	} else if (interaction.user.id !== authorizedUserId) {
		await interaction.reply({
			content: "Only the notified user can delete this message.",
			flags: MessageFlags.Ephemeral,
		});
		return;
	}

	await interaction.deferUpdate();
	const channel = await interaction.client.channels.fetch(channelId);
	if (!channel?.isTextBased() || !("messages" in channel)) {
		await interaction.editReply({ content: "The original channel is no longer available.", components: [] });
		return;
	}

	try {
		const message = await channel.messages.fetch(messageId);
		await message.delete();
		const notification = interaction.message.embeds[0]
			? EmbedBuilder.from(interaction.message.embeds[0])
					.setColor("Green")
					.setTitle("A doppelganger message was posted")
					.setDescription("The doppelganger message has since been deleted.")
					.setTimestamp()
			: undefined;
		await interaction.editReply({ embeds: notification ? [notification] : [], components: [] });
	} catch {
		const notification = interaction.message.embeds[0]
			? EmbedBuilder.from(interaction.message.embeds[0])
					.setColor("Red")
					.setDescription("The doppelganger message could not be deleted.")
					.setTimestamp()
			: undefined;
		await interaction.editReply({ embeds: notification ? [notification] : [], components: [] });
	}
}

const button: ButtonModule = { buttonData, execute: handleDeleteDoppelganger };

export default button;
