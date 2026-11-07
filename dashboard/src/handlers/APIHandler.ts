import axios from "axios";

export const apiBaseURL =
	import.meta.env.VITE_API_URL || (import.meta.env.PROD ? "https://api-jappan.febkosq8.me" : "http://localhost:8875");

const apiClient = axios.create({
	baseURL: apiBaseURL,
	timeout: 10000,
});

export interface HealthResponse {
	healthy: boolean;
	services: {
		db: boolean;
		discord: boolean;
		player: boolean;
	};
}

export interface AdminGuild {
	id: string;
	name: string;
	isActiveMember: boolean;
	icon?: string | null;
	memberCount?: number;
	channelCount?: number;
	createdAt?: number;
	description?: string | null;
	joinedTimestamp?: number;
	systemChannel?: { id: string; name: string } | null;
	permissions?: string[];
	hasRequiredPermissions?: boolean;
	owner?: { userId: string; avatarUrl: string; username: string };
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
	createdAt: number;
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

export interface AdminGuildInvite {
	url: string;
	channel: { id: string; name: string | null } | null;
	maxAge: number | null;
	createdTimestamp: number | null;
	expiresTimestamp: number | null;
	uses: number | null;
	maxUses: number | null;
	temporary: boolean;
	inviter: { id: string; username: string } | null;
}

export interface GuildPreferences {
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

export interface AdminGuildDetails extends AdminGuild {
	discoveredAt: number | null;
	guildCommandDeployment: { deployed: number; total: number } | null;
	preferences: GuildPreferences;
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

class APIHandler {
	static async getHealth(): Promise<HealthResponse> {
		const { data } = await apiClient.get<HealthResponse>("/api/v1/public/health/");
		return data;
	}

	static async getGlobalCommands(): Promise<GlobalCommand[]> {
		const { data } = await apiClient.get<GlobalCommand[]>("/api/v1/public/commands");
		return data;
	}

	static async getAdminGuilds(): Promise<AdminGuild[]> {
		const { data } = await apiClient.get<AdminGuild[]>("/api/v1/admin/guilds", { withCredentials: true });
		return data;
	}

	static async getAdminGuild(guildId: string): Promise<AdminGuildDetails> {
		const { data } = await apiClient.get<AdminGuildDetails>(`/api/v1/guild/${encodeURIComponent(guildId)}`, {
			withCredentials: true,
		});
		return data;
	}

	static async getAdminGuildChannels(guildId: string): Promise<AdminGuildChannel[]> {
		const { data } = await apiClient.get<AdminGuildChannel[]>(
			`/api/v1/guild/${encodeURIComponent(guildId)}/channels`,
			{ withCredentials: true },
		);
		return data;
	}

	static async getGuildRoles(guildId: string): Promise<GuildRole[]> {
		const { data } = await apiClient.get<GuildRole[]>(`/api/v1/guild/${encodeURIComponent(guildId)}/roles`, {
			withCredentials: true,
		});
		return data;
	}

	private static async updateGuildPreference<Input>(guildId: string, action: string, input: Input): Promise<void> {
		await apiClient.put<void>(`/api/v1/guild/${encodeURIComponent(guildId)}/${action}`, input, {
			withCredentials: true,
		});
	}

	static updateAuditLogPreference(guildId: string, input: AuditLogPreferenceInput) {
		return APIHandler.updateGuildPreference(guildId, "audit-log", input);
	}

	static updateLevelingPreference(guildId: string, input: LevelingPreferenceInput) {
		return APIHandler.updateGuildPreference(guildId, "leveling", input);
	}

	static updateMemberAnnouncementsPreference(guildId: string, input: MemberAnnouncementsPreferenceInput) {
		return APIHandler.updateGuildPreference(guildId, "member-announcements", input);
	}

	static updateWarningsPreference(guildId: string, input: WarningsPreferenceInput) {
		return APIHandler.updateGuildPreference(guildId, "warnings", input);
	}

	static async sendAdminGuildMessage(
		guildId: string,
		message: string,
		channelId: string,
	): Promise<AdminGuildMessageResult> {
		const { data } = await apiClient.post<AdminGuildMessageResult>(
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
		const { data } = await apiClient.post<AdminGuildKickResult>(
			`/api/v1/admin/guilds/${encodeURIComponent(guildId)}/kick`,
			{ confirm: true, message, channelId },
			{ withCredentials: true, timeout: 120000 },
		);
		return data;
	}
}

export default APIHandler;
