import { Avatar, Button, Card, DateHandler, Input, PillLink, TextLink } from "@febkosq8/arc";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, type ReactNode, type RefObject } from "react";
import { FiArrowLeft, FiLink } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import APIHandler, { type AdminGuildDetails, type PreferenceEntity } from "@jappan/handlers/APIHandler";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/jappan/AdminRoute";
import LoadingIndicator from "@jappan/components/jappan/LoadingIndicator";

const guildIdPattern = /^\d{17,20}$/u;
const guildSectionIds = ["guild-overview", "service-preferences", "bot-permissions", "command-permissions"];

function SectionLink({ id, label }: { id: string; label: string }) {
	return (
		<a
			href={`#${id}`}
			aria-label={`Link to ${label}`}
			title={`Link to ${label}`}
			className="inline-flex shrink-0 rounded-md p-1 text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<FiLink className="size-4" aria-hidden="true" />
		</a>
	);
}

function GuildLookup({ guildId, onLookup }: { guildId: string; onLookup: (guildId: string) => void }) {
	const form = useForm({
		defaultValues: { guildId },
		onSubmit: ({ value }) => onLookup(value.guildId.trim()),
	});

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
			className="mb-6 max-w-xl"
		>
			<form.Field
				name="guildId"
				validators={{
					onSubmit: ({ value }) =>
						guildIdPattern.test(value.trim())
							? undefined
							: "Enter a valid Discord guild ID (17 to 20 digits).",
					onChange: ({ value }) =>
						guildIdPattern.test(value.trim())
							? undefined
							: "Enter a valid Discord guild ID (17 to 20 digits).",
				}}
			>
				{(field) => {
					const error = field.state.meta.errors[0];
					return (
						<>
							<label htmlFor="guild-id" className="mb-2 block text-sm font-medium">
								Guild ID
							</label>
							<div className="flex flex-col gap-2 sm:flex-row">
								<Input
									id="guild-id"
									name={field.name}
									value={field.state.value}
									onChange={(event) => field.handleChange(event.target.value)}
									onBlur={field.handleBlur}
									inputMode="numeric"
									placeholder="Enter a Discord guild ID"
									aria-invalid={!!error}
									aria-describedby={error ? "guild-id-error" : undefined}
									className="h-10 min-w-0 flex-1"
								/>
								<Button type="submit">View guild</Button>
							</div>
							{error && (
								<p id="guild-id-error" role="alert" className="mt-2 text-sm text-destructive">
									{error}
								</p>
							)}
						</>
					);
				}}
			</form.Field>
		</form>
	);
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
			<dt className="text-sm text-muted-foreground">{label}</dt>
			<dd className="mt-1 wrap-break-word font-medium">{children}</dd>
		</Card>
	);
}

function PreferenceChannelDetail({ guildId, channel }: { guildId: string; channel: PreferenceEntity | null }) {
	return channel ? (
		<>
			<TextLink
				href={`https://discord.com/channels/${encodeURIComponent(guildId)}/${encodeURIComponent(channel.id)}`}
				text={channel.name ?? "Channel unavailable"}
			/>
			<span className="block break-all text-xs text-muted-foreground">{channel.id}</span>
		</>
	) : (
		"Not configured"
	);
}

