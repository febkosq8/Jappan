import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { apiBaseURL } from "./APIHandler";
import { authErrorURL, safeCallbackPath } from "./authRedirect";

export const authClient = createAuthClient({
	baseURL: `${apiBaseURL}/api/v1/auth`,
	fetchOptions: { credentials: "include" },
	plugins: [
		inferAdditionalFields({
			user: {
				username: { type: "string", required: false },
				status: { type: "string", required: false },
				role: { type: "string", required: false },
			},
		}),
	],
});

export const sessionQueryKey = ["session"] as const;

/**
 * sessionStorage flag set before a sign-out reload so the home page can show a
 * "Signed out successfully" toast after the full navigation lands.
 */
export const SIGN_OUT_FLASH_KEY = "jappan:signedOut";

export async function fetchSession() {
	const { data, error } = await authClient.getSession();
	if (error) {
		throw new Error(error.message ?? "Session check failed");
	}
	return data;
}

export function sessionErrorCode(error: unknown): "NETWORK_ERROR" | "SESSION_CHECK_FAILED" {
	return error instanceof TypeError ? "NETWORK_ERROR" : "SESSION_CHECK_FAILED";
}

export function useSessionQuery(
	options: { refetchOnWindowFocus?: boolean; refetchOnMount?: boolean; refetchOnReconnect?: boolean } = {},
) {
	return useQuery({ queryKey: sessionQueryKey, queryFn: fetchSession, refetchOnWindowFocus: true, ...options });
}

export function isAdminSession(session: Awaited<ReturnType<typeof fetchSession>> | undefined): boolean {
	return session?.user.role === "admin" && (session.user.status === "active" || session.user.status === undefined);
}

/**
 * Shared Discord sign-in flow. Resolves the post-sign-in callback path from the
 * current location (falling back to `/` on the auth-error page when no valid
 * `callbackURL` is present) and starts the social sign-in via better-auth.
 */
export function useSignIn() {
	const [busy, setBusy] = useState(false);

	const signIn = useCallback(async () => {
		setBusy(true);
		try {
			const callbackPath =
				window.location.pathname === "/auth/error"
					? (safeCallbackPath(
							new URLSearchParams(window.location.search).get("callbackURL"),
							window.location.origin,
						) ?? "/")
					: `${window.location.pathname}${window.location.search}${window.location.hash}`;
			const result = await authClient.signIn.social({
				provider: "discord",
				callbackURL: `${window.location.origin}${callbackPath}`,
				errorCallbackURL: authErrorURL(window.location.origin, callbackPath),
			});
			if (result.error) {
				toast.error("Could not start Discord sign-in. Please try again.");
			}
		} catch {
			toast.error("Could not start Discord sign-in. Please try again.");
		} finally {
			setBusy(false);
		}
	}, []);

	return { signIn, busy };
}
