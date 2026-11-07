import { Avatar, Button, Card, DateHandler, Input, PillLink, TextLink } from "@febkosq8/arc";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, type ReactNode } from "react";
import { FiArrowLeft } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import APIHandler, { type AdminGuild } from "@jappan/handlers/APIHandler";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/jappan/AdminRoute";
import LoadingIndicator from "@jappan/components/jappan/LoadingIndicator";

const guildIdPattern = /^\d{17,20}$/u;

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
		<div className="min-w-0 rounded-md border border-border p-3">
			<dt className="text-sm text-muted-foreground">{label}</dt>
			<dd className="mt-1 wrap-break-word font-medium">{children}</dd>
		</div>
	);
}

function GuildDetails({ guild }: { guild: AdminGuild }) {
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

	return (
		<div className="space-y-5">
			<Card hoverable={false} className="p-5 sm:p-6">
				<div className="flex items-center gap-4">
					<Avatar name={guild.name} image={guild.icon} size="lg" aria-hidden="true" />
					<div className="min-w-0">
						<h2 className="wrap-break-word text-xl font-bold">
							<TextLink
								href={`https://discord.com/channels/${encodeURIComponent(guild.id)}`}
								text={guild.name}
							/>
						</h2>
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
			<Card hoverable={false} className="p-5 sm:p-6">
				<h2 className="text-lg font-semibold">Bot permissions</h2>
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
			<Card hoverable={false} className="p-5 sm:p-6">
				<h2 className="text-lg font-semibold">Command permissions</h2>
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

export default function ViewGuild() {
	document.title = "Admin - View Guild";
	const { guildId = "" } = useParams();
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
		content = <GuildDetails guild={guildQuery.data} />;
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
					variant="outline-primary"
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
