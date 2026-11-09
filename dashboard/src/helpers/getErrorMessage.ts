import axios from "axios";

export default function getErrorMessage(error: unknown, fallback: string): string {
	if (axios.isAxiosError<{ error?: string }>(error)) {
		return error.response?.data?.error ?? fallback;
	}
	return fallback;
}
