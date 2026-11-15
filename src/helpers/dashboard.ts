import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import type { Config } from "../services/config.js";

type GuildDashboardSection = "service-preferences" | "warnings" | "voice-region-locks";

interface CreateGuildDashboardUrlOptions {
	config: Config;
	guildId: string;
	section?: GuildDashboardSection;
}

interface CreateDashboardLinkActionRowOptions {
	url: string;
	label: string;
}

function createDashboardLinkActionRow({ url, label }: CreateDashboardLinkActionRowOptions) {
	return new ActionRowBuilder<ButtonBuilder>().addComponents(
		new ButtonBuilder().setLabel(label).setStyle(ButtonStyle.Link).setURL(url),
	);
}

export function createGuildDashboardUrl({ config, guildId, section }: CreateGuildDashboardUrlOptions): string {
	const sectionHash = section ? `#${section}` : "";
	return new URL(`/guild/${encodeURIComponent(guildId)}${sectionHash}`, config.BOT_WEBSITE).href;
}

export function createGuildDashboardLinkActionRow(options: CreateGuildDashboardUrlOptions) {
	return createDashboardLinkActionRow({
		url: createGuildDashboardUrl(options),
		label: "Manage in Dashboard",
	});
}

export function createPlaylistDashboardLinkActionRow({ config }: { config: Config }) {
	return createDashboardLinkActionRow({
		url: new URL("/playlists", config.BOT_WEBSITE).href,
		label: "Manage Playlists",
	});
}
