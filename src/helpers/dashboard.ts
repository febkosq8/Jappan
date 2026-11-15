import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

import type { Config } from "../services/config.js";

type GuildDashboardSection =
	| "overview"
	| "admin-actions"
	| "channels"
	| "roles"
	| "evaluate-user"
	| "service-preferences"
	| "warnings"
	| "voice-region-locks"
	| "bot-permissions"
	| "command-permissions"
	| "purge-messages";

interface CreateGuildDashboardUrlOptions {
	config: Config;
	guildId: string;
	section?: GuildDashboardSection;
	userId?: string;
	userAccessTab?: "overview" | "roles" | "channels";
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

export function createGuildDashboardUrl({
	config,
	guildId,
	section,
	userId,
	userAccessTab,
}: CreateGuildDashboardUrlOptions): string {
	const url = new URL(`/guild/${encodeURIComponent(guildId)}`, config.BOT_WEBSITE);
	if (userId) {
		url.searchParams.set("userId", userId);
		if (userAccessTab) url.searchParams.set("userAccessTab", userAccessTab);
	}
	if (section) url.hash = section;
	return url.href;
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
