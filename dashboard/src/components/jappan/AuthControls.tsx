import { Avatar, Button, Menu } from "@febkosq8/arc";
import { useEffect, useState } from "react";

import { authClient } from "@jappan/handlers/auth";

export default function AuthControls() {
	const { data: session, isPending, error: sessionError, refetch } = authClient.useSession();
	const [error, setError] = useState("");
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		const url = new URL(window.location.href);
		if (url.searchParams.has("authError")) {
			setError(
				url.searchParams.get("error") === "USER_BLOCKED"
					? "Your account is blocked."
					: "Discord sign-in failed. Please try again.",
			);
			url.searchParams.delete("authError");
			url.searchParams.delete("error");
			url.searchParams.delete("error_description");
			window.history.replaceState(window.history.state, "", url);
		}
	}, []);

	async function signIn() {
		setBusy(true);
		setError("");
		try {
			const result = await authClient.signIn.social({
				provider: "discord",
				callbackURL: window.location.href,
				errorCallbackURL: `${window.location.origin}/?authError=signin`,
			});
			if (result.error) {
				setError("Could not start Discord sign-in. Please try again.");
			}
		} catch {
			setError("Could not start Discord sign-in. Please try again.");
		} finally {
			setBusy(false);
		}
	}

	async function signOut() {
		setBusy(true);
		setError("");
		try {
			const result = await authClient.signOut();
			if (result.error) {
				setError("Could not sign out. Please try again.");
			}
		} catch {
			setError("Could not sign out. Please try again.");
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="flex flex-wrap items-center justify-end gap-2 text-sm">
			{isPending ? (
				<span>Checking session...</span>
			) : sessionError ? (
				<button type="button" className="underline" onClick={() => void refetch()}>
					Session unavailable. Retry
				</button>
			) : session ? (
				<Menu
					className="px-1"
					contentClassName="min-w-52"
					buttonText={
						<>
							<Avatar name={session.user.name} image={session.user.image} size="md" aria-hidden="true" />
							<span className="ml-2 max-w-28 truncate sm:max-w-40">
								{session.user.username ?? session.user.name}
							</span>
							<span className="sr-only"> account menu</span>
						</>
					}
				>
					<div className="min-w-0 px-3 py-2">
						<p className="text-sm text-muted-foreground">Hello</p>
						<p className="max-w-56 truncate font-semibold" title={session.user.name}>
							{session.user.name}
						</p>
						<p className="text-sm text-muted-foreground">Status: {session.user.status ?? "active"}</p>
						<p className="text-sm text-muted-foreground">Role: {session.user.role ?? "user"}</p>
					</div>
					<Menu.Item disabled={busy} onClick={() => void signOut()}>
						{busy ? "Signing out..." : "Sign out"}
					</Menu.Item>
				</Menu>
			) : (
				<Button size="sm" variant="outline-primary" disabled={busy} onClick={() => void signIn()}>
					Sign in
				</Button>
			)}
			{error && <span role="alert">{error}</span>}
		</div>
	);
}
