import { Avatar, Button, Menu, Pill, type AvatarProps } from "@febkosq8/arc";
import { useState } from "react";
import { FiLogIn } from "react-icons/fi";
import { toast } from "sonner";

import { authClient, SIGN_OUT_FLASH_KEY, useSignIn, useSessionQuery } from "@jappan/handlers/auth";
import LoadingIndicator from "../LoadingIndicator";

export default function AuthControls() {
	const { data: session, isPending, isError } = useSessionQuery();
	const { signIn, busy: signInBusy } = useSignIn();
	const [signOutBusy, setSignOutBusy] = useState(false);

	async function signOut() {
		setSignOutBusy(true);
		try {
			const result = await authClient.signOut();
			if (result.error) {
				toast.error("Could not sign out. Please try again.");
			} else {
				// Reload to home rather than navigate in-app: mutating the React
				// Query cache while a protected page is still mounted races that
				// page's guard, which redirects to /auth/error when the session
				// flips to null or a query refetches into a 401. A full reload
				// discards all mounted state so no guard can fire, and the flash
				// flag re-surfaces the success toast on the home page.
				try {
					sessionStorage.setItem(SIGN_OUT_FLASH_KEY, "1");
				} catch {
					// sessionStorage unavailable; still redirect home below.
				}
				window.location.assign("/");
			}
		} catch {
			toast.error("Could not sign out. Please try again.");
		} finally {
			setSignOutBusy(false);
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
					<Menu.Item disabled={signOutBusy} onClick={() => void signOut()}>
						{signOutBusy ? "Signing out..." : "Sign out"}
					</Menu.Item>
				</Menu>
			) : (
				<Button
					size="sm"
					variant="outline-primary"
					className="min-h-11 min-w-11 gap-1 px-2 md:min-h-8 md:min-w-0 md:px-3"
					aria-label="Sign in"
					disabled={signInBusy}
					onClick={() => void signIn()}
				>
					<FiLogIn className="size-4" aria-hidden="true" />
					<span className="hidden md:inline">Sign in</span>
				</Button>
			)}
		</div>
	);
}
