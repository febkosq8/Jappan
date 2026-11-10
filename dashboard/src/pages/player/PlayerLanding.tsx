import { Card, PillLink, Tag } from "@febkosq8/arc";
import { FiExternalLink, FiHeadphones, FiLink, FiPlay, FiRadio } from "react-icons/fi";

import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

const steps = [
	{
		number: "01",
		title: "Join a voice channel",
		description: "In a server with Jappan, join the voice channel where you want the music to play.",
		icon: FiHeadphones,
	},
	{
		number: "02",
		title: "Start playback with /play",
		description:
			"In a text channel, run /play and choose a track, playlist, or saved playlist. Jappan joins your voice channel and starts a session.",
		icon: FiPlay,
	},
	{
		number: "03",
		title: "Open the session controls",
		description:
			"Click the Web Player button on Jappan's player-control message to control the active session. Audio keeps playing in your Discord voice channel.",
		icon: FiLink,
	},
];

export default function PlayerLanding() {
	useDocumentTitle(formatTitle("Web Player"));

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<header className="mb-6 max-w-3xl">
				<Tag
					variant="outline"
					className="mb-4 gap-2 bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground"
				>
					<FiRadio aria-hidden="true" />
					Session controls
				</Tag>
				<h1 className="typography-heading-2 text-3xl font-bold tracking-tight">Control your music session</h1>
				<p className="mt-2 text-muted-foreground">
					Start music in Discord, then use the Web Player in your browser to control the active session.
				</p>
			</header>

			<ol className="grid gap-4 md:grid-cols-3">
				{steps.map(({ number, title, description, icon: Icon }) => (
					<li key={number}>
						<Card className="h-full p-5 sm:p-6">
							<div className="flex items-center justify-between gap-3">
								<span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary">
									<Icon className="size-5" aria-hidden="true" />
								</span>
								<span className="text-sm font-semibold tabular-nums text-muted-foreground">
									{number}
								</span>
							</div>
							<h2 className="mt-5 text-lg font-semibold">{title}</h2>
							<p className="mt-2 leading-6 text-muted-foreground">{description}</p>
						</Card>
					</li>
				))}
			</ol>

			<Card className="mx-auto mt-6 max-w-3xl p-5 sm:p-6">
				<h2 className="font-semibold">How it works</h2>
				<p className="mt-2 leading-6 text-muted-foreground whitespace-pre-wrap">
					{`Each link is tied to one active Jappan session.\nAccess requires signing in with an account that belongs to that Discord server.\nThe link stops working when the session ends.`}
				</p>
				<div className="mt-5 flex flex-wrap gap-3">
					<PillLink href="/commands" variant="outline-primary" size="sm" className="gap-2">
						<FiExternalLink aria-hidden="true" />
						View all commands
					</PillLink>
				</div>
			</Card>
		</main>
	);
}
