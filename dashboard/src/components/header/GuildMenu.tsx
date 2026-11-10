import { Menu } from "@febkosq8/arc";
import { Link, useLocation } from "react-router-dom";

interface GuildMenuProps {
	asSubmenu?: boolean;
}

export default function GuildMenu({ asSubmenu = false }: GuildMenuProps) {
	const { pathname } = useLocation();
	const isGuildsPage = pathname === "/guilds" || /^\/guild\/[^/]+\/?$/u.test(pathname);
	const isLeaderboardPage = pathname === "/leaderboard" || /^\/guild\/[^/]+\/leaderboard(?:\/|$)/u.test(pathname);
	const isGuildPage = isGuildsPage || isLeaderboardPage;

	const items = (
		<>
			<Menu.Item asChild nativeButton={false} active={isGuildsPage}>
				<Link to="/guilds" aria-current={isGuildsPage ? "page" : undefined}>
					Guilds
				</Link>
			</Menu.Item>
			<Menu.Item asChild nativeButton={false} active={isLeaderboardPage}>
				<Link to="/leaderboard" aria-current={isLeaderboardPage ? "page" : undefined}>
					Leaderboard
				</Link>
			</Menu.Item>
		</>
	);

	return asSubmenu ? (
		<Menu.Sub buttonText="Guilds" active={isGuildPage}>
			{items}
		</Menu.Sub>
	) : (
		<Menu buttonText="Guilds" active={isGuildPage}>
			{items}
		</Menu>
	);
}
