import { Avatar, PillLink, ThemeSwitcher } from "@febkosq8/arc";

export default function Header({ activeSectionId }: { activeSectionId: string }) {
	return (
		<header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur">
			<div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
				<a href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
					<Avatar name="Jappan" image="/profile.png" size="md" aria-hidden="true" />
					Jappan
				</a>
				<nav aria-label="Main navigation" className="flex items-center gap-1 sm:gap-2">
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
					<ThemeSwitcher variant="dropdown" />
				</nav>
			</div>
		</header>
	);
}
