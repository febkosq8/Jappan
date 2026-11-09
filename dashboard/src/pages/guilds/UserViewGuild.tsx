import { Button, PillLink, Tabs, TabsList, TabsPanel, TabsTab } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState, type ReactNode } from "react";
import { FiArrowLeft } from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import APIHandler, { type UserGuildDetails } from "@jappan/handlers/APIHandler";
import { AccessRedirect } from "@jappan/components/AdminRoute";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import ServicePreferencesEditor from "@jappan/components/guild/ServicePreferencesEditor";
import {
	guildIdPattern,
	GuildLookup,
	GuildOverview,
	BotPermissionsPanel,
	CommandPermissionsPanel,
} from "@jappan/components/guild/panels";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

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

function GuildDetails({ guild }: { guild: UserGuildDetails }) {
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
				<ServicePreferencesEditor
					guild={{ ...guild, isActiveMember: true }}
					active={section === "service-preferences"}
				/>
			</TabsPanel>
			<TabsPanel value="bot-permissions" keepMounted>
				<BotPermissionsPanel permissions={guild.permissions} />
			</TabsPanel>
			<TabsPanel value="command-permissions" keepMounted>
				<CommandPermissionsPanel permissions={guild.permissions} />
			</TabsPanel>
		</Tabs>
	);
}

export default function UserViewGuild() {
	const { guildId = "" } = useParams();
	const navigate = useNavigate();
	const validGuildId = guildIdPattern.test(guildId);
	const guildQuery = useQuery({
		queryKey: ["user", "guild", guildId],
		queryFn: () => APIHandler.getUserGuild(guildId),
		enabled: validGuildId,
	});
	// The ID joins the title once the guild has loaded
	useDocumentTitle(formatTitle(guildQuery.isSuccess ? `View Guild: ${guildId}` : "View Guild"));

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
		content = <p className="text-muted-foreground">Enter a guild ID to view its details and manage preferences.</p>;
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
