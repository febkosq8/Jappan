import profile from "@jappan/assets/jappan/Profile.png";
import { Card, PillLink } from "@febkosq8/arc";
import { FiCpu, FiGithub, FiLayers, FiLifeBuoy, FiRadio } from "react-icons/fi";
import { SiDiscord } from "react-icons/si";

export default function About() {
	return (
		<section
			id="about"
			className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:py-24"
		>
			<div className="max-w-2xl">
				<p className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-muted-foreground">
					<FiCpu aria-hidden="true" />
					Your friendly Discord companion
				</p>
				<h1 className="typography-heading-1 max-w-xl text-5xl leading-tight sm:text-6xl">
					Make your server feel more <span className="text-primary">alive.</span>
				</h1>
				<p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
					Jappan is a Discord bot built to make someone&apos;s life easier, with music playback, fun commands,
					levels, and moderation tools in one place.
				</p>
				<p className="mt-3 text-sm text-muted-foreground">Built with Discord.js and Node.js.</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<PillLink
						variant="primary"
						href="https://discord.com/api/oauth2/authorize?client_id=732230135671029831&permissions=8&scope=applications.commands%20bot"
						target="_blank"
						rel="noreferrer"
					>
						<SiDiscord aria-hidden="true" />
						Invite Jappan
					</PillLink>
					<PillLink href="#features" variant="outline">
						<FiLayers aria-hidden="true" />
						Explore features
					</PillLink>
					<PillLink
						href="https://github.com/febkosq8/Jappan"
						variant="pill"
						className="border border-border bg-card text-foreground"
						target="_blank"
						rel="noreferrer"
					>
						<FiGithub aria-hidden="true" />
						GitHub
					</PillLink>
				</div>
				<div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-sm text-muted-foreground">
					<a
						className="inline-flex items-center gap-2 transition-colors hover:text-primary"
						href="https://discord.gg/3mRbVCjvmz"
						target="_blank"
						rel="noreferrer"
					>
						<FiRadio aria-hidden="true" />
						Status updates
					</a>
					<a
						className="inline-flex items-center gap-2 transition-colors hover:text-primary"
						href="https://discord.gg/rhk7STH5py"
						target="_blank"
						rel="noreferrer"
					>
						<FiLifeBuoy aria-hidden="true" />
						Support server
					</a>
				</div>
			</div>
			<Card className="mx-auto w-full max-w-md overflow-hidden" hoverable hoverLift={false}>
				<Card.Content className="flex flex-col items-center gap-6 p-8! text-center sm:p-10!">
					<div className="rounded-full bg-primary/10 p-4">
						<img className="size-56 rounded-full object-cover sm:size-64" src={profile} alt="Jappan bot mascot" />
					</div>
					<div>
						<p className="text-2xl font-bold text-card-foreground">Meet Jappan</p>
						<p className="mt-2 text-muted-foreground">A little bit of everything your community needs.</p>
					</div>
					<div className="flex flex-wrap justify-center gap-2">
						{["Music", "Community", "Moderation"].map((feature) => (
							<span
								key={feature}
								className="rounded-full border border-border bg-background px-3 py-1 text-sm text-muted-foreground"
							>
								{feature}
							</span>
						))}
					</div>
				</Card.Content>
			</Card>
		</section>
	);
}
