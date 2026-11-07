import { Avatar, Menu, ThemeSwitcher } from "@febkosq8/arc";
import { useLocation, useNavigate } from "react-router-dom";

import { isAdminSession, useSessionQuery } from "@jappan/handlers/auth";
import AuthHeaderControls from "./AuthHeaderControls";

export default function Header() {
	const { data: session, isError } = useSessionQuery();
	const location = useLocation();
	const navigate = useNavigate();
	const isHomePage = location.pathname === "/";
	const isCommandsPage = location.pathname === "/commands";
	const isViewGuildPage = location.pathname === "/admin/guild" || location.pathname.startsWith("/admin/guild/");
	const isListGuildsPage = location.pathname === "/admin/guilds";
	const isViewBotPage = location.pathname === "/admin/bot";
	const isAdmin = !isError && isAdminSession(session);
	const currentPage = isHomePage ? "Home" : isCommandsPage ? "Commands" : "Pages";
	const mobilePage =
		isAdmin && isViewBotPage
			? "Manage Bot"
			: isAdmin && isViewGuildPage
				? "View Guild"
				: isAdmin && isListGuildsPage
					? "List Guilds"
					: currentPage;
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
	const guildMenu = (
		<Menu.Sub buttonText="Guild">
			<Menu.Item active={isListGuildsPage} onClick={() => navigate("/admin/guilds")}>
				List Guilds
			</Menu.Item>
			<Menu.Item active={isViewGuildPage} onClick={() => navigate("/admin/guild")}>
				View Guild
			</Menu.Item>
		</Menu.Sub>
	);
	const botMenu = (
		<Menu.Sub buttonText="Bot">
			<Menu.Item active={isViewBotPage} onClick={() => navigate("/admin/bot")}>
				Manage Bot
			</Menu.Item>
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
							{isAdmin && (
								<Menu.Sub buttonText="Admin" active={location.pathname.startsWith("/admin")}>
									{guildMenu}
									{botMenu}
								</Menu.Sub>
							)}
						</Menu>
					</nav>
					<nav aria-label="Main navigation" className="hidden items-center gap-1 sm:flex">
						<Menu buttonText={currentPage}>
							{homeItem}
							{commandsItem}
						</Menu>
						{isAdmin && (
							<Menu buttonText="Admin" active={location.pathname.startsWith("/admin")}>
								{guildMenu}
								{botMenu}
							</Menu>
						)}
					</nav>
					<AuthHeaderControls />
					<ThemeSwitcher variant="toggle" />
				</div>
			</div>
		</header>
	);
}
