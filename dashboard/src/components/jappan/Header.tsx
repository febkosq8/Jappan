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
	const isViewGuildPage = location.pathname === "/admin/guild" || location.pathname.startsWith("/admin/guild/");
	const isListGuildsPage = location.pathname === "/admin/guilds";
	const showAdmin = !isError && isAdminSession(session);
	const currentPage = isHomePage ? "Home" : isCommandsPage ? "Commands" : "Pages";
	const mobilePage =
		showAdmin && isViewGuildPage ? "View Guild" : showAdmin && isListGuildsPage ? "List Guilds" : currentPage;
	const homeItem = (
		<Menu.Item asChild nativeButton={false} active={isHomePage}>
			<a href="/" aria-current={isHomePage ? "page" : undefined}>
				Home
			</a>
		</Menu.Item>
	);
	const commandsItem = (
		<Menu.Item asChild nativeButton={false} active={isCommandsPage}>
			<a href="/commands" aria-current={isCommandsPage ? "page" : undefined}>
				Commands
			</a>
		</Menu.Item>
	);
	const viewGuildItem = (
		<Menu.Item active={isViewGuildPage} onClick={() => navigate("/admin/guild")}>
			View Guild
		</Menu.Item>
	);
	const listGuildsItem = (
		<Menu.Item active={isListGuildsPage} onClick={() => navigate("/admin/guilds")}>
			List Guilds
		</Menu.Item>
	);
	const guildMenu = (
		<Menu.Sub buttonText="Guild">
			{viewGuildItem}
			{listGuildsItem}
		</Menu.Sub>
	);

	return (
		<header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur">
			<div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">
				<a href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
					<Avatar name="Jappan" image="/logo/profile.png" size="md" aria-hidden="true" />
					Jappan
				</a>
				<div className="flex shrink-0 items-center gap-1">
					<nav aria-label="Main navigation" className="flex items-center gap-1 sm:hidden">
						<Menu buttonText={mobilePage}>
							{homeItem}
							{commandsItem}
							{showAdmin && (
								<Menu.Sub buttonText="Admin" active={location.pathname.startsWith("/admin")}>
									{guildMenu}
								</Menu.Sub>
							)}
						</Menu>
					</nav>
					<nav aria-label="Main navigation" className="hidden items-center gap-1 sm:flex">
						<Menu buttonText={currentPage}>
							{homeItem}
							{commandsItem}
						</Menu>
						{showAdmin && (
							<Menu buttonText="Admin" active={location.pathname.startsWith("/admin")}>
								{guildMenu}
							</Menu>
						)}
					</nav>
					<AuthControls />
					<ThemeSwitcher variant="toggle" />
				</div>
			</div>
		</header>
	);
}
