import axios from "axios";

const apiClient = axios.create({
	baseURL: import.meta.env.PROD ? "https://api-jappan.febkosq8.me" : "http://localhost:8875",
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
		const { data } = await apiClient.get<HealthResponse>("/public/health/");
		return data;
	}
}

export default APIHandler;
