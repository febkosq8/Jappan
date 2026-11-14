import { Button, Card, PillLink } from "@febkosq8/arc";
import { sessionErrorCode, useSessionQuery, useSignIn } from "@jappan/handlers/auth";
import { authErrorURL, safeCallbackPath } from "@jappan/handlers/authRedirect";
import { useCallback, useEffect, useRef, useState } from "react";
import { FiAlertTriangle, FiArrowLeft, FiLogIn, FiRefreshCw } from "react-icons/fi";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

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

const specialErrors: Record<string, { status: string; title: string; message: string }> = {
	UNAUTHENTICATED: { status: "401", title: "Sign in required", message: "Sign in to access this page." },
	FORBIDDEN: {
		status: "403",
		title: "Access forbidden",
		message: "Your account does not have permission to access this page.",
	},
	NETWORK_ERROR: {
		status: "Connection error",
		title: "Couldn't reach the server",
		message:
			"We couldn't connect to check your session.\nCheck your connection, or the server may be temporarily offline.",
	},
	SESSION_CHECK_FAILED: {
		status: "Session error",
		title: "Couldn't check your session",
		message: "The server couldn't complete the session check. Please try again.",
	},
};

export default function AuthError() {
	const location = useLocation();
	const [searchParams] = useSearchParams();
	const requestedErrorCode = searchParams.get("error") ?? "unknown";
	const sessionError = ["NETWORK_ERROR", "SESSION_CHECK_FAILED", "SESSION_UNAVAILABLE"].includes(requestedErrorCode);
	const sessionQuery = useSessionQuery({
		refetchOnWindowFocus: !sessionError,
		refetchOnMount: !sessionError,
		refetchOnReconnect: !sessionError,
	});
	const { signIn, busy } = useSignIn();
	const [countdown, setCountdown] = useState(5);
	const [retryCountdown, setRetryCountdown] = useState(5);
	const [retrying, setRetrying] = useState(false);
	const retryDelay = useRef(5);
	const retryInFlight = useRef(false);
	const autoSignInStarted = useRef(false);
	const errorCode =
		sessionError && sessionQuery.isError
			? sessionErrorCode(sessionQuery.error)
			: requestedErrorCode === "SESSION_UNAVAILABLE"
				? "SESSION_CHECK_FAILED"
				: requestedErrorCode;
	const unauthenticated = errorCode === "UNAUTHENTICATED";
	const forbidden = errorCode === "FORBIDDEN";
	const networkError = errorCode === "NETWORK_ERROR";
	const callbackPath = safeCallbackPath(searchParams.get("callbackURL"), window.location.origin);
	const state: unknown = location.state;
	const rejectedSessionId =
		typeof state === "object" && state !== null && "rejectedSessionId" in state ? state.rejectedSessionId : null;

	const special = specialErrors[errorCode];
	const status = special?.status ?? "Sign-in error";
	const title = special?.title ?? "We couldn't sign you in";
	const message =
		special?.message ??
		authErrorMessages[errorCode] ??
		"Discord sign-in couldn't be completed. Please try again later.";
	useDocumentTitle(formatTitle(title));

	const willRedirect =
		(sessionError || (unauthenticated && Boolean(callbackPath))) &&
		sessionQuery.isSuccess &&
		Boolean(sessionQuery.data) &&
		(sessionError || sessionQuery.data?.session.id !== rejectedSessionId);

	const { refetch } = sessionQuery;
	const retrySession = useCallback(async () => {
		if (retryInFlight.current) return;
		retryInFlight.current = true;
		setRetrying(true);
		try {
			const result = await refetch({ cancelRefetch: false });
			if (result.isError) {
				retryDelay.current *= 2;
				setRetryCountdown(retryDelay.current);
			}
		} finally {
			retryInFlight.current = false;
			setRetrying(false);
		}
	}, [refetch]);

	useEffect(() => {
		if (!networkError || !sessionQuery.isError || sessionQuery.isFetching || retrying) return;
		if (retryCountdown <= 0) {
			void retrySession();
			return;
		}
		const timer = setTimeout(() => setRetryCountdown((c) => c - 1), 1000);
		return () => clearTimeout(timer);
	}, [networkError, sessionQuery.isError, sessionQuery.isFetching, retrying, retryCountdown, retrySession]);

	// Auto-start sign-in after a short countdown on the unauthenticated error.
	useEffect(() => {
		if (!unauthenticated || willRedirect || busy) return;
		if (countdown <= 0) {
			if (autoSignInStarted.current) return;
			autoSignInStarted.current = true;
			void signIn();
			return;
		}
		const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
		return () => clearTimeout(timer);
	}, [countdown, unauthenticated, willRedirect, busy, signIn]);

	if (willRedirect) {
		return <Navigate to={callbackPath ?? "/"} replace />;
	}

	if (sessionError && sessionQuery.isSuccess && !sessionQuery.data) {
		const signInURL = new URL(authErrorURL(window.location.origin, callbackPath ?? "/", "UNAUTHENTICATED"));
		return <Navigate to={`${signInURL.pathname}${signInURL.search}`} replace />;
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
					<p className="text-sm font-semibold uppercase tracking-wide text-destructive">{status}</p>
					<h1 id="auth-error-title" className="mt-2 text-2xl font-bold tracking-tight">
						{title}
					</h1>
					<p className="mt-3 whitespace-pre-line text-muted-foreground">{message}</p>
					{!unauthenticated && !forbidden && (
						<div className="mt-5 w-full rounded-md border border-border bg-muted px-3 py-2 text-left">
							<p className="text-xs text-muted-foreground">Error code</p>
							<p className="mt-1 break-all font-mono text-sm">{errorCode}</p>
						</div>
					)}
					<div className="mt-6 flex flex-wrap items-center justify-center gap-2">
						{sessionError && (
							<Button
								variant="outline-primary"
								disabled={retrying || sessionQuery.isFetching}
								onClick={() => void retrySession()}
								className="gap-2"
								aria-label="Try again"
							>
								<FiRefreshCw className="size-4" aria-hidden="true" />
								{retrying || sessionQuery.isFetching
									? "Retrying..."
									: networkError
										? `Try again (${retryCountdown}s)`
										: "Try again"}
							</Button>
						)}
						{unauthenticated && (
							<Button
								variant="outline-primary"
								disabled={busy}
								onClick={() => void signIn()}
								className="gap-2"
								aria-label="Sign in"
							>
								<FiLogIn className="size-4" aria-hidden="true" />
								{busy ? "Signing in..." : countdown > 0 ? `Sign in (${countdown}s)` : "Sign in"}
							</Button>
						)}
						<PillLink href="/" variant="outline-secondary" className="gap-2">
							<FiArrowLeft aria-hidden="true" />
							Go home
						</PillLink>
					</div>
				</Card.Content>
			</Card>
		</main>
	);
}
