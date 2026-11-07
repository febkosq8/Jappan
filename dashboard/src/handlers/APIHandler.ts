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

export interface AdminGuildDetails extends AdminGuild {
	discoveredAt: number | null;
	preferences: {
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
	};
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
		const { data } = await apiClient.get<AdminGuildDetails>(`/api/v1/admin/guilds/${encodeURIComponent(guildId)}`, {
			withCredentials: true,
		});
		return data;
	}
}

export default APIHandler;