function GuildPreferences({ guild }: { guild: AdminGuildDetails }) {
	const { auditLog, leveling, memberAnnouncements, warnings } = guild.preferences;
	return (
		<Card id="service-preferences" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<h2 className="flex items-center gap-1 text-lg font-semibold">
				Service preferences <SectionLink id="service-preferences" label="service preferences" />
			</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Saved settings; channel and role availability may change.
			</p>
			<div className="mt-4 grid gap-4 sm:grid-cols-2 sm:gap-y-2">
				<Card
					hoverable={true}
					hoverLift={false}
					role="region"
					aria-labelledby="audit-preferences"
					className="min-w-0 rounded-md border-border p-3 sm:row-span-4 sm:grid sm:grid-rows-subgrid lg:row-span-3"
				>
					<h3 id="audit-preferences" className="font-semibold">
						Audit log
					</h3>
					<dl className="mt-2 grid gap-2 sm:row-span-3 sm:mt-0 sm:grid-rows-subgrid lg:row-span-2 lg:grid-cols-2">
						<Detail label="Status">{auditLog.enabled ? "Enabled" : "Disabled"}</Detail>
						<Detail label="Channel">
							<PreferenceChannelDetail guildId={guild.id} channel={auditLog.channel} />
						</Detail>
						<Detail label="Full verbosity">{auditLog.fullVerbosity ? "Enabled" : "Disabled"}</Detail>
					</dl>
				</Card>
				<Card
					hoverable={true}
					hoverLift={false}
					role="region"
					aria-labelledby="leveling-preferences"
					className="min-w-0 rounded-md border-border p-3 sm:row-span-4 sm:grid sm:grid-rows-subgrid lg:row-span-3"
				>
					<h3 id="leveling-preferences" className="font-semibold">
						Leveling
					</h3>
					<dl className="mt-2 grid gap-2 sm:row-span-3 sm:mt-0 sm:grid-rows-subgrid lg:row-span-2 lg:grid-cols-2">
						<Detail label="Status">{leveling.enabled ? "Enabled" : "Disabled"}</Detail>
						<Detail label="Threshold">{leveling.threshold ?? "Not configured"}</Detail>
						<Detail label="Role">
							{leveling.role ? (
								<>
									<span>{leveling.role.name ?? "Role unavailable"}</span>
									<span className="block break-all text-xs text-muted-foreground">
										{leveling.role.id}
									</span>
								</>
							) : (
								"Not configured"
							)}
						</Detail>
					</dl>
				</Card>
				<Card
					hoverable={true}
					hoverLift={false}
					role="region"
					aria-labelledby="announcement-preferences"
					className="min-w-0 rounded-md border-border p-3 sm:row-span-5 sm:mt-2 sm:grid sm:grid-rows-subgrid lg:row-span-3"
				>
					<h3 id="announcement-preferences" className="font-semibold">
						Member announcements
					</h3>
					<dl className="mt-2 grid gap-2 sm:row-span-4 sm:mt-0 sm:grid-rows-subgrid lg:row-span-2 lg:grid-cols-2">
						<Detail label="Join announcements">
							{memberAnnouncements.joinEnabled ? "Enabled" : "Disabled"}
						</Detail>
						<Detail label="Join channel">
							<PreferenceChannelDetail guildId={guild.id} channel={memberAnnouncements.joinChannel} />
						</Detail>
						<Detail label="Leave announcements">
							{memberAnnouncements.leaveEnabled ? "Enabled" : "Disabled"}
						</Detail>
						<Detail label="Leave channel">
							<PreferenceChannelDetail guildId={guild.id} channel={memberAnnouncements.leaveChannel} />
						</Detail>
					</dl>
				</Card>
				<Card
					hoverable={true}
					hoverLift={false}
					role="region"
					aria-labelledby="warning-preferences"
					className="min-w-0 rounded-md border-border p-3 sm:row-span-5 sm:mt-2 sm:grid sm:grid-rows-subgrid lg:row-span-3"
				>
					<h3 id="warning-preferences" className="font-semibold">
						Warnings
					</h3>
					<dl className="mt-2 grid gap-2 sm:row-span-4 sm:mt-0 sm:grid-rows-subgrid lg:row-span-2 lg:grid-cols-2">
						<Detail label="Timeout threshold">{warnings.timeoutThreshold ?? "Not configured"}</Detail>
						<Detail label="Timeout duration (hours)">
							{warnings.timeoutDurationHours ?? "Not configured"}
						</Detail>
						<Detail label="Ban threshold">{warnings.banThreshold ?? "Not configured"}</Detail>
						<Detail label="Audit channel">
							<PreferenceChannelDetail guildId={guild.id} channel={warnings.auditChannel} />
						</Detail>
					</dl>
				</Card>
			</div>
		</Card>
	);
}

