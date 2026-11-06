import { Avatar, PillLink, ThemeSwitcher } from "@febkosq8/arc";

import AuthControls from "./AuthControls";

export default function Header({ activeSectionId }: { activeSectionId: string }) {
	return (
		<header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur">
			<div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:gap-4 sm:px-6">
				<a href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
					<Avatar name="Jappan" image="/logo/profile.png" size="md" aria-hidden="true" />
					Jappan
				</a>
				<nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1 sm:gap-2">
					<PillLink size="sm" active={activeSectionId === "about"} href="#about">
						About
					</PillLink>
					<PillLink size="sm" active={activeSectionId === "features"} href="#features">
						Features
					</PillLink>
					<PillLink
						size="sm"
						active={activeSectionId === "team"}
						href="#team"
						className="hidden sm:inline-flex"
					>
						Team
					</PillLink>
					<AuthControls />
					<ThemeSwitcher variant="toggle" />
				</nav>
			</div>
		</header>
	);
}
