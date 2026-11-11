import { Menu } from "@febkosq8/arc";
import { Link, useLocation } from "react-router-dom";

interface GuildMenuProps {
	asSubmenu?: boolean;
}

export default function GuildMenu({ asSubmenu = false }: GuildMenuProps) {
	const { pathname } = useLocation();
	const isGuildsPage = pathname === "/guilds" || /^\/guild\/[^/]+\/?$/u.test(pathname);
	const isLeaderboardPage = pathname === "/leaderboards" || /^\/guild\/[^/]+\/leaderboard(?:\/|$)/u.test(pathname);
	const isPlayerPage = pathname === "/player" || pathname.startsWith("/player/");
	const isPlaylistPage = pathname === "/playlists";
	const isDashboardPage = isGuildsPage || isLeaderboardPage || isPlayerPage || isPlaylistPage;

	const items = (
		<>
			<Menu.Item asChild nativeButton={false} active={isGuildsPage}>
				<Link to="/guilds" aria-current={isGuildsPage ? "page" : undefined}>
					Guilds
				</Link>
			</Menu.Item>
			<Menu.Item asChild nativeButton={false} active={isLeaderboardPage}>
				<Link to="/leaderboards" aria-current={isLeaderboardPage ? "page" : undefined}>
					Leaderboards
				</Link>
			</Menu.Item>
			<Menu.Item asChild nativeButton={false} active={isPlayerPage}>
				<Link to="/player" aria-current={isPlayerPage ? "page" : undefined}>
					Player
				</Link>
			</Menu.Item>
			<Menu.Item asChild nativeButton={false} active={isPlaylistPage}>
				<Link to="/playlists" aria-current={isPlaylistPage ? "page" : undefined}>
					My playlists
				</Link>
			</Menu.Item>
		</>
	);

	return asSubmenu ? (
		<Menu.Sub buttonText="Dashboard" active={isDashboardPage}>
			{items}
		</Menu.Sub>
	) : (
		<Menu buttonText="Dashboard" active={isDashboardPage}>
			{items}
		</Menu>
	);
}
