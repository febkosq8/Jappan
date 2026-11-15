import { Button, PillLink, Tabs, TabsList, TabsPanel, TabsTab } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { FaListCheck } from "react-icons/fa6";
import {
	FiAlertCircle,
	FiArrowLeft,
	FiGlobe,
	FiHash,
	FiHome,
	FiKey,
	FiSliders,
	FiTag,
	FiTrash2,
	FiUserCheck,
} from "react-icons/fi";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";

import APIHandler, { type UserGuildDetails } from "@jappan/handlers/APIHandler";
import { AccessRedirect } from "@jappan/components/AuthRoute";
import ErrorPage from "@jappan/components/ErrorPage";
import GuildPageHeader from "@jappan/components/display/GuildPageHeader";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildChannelsPanel from "@jappan/components/panel/GuildChannelsPanel";
import GuildRolesPanel from "@jappan/components/panel/GuildRolesPanel";
import GuildServicePreferencesPanel from "@jappan/components/panel/GuildServicePreferencesPanel";
import GuildVoiceRegionLockManagerPanel from "@jappan/components/panel/GuildVoiceRegionLockManagerPanel";
import GuildWarningManagerPanel from "@jappan/components/panel/GuildWarningManagerPanel";
import GuildUserAccessPanel from "@jappan/components/panel/GuildUserAccessPanel";
import GuildOverviewPanel from "@jappan/components/panel/GuildOverviewPanel";
import BotPermissionsPanel from "@jappan/components/panel/BotPermissionsPanel";
import CommandPermissionsPanel from "@jappan/components/panel/CommandPermissionsPanel";
import PurgeMessagesPanel from "@jappan/components/panel/PurgeMessagesPanel";
import guildIdPattern from "@jappan/helpers/guildIdPattern";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

const guildSections = [
	{ id: "overview", label: "Overview", icon: FiHome },
	{ id: "channels", label: "Channels", icon: FiHash },
	{ id: "roles", label: "Roles", icon: FiTag },
	{ id: "evaluate-user", label: "Evaluate user", icon: FiUserCheck },
	{ id: "service-preferences", label: "Service Preferences", icon: FiSliders },
	{ id: "warnings", label: "Warnings", icon: FiAlertCircle },
	{ id: "voice-region-locks", label: "Voice region locks", icon: FiGlobe },
	{ id: "bot-permissions", label: "Bot permissions", icon: FiKey },
	{ id: "command-permissions", label: "Command permissions", icon: FaListCheck },
	{ id: "purge-messages", label: "Purge messages", icon: FiTrash2 },
];

const readSectionFromHash = () => {
	const id = window.location.hash.slice(1);
	return guildSections.some((section) => section.id === id) ? id : guildSections[0].id;
};

