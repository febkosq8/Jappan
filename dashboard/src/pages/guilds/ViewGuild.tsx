import {
	Avatar,
	Button,
	Card,
	DateHandler,
	Input,
	LabelField,
	PillLink,
	Tabs,
	TabsList,
	TabsPanel,
	TabsTab,
} from "@febkosq8/arc";
import { useForm } from "@tanstack/react-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState, type ReactNode } from "react";
import { FiArrowLeft, FiLink } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import APIHandler, { type UserGuildDetails } from "@jappan/handlers/APIHandler";
import { AccessRedirect } from "@jappan/components/AdminRoute";
import ExternalTextLink from "@jappan/components/ExternalTextLink";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildPreferencesEditor from "@jappan/pages/admin/GuildPreferencesEditor";

const guildIdPattern = /^\d{17,20}$/u;
const guildSections = [
	{ id: "guild-overview", label: "Overview" },
	{ id: "service-preferences", label: "Service Preferences" },
	{ id: "bot-permissions", label: "Bot permissions" },
	{ id: "command-permissions", label: "Command permissions" },
];

const readSectionFromHash = () => {
	const id = window.location.hash.slice(1);
	return guildSections.some((section) => section.id === id) ? id : guildSections[0].id;
};

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
							<LabelField id="guild-id" label="Guild ID" className="mb-2" />
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

function GuildOverview({ guild }: { guild: UserGuildDetails }) {
	return (
		<Card id="guild-overview" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<h2 className="flex items-center gap-1 text-lg font-semibold">
				Guild overview <SectionLink id="guild-overview" label="guild overview" />
			</h2>
			<div className="mt-4 flex items-center gap-4">
				<Avatar name={guild.name} image={guild.icon} size="lg" aria-hidden="true" />
				<div className="min-w-0">
					<h3 className="wrap-break-word text-xl font-bold">
						<ExternalTextLink
							href={`https://discord.com/channels/${encodeURIComponent(guild.id)}`}
							text={guild.name}
						/>
					</h3>
					<p className="break-all text-sm text-muted-foreground">{guild.id}</p>
				</div>
			</div>
			<dl className="mt-5 grid gap-3 sm:grid-cols-2">
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
								<ExternalTextLink
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
	);
}

function GuildDetails({ guild }: { guild: UserGuildDetails }) {
	const queryClient = useQueryClient();
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
	const [section, setSection] = useState(readSectionFromHash);

	useEffect(() => {
		const handleHashChange = () => setSection(readSectionFromHash());
		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	const changeSection = (value: string) => {
		setSection(value);
		window.history.replaceState(
			window.history.state,
			"",
			`${window.location.pathname}${window.location.search}#${value}`,
		);
	};

	return (
		<Tabs value={section} onValueChange={changeSection} className="gap-5">
			<TabsList aria-label="Guild sections">
				{guildSections.map(({ id, label }) => (
					<TabsTab key={id} value={id} size="sm">
						{label}
					</TabsTab>
				))}
			</TabsList>
			<TabsPanel value="guild-overview" keepMounted>
				<GuildOverview guild={guild} />
			</TabsPanel>
			<TabsPanel value="service-preferences" keepMounted>
				<GuildPreferencesEditor
					guild={{ ...guild, isActiveMember: true }}
					onSaved={() =>
						queryClient.invalidateQueries({ queryKey: ["user", "guild", guild.id], exact: true })
					}
				/>
			</TabsPanel>
			<TabsPanel value="bot-permissions" keepMounted>
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
								<li
									key={permission}
									className="rounded-md border border-border bg-muted px-3 py-1 text-sm"
								>
									{permission}
								</li>
							))}
						</ul>
					)}
				</Card>
			</TabsPanel>
			<TabsPanel value="command-permissions" keepMounted>
				<Card id="command-permissions" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
					<h2 className="flex items-center gap-1 text-lg font-semibold">
						Command permissions <SectionLink id="command-permissions" label="command permissions" />
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Declared bot permissions at guild level. Channel overrides and other requirements can affect
						whether a command works.
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
											<p className="mt-2 text-sm text-muted-foreground">
												No declared permissions
											</p>
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
			</TabsPanel>
		</Tabs>
	);
}

export default function UserViewGuild() {
	const { guildId = "" } = useParams();
	document.title = guildId ? `Guild : ${guildId}` : "View Guild";
	const navigate = useNavigate();
	const validGuildId = guildIdPattern.test(guildId);
	const guildQuery = useQuery({
		queryKey: ["user", "guild", guildId],
		queryFn: () => APIHandler.getUserGuild(guildId),
		enabled: validGuildId,
	});

	const guildNotFound =
		guildQuery.isError && axios.isAxiosError(guildQuery.error) && guildQuery.error.response?.status === 404;

	useEffect(() => {
		if (!validGuildId || guildQuery.isFetching || !guildNotFound) return;
		toast.warning(`Guild ${guildId} not found.`, { id: "guild-not-found" });
		navigate("/guild", { replace: true });
	}, [guildId, guildNotFound, guildQuery.isFetching, navigate, validGuildId]);

	const isUnauthorized = axios.isAxiosError(guildQuery.error) && guildQuery.error.response?.status === 401;
	if (isUnauthorized) return <AccessRedirect status={401} />;

	let content: ReactNode;
	if (!guildId) {
		content = (
			<p className="text-muted-foreground">Enter a guild ID to view its details and manage preferences.</p>
		);
	} else if (!validGuildId) {
		content = <p role="alert">Invalid guild ID.</p>;
	} else if (guildQuery.isPending || guildQuery.isFetching) {
		content = <LoadingIndicator label="Loading guild" />;
	} else if (guildQuery.isError) {
		const errorStatus = axios.isAxiosError(guildQuery.error) ? guildQuery.error.response?.status : undefined;
		if (errorStatus === 404) {
			content = null;
		} else {
			const errorMessage =
				errorStatus === 403
					? "You need Manage Server permission in this guild to view its details."
					: "Could not load guild details. Check your access and try again.";
			content = (
				<div role="alert" className="space-y-2">
					<p>{errorMessage}</p>
					<Button size="sm" variant="outline-primary" onClick={() => void guildQuery.refetch()}>
						Retry
					</Button>
				</div>
			);
		}
	} else {
		content = <GuildDetails guild={guildQuery.data} />;
	}

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<PillLink href="/guilds" variant="outline-secondary" size="sm" className="mb-5 gap-2">
				<FiArrowLeft aria-hidden="true" />
				My Guilds
			</PillLink>
			<h1 className="mb-5 typography-heading-2 text-3xl font-bold tracking-tight">
				{guildId ? `Guild : ${guildId}` : "View Guild"}
			</h1>
			{validGuildId && guildQuery.isSuccess ? (
				<Button
					type="button"
					size="sm"
					variant="outline-destructive"
					className="mb-6"
					onClick={() => navigate("/guild")}
				>
					Reset
				</Button>
			) : (
				<GuildLookup
					key={guildId}
					guildId={guildId}
					onLookup={(id) => {
						if (id === guildId) {
							void guildQuery.refetch();
						} else {
							navigate(`/guild/${encodeURIComponent(id)}`);
						}
					}}
				/>
			)}
			{content}
		</main>
	);
}