function GuildDetails({
	guild,
	scrollContainerRef,
}: {
	guild: AdminGuildDetails;
	scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
	const commandsQuery = useQuery({
		queryKey: ["public", "commands"],
		queryFn: APIHandler.getGlobalCommands,
		enabled: guild.permissions !== undefined,
	});
	const grantedPermissions = new Set(guild.permissions);
	const isAdministrator = grantedPermissions.has("Administrator");
	const commands = commandsQuery.data?.filter(
		(command, _index, all) => !all.some((other) => other.name.startsWith(`${command.name} `)),
	);

	useEffect(() => {
		const container = scrollContainerRef.current;
		if (!container) return;
		const sections = guildSectionIds
			.map((id) => document.getElementById(id))
			.filter((section): section is HTMLElement => section !== null);
		let linkedScrollTop: number | undefined;
		const scrollToHash = () => {
			const section = sections.find((item) => `#${item.id}` === window.location.hash);
			if (section) {
				section.scrollIntoView({ block: "start", behavior: "instant" });
				linkedScrollTop = container.scrollTop;
			}
		};
		const syncHash = () => {
			if (linkedScrollTop !== undefined && Math.abs(container.scrollTop - linkedScrollTop) < 1) return;
			linkedScrollTop = undefined;
			const bounds = container.getBoundingClientRect();
			const midpoint = bounds.top + bounds.height / 2;
			const lastSection = sections[sections.length - 1];
			const atBottom = container.scrollHeight - container.clientHeight - container.scrollTop <= 1;
			const active =
				atBottom && lastSection
					? lastSection
					: sections.reduce<HTMLElement | undefined>((closest, section) => {
							const distance = (item: HTMLElement) => {
								const rect = item.getBoundingClientRect();
								return Math.max(rect.top - midpoint, midpoint - rect.bottom, 0);
							};
							return !closest || distance(section) < distance(closest) ? section : closest;
						}, undefined);
			if (!active || window.location.hash === `#${active.id}`) return;
			window.history.replaceState(
				window.history.state,
				"",
				`${window.location.pathname}${window.location.search}#${active.id}`,
			);
			window.dispatchEvent(new HashChangeEvent("hashchange"));
		};
		const handleHashChange = (event: HashChangeEvent) => {
			if (event.isTrusted) scrollToHash();
		};
		if (guildSectionIds.includes(window.location.hash.slice(1))) scrollToHash();
		syncHash();
		container.addEventListener("scroll", syncHash, { passive: true });
		window.addEventListener("hashchange", handleHashChange);
		return () => {
			container.removeEventListener("scroll", syncHash);
			window.removeEventListener("hashchange", handleHashChange);
		};
	}, [guild.id, scrollContainerRef]);

	return (
		<div className="space-y-5">
			<Card id="guild-overview" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<h2 className="flex items-center gap-1 text-lg font-semibold">
					Guild overview <SectionLink id="guild-overview" label="guild overview" />
				</h2>
				<div className="mt-4 flex items-center gap-4">
					<Avatar name={guild.name} image={guild.icon} size="lg" aria-hidden="true" />
					<div className="min-w-0">
						<h3 className="wrap-break-word text-xl font-bold">
							<TextLink
								href={`https://discord.com/channels/${encodeURIComponent(guild.id)}`}
								text={guild.name}
							/>
						</h3>
						<p className="break-all text-sm text-muted-foreground">{guild.id}</p>
					</div>
				</div>
				<dl className="mt-5 grid gap-3 sm:grid-cols-2">
					<Detail label="Bot membership">{guild.isActiveMember ? "Member" : "Not a member"}</Detail>
					<Detail label="Members">
						{guild.memberCount === undefined ? "Unavailable" : guild.memberCount.toLocaleString()}
					</Detail>
					<Detail label="Owner">
						{guild.owner ? (
							<div className="flex items-center gap-2">
								<Avatar
									name={guild.owner.username}
									image={guild.owner.avatarUrl}
									size="sm"
									aria-hidden="true"
								/>
								<div className="min-w-0">
									<TextLink
										href={`https://discord.com/users/${encodeURIComponent(guild.owner.userId)}`}
										text={guild.owner.username}
									/>
									<p className="break-all text-xs text-muted-foreground">{guild.owner.userId}</p>
								</div>
							</div>
						) : (
							"Unavailable"
						)}
					</Detail>
					<Detail label="Joined">
						{guild.joinedTimestamp === undefined ? (
							"Unavailable"
						) : (
							<>
								<span className="block">{DateHandler.getDateTime(guild.joinedTimestamp)}</span>
								<span className="text-sm text-muted-foreground">
									{DateHandler.getRelativeTime(guild.joinedTimestamp)}
								</span>
							</>
						)}
					</Detail>
					<Detail label="Discovered">
						{guild.discoveredAt == null ? (
							"Unavailable"
						) : (
							<>
								<span className="block">{DateHandler.getDateTime(guild.discoveredAt)}</span>
								<span className="text-sm text-muted-foreground">
									{DateHandler.getRelativeTime(guild.discoveredAt)}
								</span>
							</>
						)}
					</Detail>
					<Detail label="System channel">
						{guild.systemChannel === undefined ? (
							"Unavailable"
						) : guild.systemChannel === null ? (
							"None"
						) : (
							<>
								<TextLink
									href={`https://discord.com/channels/${encodeURIComponent(guild.id)}/${encodeURIComponent(guild.systemChannel.id)}`}
									text={guild.systemChannel.name}
								/>
								<span className="block break-all text-xs text-muted-foreground">
									{guild.systemChannel.id}
								</span>
							</>
						)}
					</Detail>
					<Detail label="Required permissions">
						{guild.hasRequiredPermissions === undefined ? (
							"Unavailable"
						) : guild.hasRequiredPermissions ? (
							<span className="text-success">All granted</span>
						) : (
							<span className="text-destructive">Some missing</span>
						)}
					</Detail>
				</dl>
			</Card>
			<GuildPreferences guild={guild} />
			<Card id="bot-permissions" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<h2 className="flex items-center gap-1 text-lg font-semibold">
					Bot permissions <SectionLink id="bot-permissions" label="bot permissions" />
				</h2>
				{guild.permissions === undefined ? (
					<p className="mt-3 text-muted-foreground">Unavailable</p>
				) : guild.permissions.length === 0 ? (
					<p className="mt-3 text-muted-foreground">None</p>
				) : (
					<ul className="mt-3 flex flex-wrap gap-2">
						{guild.permissions.map((permission) => (
							<li key={permission} className="rounded-md border border-border bg-muted px-3 py-1 text-sm">
								{permission}
							</li>
						))}
					</ul>
				)}
			</Card>
			<Card id="command-permissions" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<h2 className="flex items-center gap-1 text-lg font-semibold">
					Command permissions <SectionLink id="command-permissions" label="command permissions" />
				</h2>
				<p className="mt-1 text-sm text-muted-foreground">
					Declared bot permissions at guild level. Channel overrides and other requirements can affect whether
					a command works.
				</p>
				{guild.permissions === undefined ? (
					<p className="mt-3 text-muted-foreground">Unavailable</p>
				) : commandsQuery.isPending ? (
					<LoadingIndicator label="Loading commands" />
				) : commandsQuery.isError ? (
					<div role="alert" className="mt-3">
						<p>Could not load command permissions. Please try again.</p>
						<Button size="sm" variant="outline-primary" onClick={() => void commandsQuery.refetch()}>
							Retry
						</Button>
					</div>
				) : !commands?.length ? (
					<p className="mt-3 text-muted-foreground">No commands available</p>
				) : (
					<ul className="mt-3 grid gap-3 sm:grid-cols-2">
						{commands.map(({ name, requiredBotPermissions }) => {
							const permissions = requiredBotPermissions.map(
								(permission) =>
									[permission, isAdministrator || grantedPermissions.has(permission)] as const,
							);
							const missing = permissions.some(([, granted]) => !granted);
							return (
								<li key={name} className="min-w-0 rounded-md border border-border p-3">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<h3 className="wrap-break-word font-medium">/{name}</h3>
										<span className={missing ? "text-destructive" : "text-success"}>
											{missing
												? "Some required permissions missing"
												: "All required permissions granted"}
										</span>
									</div>
									{permissions.length === 0 ? (
										<p className="mt-2 text-sm text-muted-foreground">No declared permissions</p>
									) : (
										<ul className="mt-2 space-y-1 text-sm">
											{permissions.map(([permission, granted]) => (
												<li key={permission} className="flex justify-between gap-3">
													<span className="min-w-0 wrap-break-word">{permission}</span>
													<span className={granted ? "text-success" : "text-destructive"}>
														{granted ? "Granted" : "Missing"}
													</span>
												</li>
											))}
										</ul>
									)}
								</li>
							);
						})}
					</ul>
				)}
			</Card>
		</div>
	);
}

export default function ViewGuild({ scrollContainerRef }: { scrollContainerRef: RefObject<HTMLDivElement | null> }) {
	const { guildId = "" } = useParams();
	document.title = `Admin - View Guild (${guildId})`;
	const navigate = useNavigate();
	const validGuildId = guildIdPattern.test(guildId);
	const guildQuery = useQuery({
		queryKey: ["admin", "guild", guildId],
		queryFn: () => APIHandler.getAdminGuild(guildId),
		enabled: validGuildId,
	});

	const guildNotFound =
		guildQuery.isError && axios.isAxiosError(guildQuery.error) && guildQuery.error.response?.status === 404;

	useEffect(() => {
		if (!validGuildId || guildQuery.isFetching || !guildNotFound) return;
		toast.warning(`Guild ${guildId} not found.`, { id: "guild-not-found" });
		navigate("/admin/guild", { replace: true });
	}, [guildId, guildNotFound, guildQuery.isFetching, navigate, validGuildId]);

	async function refreshGuild() {
		const result = await guildQuery.refetch();
		if (result.isError) {
			if (
				!accessErrorStatus(result.error) &&
				(!axios.isAxiosError(result.error) || result.error.response?.status !== 404)
			) {
				toast.error("Could not refresh guild details. Please try again.");
			}
		} else {
			toast.success("Guild details refreshed.");
		}
	}

	const accessStatus = accessErrorStatus(guildQuery.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	let content: ReactNode;
	if (!guildId) {
		content = <p className="text-muted-foreground">Enter a guild ID to view its details.</p>;
	} else if (!validGuildId) {
		content = <p role="alert">Invalid guild ID.</p>;
	} else if (guildQuery.isPending || guildQuery.isFetching) {
		content = <LoadingIndicator label="Loading guild" />;
	} else if (guildQuery.isError) {
		content = guildNotFound ? null : (
			<div role="alert">
				<p>Could not load guild details. Check your access and try again.</p>
				<Button size="sm" variant="outline-primary" onClick={() => void guildQuery.refetch()}>
					Retry
				</Button>
			</div>
		);
	} else {
		content = <GuildDetails guild={guildQuery.data} scrollContainerRef={scrollContainerRef} />;
	}

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<PillLink href="/admin/guilds" variant="outline-secondary" size="sm" className="mb-5 gap-2">
				<FiArrowLeft aria-hidden="true" />
				All guilds
			</PillLink>
			<h1 className="mb-5 typography-heading-2 text-3xl font-bold tracking-tight">Guild details</h1>
			{validGuildId && guildQuery.isSuccess ? (
				<Button
					type="button"
					size="sm"
					variant="outline-destructive"
					className="mb-6"
					onClick={() => navigate("/admin/guild")}
				>
					Reset
				</Button>
			) : (
				<GuildLookup
					key={guildId}
					guildId={guildId}
					onLookup={(id) => {
						if (id === guildId) {
							void refreshGuild();
						} else {
							navigate(`/admin/guild/${encodeURIComponent(id)}`);
						}
					}}
				/>
			)}
			{content}
		</main>
	);
}
