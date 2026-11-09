import axios from "axios";
import { WebsocketRequestError } from "@jappan/handlers/websocket";
export default function getErrorMessage(error: unknown, fallback: string): string {
	if (axios.isAxiosError<{ error?: string }>(error)) {
		return error.response?.data?.error ?? fallback;
	}
	if (error instanceof WebsocketRequestError) {
		return error.message;
	}
	return fallback;
}
