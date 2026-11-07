import { Avatar, Button, Menu, Pill, type AvatarProps } from "@febkosq8/arc";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FiLogIn } from "react-icons/fi";
import { toast } from "sonner";

import { authClient, sessionQueryKey, useSessionQuery } from "@jappan/handlers/auth";
import { authErrorURL, safeCallbackPath } from "@jappan/handlers/authRedirect";
import LoadingIndicator from "../LoadingIndicator";

export default function AuthControls() {
	const queryClient = useQueryClient();
	const { data: session, isPending, isError } = useSessionQuery();
	const [busy, setBusy] = useState(false);

	async function signIn() {
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
	}

	async function signOut() {
		setBusy(true);
		try {
			const result = await authClient.signOut();
			if (result.error) {
				toast.error("Could not sign out. Please try again.");
			} else {
				queryClient.removeQueries({ queryKey: ["admin"] });
				queryClient.setQueryData(sessionQueryKey, null);
				toast.success("Signed out successfully.");
			}
		} catch {
			toast.error("Could not sign out. Please try again.");
		} finally {
			setBusy(false);
		}
	}

	const avatarProps: AvatarProps = {
		name: session?.user.name,
		image: session?.user.image,
		"aria-hidden": true,
		variant: "ring",
		ringColor: session?.user.role === "admin" ? "primary" : "muted",
	};

	return (
		<div className="flex flex-wrap items-center justify-end gap-2 text-sm">
			{isPending ? (
				<Pill
					className="px-1"
					children={
						<>
							<Avatar name={"User"} variant="default" size="lg" />
							<LoadingIndicator label={"Loading session"} columns={5} rows={1} />
							<span className="sr-only"> account menu</span>
						</>
					}
				/>
			) : !isError && session ? (
				<Menu
					className="px-1"
					contentClassName="min-w-52"
					buttonText={
						<>
							<Avatar {...avatarProps} size="md" />
							<span className="ml-2 hidden max-w-40 truncate md:inline">
								{session.user.username ?? session.user.name}
							</span>
							<span className="sr-only"> account menu</span>
						</>
					}
				>
					<div className="flex min-w-0 items-center gap-3 px-3 py-2">
						<Avatar {...avatarProps} variant="default" size="lg" />
						<div className="min-w-0">
							<p className="max-w-48 truncate font-semibold" title={session.user.name}>
								{session.user.name}
							</p>
							{session.user.username && (
								<p className="max-w-48 truncate text-sm text-muted-foreground">
									@{session.user.username}
								</p>
							)}
							<p className="text-xs font-medium capitalize text-muted-foreground italic">
								{session.user.role ?? "user"}
							</p>
						</div>
					</div>
					<Menu.Item disabled={busy} onClick={() => void signOut()}>
						{busy ? "Signing out..." : "Sign out"}
					</Menu.Item>
				</Menu>
			) : (
				<Button
					size="sm"
					variant="outline-primary"
					className="min-h-11 min-w-11 gap-1 px-2 md:min-h-8 md:min-w-0 md:px-3"
					aria-label="Sign in"
					disabled={busy}
					onClick={() => void signIn()}
				>
					<FiLogIn className="size-4" aria-hidden="true" />
					<span className="hidden md:inline">Sign in</span>
				</Button>
			)}
		</div>
	);
}
