import { Button, Card, PillLink } from "@febkosq8/arc";
import { authClient } from "@jappan/handlers/auth";
import LoadingIndicator from "@jappan/components/jappan/LoadingIndicator";
import { useState } from "react";
import { FiAlertTriangle, FiArrowLeft } from "react-icons/fi";
import { SiDiscord } from "react-icons/si";
import { useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

const authErrorMessages: Record<string, string> = {
	USER_BLOCKED: "This account is blocked from signing in.\nContact support if you believe this is a mistake.",
	invalid_callback_request: "The sign-in response was invalid.\nPlease try again.",
	no_code: "Discord did not provide an authorization code.\nPlease try again.",
	oauth_provider_not_found: "Discord sign-in is currently unavailable.\nPlease try again later.",
	invalid_code: "The Discord authorization code expired or was invalid.\nPlease try again.",
	unable_to_get_user_info: "We couldn't retrieve your Discord profile.\nPlease try again.",
	no_callback_url: "The sign-in request could not be completed.\nPlease try again.",
	email_not_found: "Your Discord account did not provide an email address required for sign-in.",
	internal_server_error: "Something went wrong while signing you in.\nPlease try again later.",
	state_mismatch: "The sign-in request could not be verified.\nPlease try again.",
	account_not_linked: "This Discord account is not linked to an existing account.",
	unable_to_create_user: "We couldn't create your account.\nPlease try again later.",
	unable_to_create_session: "We couldn't start your session.\nPlease try again later.",
};

export default function AuthError() {
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const [busy, setBusy] = useState(false);
	const errorCode = searchParams.get("error") ?? "unknown";
	const unauthenticated = errorCode === "UNAUTHENTICATED";
	const forbidden = errorCode === "FORBIDDEN";
	const errorMessage = unauthenticated
		? "Sign in to access this page."
		: forbidden
			? "Your account does not have permission to access this page."
			: (authErrorMessages[errorCode] ?? "Discord sign-in couldn't be completed. Please try again later.");
	const title = unauthenticated ? "Sign in required" : forbidden ? "Access forbidden" : "We couldn't sign you in";
	document.title = unauthenticated
		? "Sign in required - Jappan"
		: forbidden
			? "Access forbidden - Jappan"
			: "Sign-in error - Jappan";

	async function retrySignIn() {
		const state: unknown = location.state;
		const returnTo = typeof state === "object" && state !== null && "returnTo" in state ? state.returnTo : null;
		const path =
			unauthenticated && typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//")
				? returnTo
				: "/";
		setBusy(true);
		try {
			const result = await authClient.signIn.social({
				provider: "discord",
				callbackURL: `${window.location.origin}${path}`,
				errorCallbackURL: `${window.location.origin}/auth/error`,
			});
			if (result.error) {
				toast.error("Could not start Discord sign-in. Please try again.");
			}
		} catch {
			toast.error("Could not start Discord sign-in. Please try again.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-10">
			<Card className="w-full max-w-lg" aria-labelledby="auth-error-title" hoverLift={false}>
				<Card.Content className="flex flex-col items-center p-6 text-center sm:p-8">
					<span
						className="mb-4 grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive"
						aria-hidden="true"
					>
						<FiAlertTriangle className="size-7" />
					</span>
					<p className="text-sm font-semibold uppercase tracking-wide text-destructive">
						{unauthenticated ? "401" : forbidden ? "403" : "Sign-in error"}
					</p>
					<h1 id="auth-error-title" className="mt-2 text-2xl font-bold tracking-tight">
						{title}
					</h1>
					<p className="mt-3 text-muted-foreground">{errorMessage}</p>
					{!unauthenticated && !forbidden && (
						<div className="mt-5 w-full rounded-md border border-border bg-muted px-3 py-2 text-left">
							<p className="text-xs text-muted-foreground">Error code</p>
							<p className="mt-1 break-all font-mono text-sm">{errorCode}</p>
						</div>
					)}
					<div className="mt-6 flex w-full flex-col-reverse gap-3 sm:flex-row">
						<PillLink href="/" variant="outline-secondary" className="flex-1 gap-2">
							<FiArrowLeft aria-hidden="true" />
							Back home
						</PillLink>
						{!forbidden && (
							<Button className="flex-1 gap-2" disabled={busy} onClick={() => void retrySignIn()}>
								{busy ? (
									<LoadingIndicator label="Connecting" inline decorative size={16} />
								) : (
									<SiDiscord aria-hidden="true" />
								)}
								{busy
									? "Connecting..."
									: unauthenticated
										? "Sign in with Discord"
										: "Try Discord again"}
							</Button>
						)}
					</div>
				</Card.Content>
			</Card>
		</main>
	);
}
