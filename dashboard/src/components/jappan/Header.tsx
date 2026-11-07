import { Avatar, Menu, ThemeSwitcher } from "@febkosq8/arc";
import { useLocation, useNavigate } from "react-router-dom";

import { isAdminSession, useSessionQuery } from "@jappan/handlers/auth";
import AuthControls from "./AuthControls";

export default function Header() {
	const { data: session, isError } = useSessionQuery();
	const location = useLocation();
	const navigate = useNavigate();
	const isHomePage = location.pathname === "/";
	const isCommandsPage = location.pathname === "/commands";
	const currentPage = isHomePage ? "Home" : isCommandsPage ? "Commands" : "Pages";

	return (
		<header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur">
			<div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">
				<a href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
					<Avatar name="Jappan" image="/logo/profile.png" size="md" aria-hidden="true" />
					Jappan
				</a>
				<div className="flex shrink-0 items-center gap-1">
					<nav aria-label="Main navigation" className="flex items-center gap-1">
						<Menu buttonText={currentPage}>
							<Menu.Item asChild nativeButton={false} active={isHomePage}>
								<a href="/" aria-current={isHomePage ? "page" : undefined}>
									Home
								</a>
							</Menu.Item>
							<Menu.Item asChild nativeButton={false} active={isCommandsPage}>
								<a href="/commands" aria-current={isCommandsPage ? "page" : undefined}>
									Commands
								</a>
							</Menu.Item>
						</Menu>
					</nav>
					{!isError && isAdminSession(session) && (
						<Menu buttonText="Admin" active={location.pathname.startsWith("/admin")}>
							<Menu.Sub buttonText="Guild">
								<Menu.Item
									active={
										location.pathname === "/admin/guild" ||
										location.pathname.startsWith("/admin/guild/")
									}
									onClick={() => navigate("/admin/guild")}
								>
									View Guild
								</Menu.Item>
								<Menu.Item
									active={location.pathname === "/admin/guilds"}
									onClick={() => navigate("/admin/guilds")}
								>
									List Guilds
								</Menu.Item>
							</Menu.Sub>
						</Menu>
					)}
					<AuthControls />
					<ThemeSwitcher variant="toggle" />
				</div>
			</div>
		</header>
	);
}
