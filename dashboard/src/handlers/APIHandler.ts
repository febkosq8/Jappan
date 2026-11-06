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

class APIHandler {
	static async getHealth(): Promise<HealthResponse> {
		const { data } = await apiClient.get<HealthResponse>("/api/v1/public/health/");
		return data;
	}
}

export default APIHandler;