function GuildDetails({ guild }: { guild: UserGuildDetails }) {
	const [section, setSection] = useState(readSectionFromHash);

	useEffect(() => {
		const syncSectionFromUrl = () => {
			const nextSection = readSectionFromHash();
			setSection(nextSection);
			if (nextSection === "evaluate-user") return;
			const url = new URL(window.location.href);
			url.searchParams.delete("userAccessMemberId");
			url.searchParams.delete("userAccessTab");
			window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
		};
		window.addEventListener("hashchange", syncSectionFromUrl);
		window.addEventListener("popstate", syncSectionFromUrl);
		syncSectionFromUrl();
		return () => {
			window.removeEventListener("hashchange", syncSectionFromUrl);
			window.removeEventListener("popstate", syncSectionFromUrl);
		};
	}, []);

	const changeSection = (value: string) => {
		setSection(value);
		const url = new URL(window.location.href);
		url.hash = value;
		if (value !== "evaluate-user") {
			url.searchParams.delete("userAccessMemberId");
			url.searchParams.delete("userAccessTab");
		}
		window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
	};

	return (
		<Tabs value={section} onValueChange={changeSection} className="gap-5">
			<TabsList aria-label="Guild sections" className="flex-wrap overflow-visible">
				{guildSections.map(({ id, label, icon: Icon }) => (
					<TabsTab key={id} value={id} size="sm">
						<span className="inline-flex items-center gap-2">
							<Icon className="size-4" aria-hidden="true" />
							{label}
						</span>
					</TabsTab>
				))}
			</TabsList>
			<TabsPanel value="overview" keepMounted>
				<GuildOverviewPanel guild={guild} />
			</TabsPanel>
			<TabsPanel value="channels" keepMounted>
				<GuildChannelsPanel guild={guild} />
			</TabsPanel>
			<TabsPanel value="roles" keepMounted>
				<GuildRolesPanel guild={guild} />
			</TabsPanel>
			<TabsPanel value="evaluate-user" keepMounted>
				<GuildUserAccessPanel
					key={guild.id}
					guildId={guild.id}
					active={section === "evaluate-user"}
					isActiveMember={guild.isActiveMember}
				/>
			</TabsPanel>
			<TabsPanel value="service-preferences" keepMounted>
				<GuildServicePreferencesPanel guild={guild} active={section === "service-preferences"} />
			</TabsPanel>
			<TabsPanel value="warnings" keepMounted>
				<GuildWarningManagerPanel
					guildId={guild.id}
					active={section === "warnings"}
					isActiveMember={guild.isActiveMember}
				/>
			</TabsPanel>
			<TabsPanel value="voice-region-locks" keepMounted>
				<GuildVoiceRegionLockManagerPanel
					key={guild.id}
					guildId={guild.id}
					active={section === "voice-region-locks"}
					isActiveMember={guild.isActiveMember}
				/>
			</TabsPanel>
			<TabsPanel value="bot-permissions" keepMounted>
				<BotPermissionsPanel permissions={guild.permissions} />
			</TabsPanel>
			<TabsPanel value="command-permissions" keepMounted>
				<CommandPermissionsPanel permissions={guild.permissions} />
			</TabsPanel>
			<TabsPanel value="purge-messages" keepMounted>
				<PurgeMessagesPanel active={section === "purge-messages"} guildId={guild.id} />
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
	useDocumentTitle(formatTitle(guildQuery.isSuccess ? `Guild: ${guildQuery.data.name}` : "Guild details"));

	const guildNotFound =
		guildQuery.isError && axios.isAxiosError(guildQuery.error) && guildQuery.error.response?.status === 404;

	useEffect(() => {
		if (!validGuildId || guildQuery.isFetching || !guildNotFound) return;
		toast.warning(`Guild ${guildId} not found.`, { id: "guild-not-found" });
		navigate("/guilds", { replace: true });
	}, [guildId, guildNotFound, guildQuery.isFetching, navigate, validGuildId]);

	const isUnauthorized = axios.isAxiosError(guildQuery.error) && guildQuery.error.response?.status === 401;
	if (isUnauthorized) return <AccessRedirect status={401} />;

	if (!validGuildId) {
		return (
			<ErrorPage
				status="400"
				title="Invalid guild ID"
				message="The guild ID in this address is invalid."
				actions={
					<PillLink href="/guilds" variant="outline-secondary">
						All guilds
					</PillLink>
				}
			/>
		);
	}
	if (guildNotFound) return null;
	if (guildQuery.isError) {
		const errorStatus = axios.isAxiosError(guildQuery.error) ? guildQuery.error.response?.status : undefined;
		const errorMessage =
			errorStatus === 403
				? "You need Manage Server permission in this guild to view its details."
				: "Could not load guild details.\nCheck your access and try again.";
		return (
			<ErrorPage
				status={errorStatus ? String(errorStatus) : "Guild error"}
				title="Could not load guild details"
				message={errorMessage}
				actions={
					<>
						<Button onClick={() => void guildQuery.refetch()}>Retry</Button>
						<PillLink href="/guilds" variant="outline-secondary">
							All guilds
						</PillLink>
					</>
				}
			/>
		);
	}

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<PillLink href="/guilds" variant="outline-secondary" size="sm" className="mb-5 gap-2">
				<FiArrowLeft aria-hidden="true" />
				Guilds
			</PillLink>
			<GuildPageHeader title="Guild details" guild={guildQuery.data} />
			{guildQuery.isPending || guildQuery.isFetching ? (
				<LoadingIndicator label="Loading guild" />
			) : guildQuery.data ? (
				<GuildDetails guild={guildQuery.data} />
			) : null}
		</main>
	);
}
