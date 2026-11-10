import { Avatar, Button, PillLink, Tabs, TabsList, TabsPanel, TabsTab } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import { useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { FiArrowLeft, FiGift, FiHome, FiList } from "react-icons/fi";
import { Link, useParams } from "react-router-dom";

import { AccessRedirect } from "@jappan/components/AdminRoute";
import GuildPageHeader from "@jappan/components/display/GuildPageHeader";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildLeaderboardList from "@jappan/components/panel/guild-leaderboard-list";
import GuildLeaderboardOverview from "@jappan/components/panel/guild-leaderboard-overview";
import GuildLeaderboardRewards from "@jappan/components/panel/guild-leaderboard-rewards";
import APIHandler from "@jappan/handlers/APIHandler";
import { isAdminSession, useSessionQuery } from "@jappan/handlers/auth";
import guildIdPattern from "@jappan/helpers/guildIdPattern";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

const leaderboardSections = [
	{ id: "overview", label: "Overview", icon: FiHome },
	{ id: "rewards", label: "Rewards", icon: FiGift },
	{ id: "list", label: "List", icon: FiList },
];

function readSectionFromHash() {
	const id = window.location.hash.slice(1);
	return leaderboardSections.some((section) => section.id === id) ? id : leaderboardSections[0].id;
}

function leaderboardErrorMessage(status: number | undefined) {
	if (status === 404) return "Guild not found.";
	if (status === 403) return "You need to be a member of this guild to view its leaderboard.";
	return "Could not load the leaderboard. Check your access and try again.";
}

function LeaderboardError({ status, onRetry }: { status: number | undefined; onRetry: () => void }) {
	return (
		<div role="alert" className="space-y-2">
			<p>{leaderboardErrorMessage(status)}</p>
			<Button size="sm" variant="outline-primary" onClick={onRetry}>
				Retry
			</Button>
		</div>
	);
}

export default function GuildLeaderboard() {
	const { guildId = "" } = useParams();
	const [section, setSection] = useState(readSectionFromHash);
	const queryClient = useQueryClient();
	const { data: session } = useSessionQuery();
	const admin = isAdminSession(session);
	const validGuildId = guildIdPattern.test(guildId);
	const guildsQuery = useQuery({
		queryKey: ["user", "member-guilds"],
		queryFn: APIHandler.getUserMemberGuilds,
		enabled: !guildId,
	});
	const overviewQuery = useQuery({
		queryKey: ["guild", guildId, "leaderboard", 1],
		queryFn: () => APIHandler.getGuildLeaderboard(guildId, 1),
		enabled: validGuildId,
	});
	const leaderboardQuery = useQuery({
		queryKey: ["guild", guildId, "leaderboard", "all"],
		queryFn: async () => {
			const firstPage = await queryClient.fetchQuery({
				queryKey: ["guild", guildId, "leaderboard", 1],
				queryFn: () => APIHandler.getGuildLeaderboard(guildId, 1),
			});
			const pages = [firstPage];
			const batchSize = 5;

			for (let firstPageInBatch = 2; firstPageInBatch <= firstPage.pageCount; firstPageInBatch += batchSize) {
				const batchPages = await Promise.all(
					Array.from(
						{ length: Math.min(batchSize, firstPage.pageCount - firstPageInBatch + 1) },
						(_, index) => firstPageInBatch + index,
					).map((page) =>
						queryClient.fetchQuery({
							queryKey: ["guild", guildId, "leaderboard", page],
							queryFn: () => APIHandler.getGuildLeaderboard(guildId, page),
						}),
					),
				);
				pages.push(...batchPages);
			}

			return { ...firstPage, entries: pages.flatMap((page) => page.entries) };
		},
		enabled: validGuildId && section === "list",
	});
	const guild = leaderboardQuery.data ?? overviewQuery.data;

	useEffect(() => {
		const handleHashChange = () => setSection(readSectionFromHash());
		window.addEventListener("hashchange", handleHashChange);
		return () => window.removeEventListener("hashchange", handleHashChange);
	}, []);

	useDocumentTitle(formatTitle(guild ? `Leaderboard: ${guild.guildName}` : "Leaderboards"));

	const guildQueryError = overviewQuery.error ?? leaderboardQuery.error;
	const guildQueryErrorStatus = axios.isAxiosError(guildQueryError) ? guildQueryError.response?.status : undefined;
	const guildsErrorStatus = axios.isAxiosError(guildsQuery.error) ? guildsQuery.error.response?.status : undefined;
	if (guildQueryErrorStatus === 401 || guildsErrorStatus === 401) {
		return <AccessRedirect status={401} />;
	}
	if (admin && (guildQueryErrorStatus === 403 || guildsErrorStatus === 403)) {
		return <AccessRedirect status={403} />;
	}

	const changeSection = (value: string) => {
		setSection(value);
		window.history.replaceState(
			window.history.state,
			"",
			`${window.location.pathname}${window.location.search}#${value}`,
		);
	};

	const pageContent = (() => {
		if (!guildId) {
			if (guildsQuery.isPending) return <LoadingIndicator label="Loading guilds" />;
			if (guildsQuery.isError) {
				return (
					<div role="alert" className="space-y-2">
						<p>Could not load guilds. Please try again.</p>
						<Button size="sm" variant="outline-primary" onClick={() => void guildsQuery.refetch()}>
							Retry
						</Button>
					</div>
				);
			}
			const guilds = guildsQuery.data;
			if (guilds.length === 0) {
				return <p className="text-muted-foreground">No guilds available to view.</p>;
			}
			return (
				<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{guilds.map((item) => (
						<li key={item.id}>
							<Link
								to={`/guild/${encodeURIComponent(item.id)}/leaderboard`}
								className="flex min-w-0 items-center gap-3 rounded-md border border-border p-3 transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-opacity-75"
							>
								<Avatar name={item.name} image={item.icon} size="md" aria-hidden="true" />
								<span className="min-w-0">
									<span className="block truncate font-medium">{item.name}</span>
									<span className="block truncate text-xs text-muted-foreground">{item.id}</span>
								</span>
							</Link>
						</li>
					))}
				</ul>
			);
		}
		if (!validGuildId) {
			return <p role="alert">Invalid guild ID.</p>;
		}

		return (
			<Tabs value={section} onValueChange={changeSection} className="gap-5">
				<TabsList aria-label="Leaderboard sections">
					{leaderboardSections.map(({ id, label, icon: Icon }) => (
						<TabsTab key={id} value={id} size="sm">
							<span className="inline-flex items-center gap-2">
								<Icon className="size-4" aria-hidden="true" />
								{label}
							</span>
						</TabsTab>
					))}
				</TabsList>
				<TabsPanel value="overview" keepMounted>
					{overviewQuery.isPending || overviewQuery.isFetching ? (
						<LoadingIndicator label="Loading leaderboard overview" />
					) : overviewQuery.isError ? (
						<LeaderboardError status={guildQueryErrorStatus} onRetry={() => void overviewQuery.refetch()} />
					) : (
						<GuildLeaderboardOverview leaderboard={overviewQuery.data} />
					)}
				</TabsPanel>
				<TabsPanel value="rewards" keepMounted>
					{overviewQuery.isPending || overviewQuery.isFetching ? (
						<LoadingIndicator label="Loading leaderboard rewards" />
					) : overviewQuery.isError ? (
						<LeaderboardError status={guildQueryErrorStatus} onRetry={() => void overviewQuery.refetch()} />
					) : (
						<GuildLeaderboardRewards leaderboard={overviewQuery.data} />
					)}
				</TabsPanel>
				<TabsPanel value="list" keepMounted>
					{leaderboardQuery.isPending || leaderboardQuery.isFetching ? (
						<LoadingIndicator label="Loading leaderboard" />
					) : leaderboardQuery.isError ? (
						<LeaderboardError
							status={guildQueryErrorStatus}
							onRetry={() => void leaderboardQuery.refetch()}
						/>
					) : (
						<GuildLeaderboardList leaderboard={leaderboardQuery.data} />
					)}
				</TabsPanel>
			</Tabs>
		);
	})();

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			{guildId && (
				<PillLink href="/leaderboards" variant="outline-secondary" size="sm" className="mb-5 gap-2">
					<FiArrowLeft aria-hidden="true" />
					Back to leaderboards
				</PillLink>
			)}
			<GuildPageHeader
				title={guildId ? "Guild leaderboard" : "Leaderboards"}
				guild={guild ? { id: guildId, name: guild.guildName, icon: guild.guildIcon } : undefined}
			/>
			{pageContent}
		</main>
	);
}
