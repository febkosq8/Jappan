import type { ChatInputCommandInteraction, PermissionResolvable } from "discord.js";

export function getMissingBotPermissions(
	interaction: ChatInputCommandInteraction,
	requiredPermissions: readonly PermissionResolvable[] = [],
): string[] {
	if (
		!interaction.guild ||
		!interaction.channel ||
		!("permissionsFor" in interaction.channel) ||
		requiredPermissions.length === 0
	) {
		return [];
	}

	const currentPermissions = interaction.channel.permissionsFor(interaction.client.user);
	if (!currentPermissions) {
		return requiredPermissions.map(String);
	}

	return currentPermissions.missing(requiredPermissions);
}
