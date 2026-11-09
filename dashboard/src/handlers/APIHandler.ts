import axios from "axios";

export const apiBaseURL =
	import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "https://api-jappan.febkosq8.me" : "http://localhost:8875");

const HEALTH_TIMEOUT_MS = 10_000;

const apiClient = axios.create({
	baseURL: apiBaseURL,
	timeout: 0,
});

export interface HealthResponse {
	healthy: boolean;
	services: {
		db: boolean;
		discord: boolean;
		player: boolean;
	};
}

export interface AdminBotPlayerSession {
	sessionId: string;
	guild: { id: string; name: string; icon: string | null };
	channel: { id: string; name: string } | null;
	owner: { id: string; username: string; avatarUrl: string | null };
	queueSize: number;
	nowPlaying: {
		name: string;
		url: string | null;
		timestamp: { current: string; total: string | null } | null;
	} | null;
	playerState: "Playing" | "Paused";
}

export interface BotStatus {
	botName: string;
	botAvatarUrl: string;
	botId: string | null;
	version: string;
	bootedTimestampMs: number;
	guildCount: number;
	memberCount: number | null;
	gatewayLatencyMs: number | null;
}

export interface AdminBotShutdownResult {
	scheduled: true;
	delayMilliseconds: number;
}

export interface AdminBotGuildUndeploymentResult {
	undeployedGuilds: { id: string; name: string }[];
	failedGuilds: { id: string; name: string }[];
	timeLimitReached: boolean;
}

export interface AdminBotSelfKickResult {
	protectedGuild: { id: string; name: string } | null;
	leftGuilds: { id: string; name: string; messageSent: boolean }[];
	failedGuilds: { id: string; name: string; messageSent: boolean }[];
	timeLimitReached: boolean;
}

interface AdminGuildBase {
	id: string;
	name: string;
	isActiveMember: boolean;
	icon?: string | null;
	memberCount?: number;
	channelCount?: number;
	createdTimestampMs?: number;
	description?: string;
	joinedTimestampMs?: number;
	systemChannel?: { id: string; name: string } | null;
	permissions?: string[];
	hasRequiredPermissions?: boolean;
	owner?: { userId: string; avatarUrl: string; username: string };
}

export interface AdminGuild extends AdminGuildBase {
	guildCommandDeploymentState?: { deployed: number; total: number };
}

export interface PreferenceEntity {
	id: string;
	name: string | null;
}

export interface AdminGuildChannel {
	id: string;
	name: string;
	type: number;
	typeName: string;
	createdTimestampMs: number;
	parent: PreferenceEntity | null;
	position: number;
	canSendMessage: boolean;
	topic?: string | null;
	nsfw?: boolean;
	rateLimitPerUser?: number | null;
	bitrate?: number;
	userLimit?: number;
}

export interface AdminGuildMessageResult {
	channelId: string;
	channelName: string;
	messageUrl: string;
}

export interface AdminGuildKickResult {
	departureMessage: {
		channelId: string;
		channelName: string;
		messageUrl: string;
		messageType: "embed" | "normal";
	} | null;
}

export interface AdminGuildCommandDeploymentResult {
	action: "deploy" | "undeploy";
	commandCount: number;
}

export interface AdminGuildInvite {
	url: string;
	channel: { id: string; name: string | null } | null;
	maxAge: number | null;
	createdTimestampMs: number | null;
	expiresTimestampMs: number | null;
	uses: number | null;
	maxUses: number | null;
	temporary: boolean;
	inviter: { id: string; username: string } | null;
}

export interface ServicePreferences {
	auditLog: { enabled: boolean; channel: PreferenceEntity | null; fullVerbosity: boolean };
	leveling: { enabled: boolean; threshold: number | null; role: PreferenceEntity | null };
	memberAnnouncements: {
		joinEnabled: boolean;
		leaveEnabled: boolean;
		joinChannel: PreferenceEntity | null;
		leaveChannel: PreferenceEntity | null;
	};
	warnings: {
		timeoutThreshold: number | null;
		timeoutDurationHours: number | null;
		banThreshold: number | null;
		auditChannel: PreferenceEntity | null;
	};
}

export interface AdminGuildDetails extends AdminGuildBase {
	discoveredTimestampMs: number | null;
	guildCommandDeploymentState?: { deployed: number; total: number };
	servicePreferences: ServicePreferences;
}

export interface UserGuild {
	id: string;
	name: string;
	icon?: string | null;
	hasRequiredPermissions?: boolean;
	owner?: { userId: string; avatarUrl: string; username: string };
}

export interface UserGuildDetails extends UserGuild {
	createdTimestampMs?: number;
	joinedTimestampMs?: number;
	servicePreferences: ServicePreferences;
	permissions?: string[];
}

export interface ServicePreferencesEditorGuild {
	id: string;
	isActiveMember: boolean;
	servicePreferences: ServicePreferences;
}

export interface GuildRole {
	id: string;
	name: string;
	position: number;
	managed: boolean;
	assignable: boolean;
}

export interface AuditLogPreferenceInput {
	enabled: boolean;
	channelId: string | null;
	fullVerbosity: boolean;
}

