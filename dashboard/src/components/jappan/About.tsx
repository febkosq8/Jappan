import { Avatar, Button, Card, DateHandler, PillLink, Tag, TypingAnimation } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import {
	FiAlertTriangle,
	FiCheckCircle,
	FiCpu,
	FiGithub,
	FiLayers,
	FiLifeBuoy,
	FiLoader,
	FiRadio,
	FiRefreshCw,
	FiXCircle,
} from "react-icons/fi";
import { SiDiscord } from "react-icons/si";
import APIHandler from "@jappan/handlers/APIHandler";

const serviceNames = [
	{ key: "db", label: "Database" },
	{ key: "discord", label: "Discord bot" },
	{ key: "player", label: "Music player" },
] as const;

const commandCategories = ["General", "Music", "Leveling", "Fun", "Moderation"] as const;

export default function About() {
	const healthQuery = useQuery({
		queryKey: ["health"],
		queryFn: APIHandler.getHealth,
		refetchInterval: 30_000,
	});

	return (
		<section
			id="about"
			className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:py-24"
		>
			<div className="max-w-2xl">
				<Tag
					variant="outline"
					className="mb-4 gap-2 bg-card px-3 py-1.5 text-sm font-medium text-muted-foreground"
				>
					<FiCpu aria-hidden="true" />
					Your friendly Discord companion
				</Tag>
				<h1 className="typography-heading-1 max-w-xl text-5xl leading-tight sm:text-6xl">
					Make your server feel more{" "}
					<span className="text-primary">
						<TypingAnimation
							strings={["alive", "active", "welcoming", "fun", "connected"]}
							placeholder="welcoming"
							trailingDot
						/>
					</span>
				</h1>
				<p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
					Jappan is a Discord bot built to make someone's life easier, with music playback, fun commands,
					levels, and moderation tools in one place.
				</p>
				<p className="mt-3 text-sm text-muted-foreground">Built with Discord.js and Node.js.</p>
				<div className="mt-8 flex flex-wrap gap-3">
					<PillLink
						size="md"
						variant="primary"
						href="https://discord.com/oauth2/authorize?client_id=732230135671029831"
						target="_blank"
						rel="noreferrer"
					>
						<SiDiscord className="size-4 shrink-0" aria-hidden="true" />
						Invite Jappan
					</PillLink>
					<PillLink href="#features" variant="outline-secondary" size="md" className="gap-2.5">
						<FiLayers className="size-4 shrink-0" aria-hidden="true" />
						Explore features
					</PillLink>
					<PillLink
						href="https://github.com/febkosq8/Jappan"
						variant="outline-primary"
						size="md"
						className="gap-2.5"
						target="_blank"
						rel="noreferrer"
					>
						<FiGithub className="size-4 shrink-0" aria-hidden="true" />
						GitHub
					</PillLink>
				</div>
				<div className="mt-3 flex flex-wrap gap-3">
					<PillLink
						variant="outline"
						size="md"
						className="gap-2.5"
						href="https://discord.gg/3mRbVCjvmz"
						target="_blank"
						rel="noreferrer"
					>
						<FiRadio className="size-4 shrink-0" aria-hidden="true" />
						Status updates
					</PillLink>
					<PillLink
						variant="outline"
						size="md"
						className="gap-2.5"
						href="https://discord.gg/rhk7STH5py"
						target="_blank"
						rel="noreferrer"
					>
						<FiLifeBuoy className="size-4 shrink-0" aria-hidden="true" />
						Support server
					</PillLink>
				</div>
				<Card className="mt-8 w-full" aria-label="Live bot status" hoverLift={false}>
					<Card.Content className="p-5! sm:p-6!">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<div>
								<h2 className="text-lg font-semibold text-card-foreground">Live bot status</h2>
								<p
									role={healthQuery.isError ? "status" : undefined}
									className="text-base text-muted-foreground"
								>
									{healthQuery.isError
										? healthQuery.data
											? "Could not refresh status."
											: "Could not load live status."
										: "Updates every 30 seconds."}
								</p>
							</div>
							<Tag
								variant={
									healthQuery.data
										? healthQuery.data.healthy
											? "success"
											: "destructive"
										: healthQuery.isError
											? "warning"
											: "secondary"
								}
								size="sm"
							>
								{healthQuery.data ? (
									healthQuery.data.healthy ? (
										<FiCheckCircle
											className="mr-1 inline size-4 text-success-foreground"
											aria-hidden="true"
										/>
									) : (
										<FiXCircle
											className="mr-1 inline size-4 text-destructive-foreground"
											aria-hidden="true"
										/>
									)
								) : healthQuery.isError ? (
									<FiAlertTriangle
										className="mr-1 inline size-4 text-warning-foreground"
										aria-hidden="true"
									/>
								) : (
									<FiLoader className="mr-1 inline size-4 animate-spin" aria-hidden="true" />
								)}
								{healthQuery.data
									? healthQuery.data.healthy
										? "All systems operational"
										: "Service interruption"
									: healthQuery.isError
										? "Status unavailable"
										: "Checking status"}
							</Tag>
						</div>
						<ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
							{serviceNames.map(({ key, label }) => {
								const healthy = healthQuery.data?.services[key];
								const unavailable = healthQuery.isError && !healthQuery.data;
								const statusIcon =
									healthy === undefined
										? unavailable
											? FiAlertTriangle
											: FiLoader
										: healthy
											? FiCheckCircle
											: FiXCircle;
								const StatusIcon = statusIcon;
								return (
									<li
										key={key}
										className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-base"
									>
										<span className="text-muted-foreground">{label}</span>
										<Tag
											variant={
												healthy === undefined
													? unavailable
														? "warning"
														: "secondary"
													: healthy
														? "success"
														: "destructive"
											}
											size="sm"
										>
											<StatusIcon
												className={`mr-1 inline size-4 ${
													healthy === undefined
														? unavailable
															? "text-warning-foreground"
															: "animate-spin"
														: healthy
															? "text-success-foreground"
															: "text-destructive-foreground"
												}`}
												aria-hidden="true"
											/>
											{healthy === undefined
												? unavailable
													? "Unavailable"
													: "Checking"
												: healthy
													? "Operational"
													: "Unavailable"}
										</Tag>
									</li>
								);
							})}
						</ul>
						<div className="mt-4 flex items-center justify-between gap-4">
							<div className="min-w-0">
								<p className="mt-1 min-h-6 text-base text-muted-foreground">
									{healthQuery.isFetching ? (
										"Fetching latest status…"
									) : healthQuery.dataUpdatedAt > 0 ? (
										<>
											Last fetched:{" "}
											<time
												dateTime={new Date(healthQuery.dataUpdatedAt).toISOString()}
												title={DateHandler.getDateTime(healthQuery.dataUpdatedAt)}
											>
												{DateHandler.getDateTime(healthQuery.dataUpdatedAt)}
											</time>
										</>
									) : (
										"No successful fetch yet."
									)}
								</p>
							</div>
							<Button
								variant="outline-secondary"
								size="md"
								className="group/refetch gap-1"
								onClick={() => void healthQuery.refetch()}
								disabled={healthQuery.isFetching}
								aria-label="Refetch bot status"
							>
								<FiRefreshCw
									className="size-4 shrink-0 group-hover/refetch:animate-spin"
									aria-hidden="true"
								/>
								Refetch
							</Button>
						</div>
					</Card.Content>
				</Card>
			</div>
			<Card className="mx-auto w-full max-w-md overflow-hidden" hoverable hoverLift={false}>
				<Card.Content className="flex flex-col items-center gap-6 p-8! text-center sm:p-10!">
					<Avatar
						name="Jappan logo"
						image="/logo/transparent.png"
						variant="ring"
						ringColor="accent"
						size="8xl"
					/>
					<div>
						<p className="text-2xl font-bold text-card-foreground">Meet Jappan</p>
						<p className="mt-2 text-muted-foreground">A little bit of everything your community needs.</p>
					</div>
					<div className="flex flex-wrap justify-center gap-2">
						{commandCategories.map((category) => (
							<Tag key={category} variant="primary" size="sm">
								{category}
							</Tag>
						))}
					</div>
				</Card.Content>
			</Card>
		</section>
	);
}