export interface LevelingPreferenceInput {
	enabled: boolean;
	threshold: number | null;
	roleId: string | null;
}

export interface MemberAnnouncementsPreferenceInput {
	joinEnabled: boolean;
	joinChannelId: string | null;
	leaveEnabled: boolean;
	leaveChannelId: string | null;
}

export interface WarningsPreferenceInput {
	timeoutThreshold: number | null;
	timeoutDurationHours: number | null;
	banThreshold: number | null;
	auditChannelId: string | null;
}

export interface GlobalCommand {
	id: string | null;
	type: "command" | "sub-command";
	name: string;
	description: string;
	category: "general" | "music" | "level" | "fun" | "moderator" | "admin";
	requiredBotPermissions: string[];
	requiredUserPermissions: string[];
}

export interface PlayerTrack {
	id: string;
	title: string;
	author: string;
	url: string | null;
	thumbnailUrl: string | null;
	source: string;
	durationMs: number;
	requestedBy: { username: string; avatarUrl: string | null } | null;
}
export interface PlayerSession {
	sessionId: string;
	guild: { name: string; iconUrl: string | null };
	channel: { name: string; listenerCount: number } | null;
	owner: { username: string; avatarUrl: string | null };
	locked: boolean;
	lastChangedBy: {
		username: string;
		avatarUrl: string | null;
		source: "discord" | "web";
		timestampMs: number;
	} | null;
	viewer: {
		isOwner: boolean;
		isAdmin: boolean;
		inVoiceChannel: boolean;
		canControl: boolean;
		canToggleLock: boolean;
	};
	playerState: "Playing" | "Paused" | "Idle";
	volume: number;
	shuffle: boolean;
	repeatMode: { value: 0 | 1 | 2 | 3; label: "off" | "track" | "queue" | "autoplay" };
	nowPlaying: (PlayerTrack & { positionMs: number }) | null;
	previousTrack: PlayerTrack | null;
	queue: { size: number; totalDurationMs: number; tracks: (PlayerTrack & { index: number })[] };
	historySize: number;
	capabilities: {
		canPause: boolean;
		canResume: boolean;
		canSkip: boolean;
		canPrevious: boolean;
		canSeek: boolean;
		canShuffle: boolean;
		canClear: boolean;
	};
	serverTimestampMs: number;
}
export interface PlayerSuggestion {
	kind: "track" | "playlist" | "savedPlaylist";
	title: string;
	value: string;
}
export type PlayerControlAction =
	| { path: "pause" | "resume" | "next" | "previous" | "stop" | "queue/clear" | "lock" | "unlock" }
	| { path: "shuffle"; body: { enabled?: boolean } }
	| { path: "repeat"; body: { mode?: 0 | 1 | 2 | 3 } }
	| { path: "volume"; body: { volume: number } }
	| { path: "seek"; body: { positionMs: number } }
	| { path: "queue/remove" | "queue/skip-to"; body: { index: number } }
	| { path: "queue/add"; body: { query: string } };
class APIHandler {
	static async getHealth(): Promise<HealthResponse> {
		const { data } = await apiClient.get<HealthResponse>("/api/v1/public/health/", { timeout: HEALTH_TIMEOUT_MS });
		return data;
	}

	static async getGlobalCommands(): Promise<GlobalCommand[]> {
		const { data } = await apiClient.get<GlobalCommand[]>("/api/v1/public/commands");
		return data;
	}

	static async getPlayerSession(sessionId: string): Promise<PlayerSession> {
		const { data } = await apiClient.get<PlayerSession>(`/api/v1/player/${encodeURIComponent(sessionId)}`, {
			withCredentials: true,
		});
		return data;
	}
	static async getPlayerSuggestions(sessionId: string, query: string): Promise<PlayerSuggestion[]> {
		const { data } = await apiClient.get<{ suggestions: PlayerSuggestion[] }>(
			`/api/v1/player/${encodeURIComponent(sessionId)}/suggestions`,
			{ params: { q: query }, withCredentials: true },
		);
		return data.suggestions;
	}
	static async controlPlayerSession(sessionId: string, action: PlayerControlAction): Promise<void> {
		await apiClient.post<void>(
			`/api/v1/player/${encodeURIComponent(sessionId)}/controls/${action.path}`,
			"body" in action ? action.body : {},
			{ withCredentials: true },
		);
	}
	static async getAdminGuilds(): Promise<AdminGuild[]> {
		const { data } = await apiClient.get<AdminGuild[]>("/api/v1/admin/guilds", { withCredentials: true });
		return data;
	}

	static async getUserGuilds(): Promise<UserGuild[]> {
		const { data } = await apiClient.get<UserGuild[]>("/api/v1/guilds/", { withCredentials: true });
		return data;
	}

	static async getUserGuild(guildId: string): Promise<UserGuildDetails> {
		const { data } = await apiClient.get<UserGuildDetails>(`/api/v1/guilds/${encodeURIComponent(guildId)}`, {
			withCredentials: true,
		});
		return data;
	}

	static async getBotStatus(): Promise<BotStatus> {
		const { data } = await apiClient.get<BotStatus>("/api/v1/public/bot");
		return data;
	}

	static async getAdminBotPlayerState(): Promise<AdminBotPlayerSession[]> {
		const { data } = await apiClient.get<AdminBotPlayerSession[]>("/api/v1/admin/bot/player-sessions", {
			withCredentials: true,
		});
		return data;
	}

	static async refreshAdminBotPlayerHealth(): Promise<{ healthy: boolean }> {
		const { data } = await apiClient.put<{ healthy: boolean }>("/api/v1/admin/bot/player-health-check", undefined, {
			withCredentials: true,
			timeout: HEALTH_TIMEOUT_MS,
		});
		return data;
	}

	static async stopAdminBot(): Promise<AdminBotShutdownResult> {
		const { data } = await apiClient.delete<AdminBotShutdownResult>("/api/v1/admin/bot/stop", {
			data: { confirm: true },
			withCredentials: true,
		});
		return data;
	}

	static async undeployAdminBotGuildCommands(): Promise<AdminBotGuildUndeploymentResult> {
		const { data } = await apiClient.delete<AdminBotGuildUndeploymentResult>("/api/v1/admin/bot/undeploy-guilds", {
			data: { confirm: true },
			withCredentials: true,
		});
		return data;
	}

	static async selfKickAdminBot(message: string): Promise<AdminBotSelfKickResult> {
		const { data } = await apiClient.delete<AdminBotSelfKickResult>("/api/v1/admin/bot/self-kick", {
			data: { confirm: true, message },
			withCredentials: true,
		});
		return data;
	}

	static async getAdminGuild(guildId: string): Promise<AdminGuildDetails> {
		const { data } = await apiClient.get<AdminGuildDetails>(`/api/v1/admin/guilds/${encodeURIComponent(guildId)}`, {
			withCredentials: true,
		});
		return data;
	}

	static async getGuildChannels(guildId: string): Promise<AdminGuildChannel[]> {
		const { data } = await apiClient.get<AdminGuildChannel[]>(
			`/api/v1/guilds/${encodeURIComponent(guildId)}/channels`,
			{ withCredentials: true },
		);
		return data;
	}

	static async getGuildRoles(guildId: string): Promise<GuildRole[]> {
		const { data } = await apiClient.get<GuildRole[]>(`/api/v1/guilds/${encodeURIComponent(guildId)}/roles`, {
			withCredentials: true,
		});
		return data;
	}

	private static async updateServicePreference<Input>(guildId: string, action: string, input: Input): Promise<void> {
		await apiClient.patch<void>(`/api/v1/guilds/${encodeURIComponent(guildId)}/${action}`, input, {
			withCredentials: true,
		});
	}

	static updateAuditLogPreference(guildId: string, input: AuditLogPreferenceInput) {
		return APIHandler.updateServicePreference(guildId, "audit-log", input);
	}

	static updateLevelingPreference(guildId: string, input: LevelingPreferenceInput) {
		return APIHandler.updateServicePreference(guildId, "leveling", input);
	}

	static updateMemberAnnouncementsPreference(guildId: string, input: MemberAnnouncementsPreferenceInput) {
		return APIHandler.updateServicePreference(guildId, "member-announcements", input);
	}

	static updateWarningsPreference(guildId: string, input: WarningsPreferenceInput) {
		return APIHandler.updateServicePreference(guildId, "warnings", input);
	}

	static async sendAdminGuildMessage(
		guildId: string,
		message: string,
		channelId: string,
	): Promise<AdminGuildMessageResult> {
		const { data } = await apiClient.put<AdminGuildMessageResult>(
			`/api/v1/admin/guilds/${encodeURIComponent(guildId)}/messages`,
			{ message, channelId },
			{ withCredentials: true },
		);
		return data;
	}

	static async createAdminGuildInvite(guildId: string): Promise<AdminGuildInvite> {
		const { data } = await apiClient.post<AdminGuildInvite>(
			`/api/v1/admin/guilds/${encodeURIComponent(guildId)}/invite`,
			undefined,
			{ withCredentials: true },
		);
		return data;
	}

	static async kickAdminGuild(
		guildId: string,
		message: string,
		channelId: string | null,
	): Promise<AdminGuildKickResult> {
		const { data } = await apiClient.delete<AdminGuildKickResult>(
			`/api/v1/admin/guilds/${encodeURIComponent(guildId)}/kick`,
			{
				data: { confirm: true, message, channelId },
				withCredentials: true,
			},
		);
		return data;
	}

	static async updateAdminGuildCommands(
		guildId: string,
		action: "deploy" | "undeploy",
	): Promise<AdminGuildCommandDeploymentResult> {
		const path = `/api/v1/admin/guilds/${encodeURIComponent(guildId)}/commands`;
		const { data } =
			action === "deploy"
				? await apiClient.put<AdminGuildCommandDeploymentResult>(path, undefined, { withCredentials: true })
				: await apiClient.delete<AdminGuildCommandDeploymentResult>(path, { withCredentials: true });
		return data;
	}
}

export default APIHandler;
