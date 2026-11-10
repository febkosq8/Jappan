import { Avatar, Button, Card, PillLink } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { FiArrowLeft } from "react-icons/fi";
import { Link, useParams, useSearchParams } from "react-router-dom";

import { AccessRedirect } from "@jappan/components/AdminRoute";
import GuildDisplay from "@jappan/components/display/GuildDisplay";
import RoleDisplay from "@jappan/components/display/RoleDisplay";
import UserDisplay from "@jappan/components/display/UserDisplay";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import APIHandler from "@jappan/handlers/APIHandler";
import { guildIdPattern } from "@jappan/components/panel/guild-lookup";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

export default function GuildLeaderboard({ admin }: { admin: boolean }) {
	const { guildId = "" } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const validGuildId = guildIdPattern.test(guildId);
	const requestedPage = Number(searchParams.get("page") ?? 1);
	const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
	const guildsQuery = useQuery({
		queryKey: [admin ? "admin" : "user", "list-guilds"],
		queryFn: () => (admin ? APIHandler.getAdminGuilds() : APIHandler.getUserGuilds()),
		enabled: !guildId,
	});
	const guildQuery = useQuery({
		queryKey: ["guild", guildId, "leaderboard", page],
		queryFn: () => APIHandler.getGuildLeaderboard(guildId, page),
		enabled: validGuildId,
	});

	useDocumentTitle(formatTitle(guildQuery.isSuccess ? `Leaderboard: ${guildQuery.data.guildName}` : "Leaderboard"));

	const errorStatus = axios.isAxiosError(guildQuery.error) ? guildQuery.error.response?.status : undefined;
	if (errorStatus === 401 || (admin && errorStatus === 403)) {
		return <AccessRedirect status={errorStatus} />;
	}
	const guildsErrorStatus = axios.isAxiosError(guildsQuery.error) ? guildsQuery.error.response?.status : undefined;
	if (guildsErrorStatus === 401 || (admin && guildsErrorStatus === 403)) {
		return <AccessRedirect status={guildsErrorStatus} />;
	}

	const changePage = (nextPage: number) => {
		const nextSearchParams = new URLSearchParams(searchParams);
		if (nextPage === 1) {
			nextSearchParams.delete("page");
		} else {
			nextSearchParams.set("page", String(nextPage));
		}
		setSearchParams(nextSearchParams);
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
			const guilds = guildsQuery.data.filter((guild) => !("isActiveMember" in guild) || guild.isActiveMember);
			if (guilds.length === 0) {
				return <p className="text-muted-foreground">No guilds available to view.</p>;
			}
			return (
				<ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					{guilds.map((guild) => (
						<li key={guild.id}>
							<Link
								to={`${admin ? "/admin/leaderboard" : "/leaderboard"}/${encodeURIComponent(guild.id)}`}
								className="flex min-w-0 items-center gap-3 rounded-md border border-border p-3 transition-colors hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-opacity-75"
							>
								<Avatar name={guild.name} image={guild.icon} size="md" aria-hidden="true" />
								<span className="min-w-0">
									<span className="block truncate font-medium">{guild.name}</span>
									<span className="block truncate text-xs text-muted-foreground">{guild.id}</span>
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
		if (guildQuery.isPending || guildQuery.isFetching) {
			return <LoadingIndicator label="Loading leaderboard" />;
		}
		if (guildQuery.isError) {
			const message =
				errorStatus === 404
					? "Guild not found."
					: errorStatus === 403
						? "You need Manage Server permission in this guild to view its leaderboard."
						: "Could not load the leaderboard. Check your access and try again.";
			return (
				<div role="alert" className="space-y-2">
					<p>{message}</p>
					<Button size="sm" variant="outline-primary" onClick={() => void guildQuery.refetch()}>
						Retry
					</Button>
				</div>
			);
		}

		const leaderboard = guildQuery.data;
		return (
			<div className="space-y-4">
				{leaderboard.reward && (
					<Card hoverable={false} aria-label="Leveling reward" className="p-5 sm:p-6">
						<h2 className="text-lg font-semibold">Leveling reward</h2>
						<dl className="mt-3 grid gap-3 sm:grid-cols-2">
							<div>
								<dt className="text-sm text-muted-foreground">Reward role</dt>
								<dd className="mt-1 font-medium">
									<RoleDisplay id={leaderboard.reward.role.id} name={leaderboard.reward.role.name} />
								</dd>
							</div>
							<div>
								<dt className="text-sm text-muted-foreground">Points required</dt>
								<dd className="mt-1 font-medium">
									{leaderboard.reward.threshold.toLocaleString()} points
								</dd>
							</div>
						</dl>
					</Card>
				)}
				{!leaderboard.enabled ? (
					<Card hoverable={false} className="p-5 sm:p-6">
						<p className="text-muted-foreground">Leveling is disabled for this guild.</p>
					</Card>
				) : (
					<Card hoverable={false} className="overflow-hidden p-0">
						{leaderboard.entries.length ? (
							<div className="overflow-x-auto">
								<table className="w-full min-w-[32rem] text-left text-sm">
									<thead className="border-b border-border bg-muted/40 text-muted-foreground">
										<tr>
											<th scope="col" className="px-4 py-3 font-medium">
												Rank
											</th>
											<th scope="col" className="px-4 py-3 font-medium">
												Member
											</th>
											<th scope="col" className="px-4 py-3 text-right font-medium">
												Points
											</th>
										</tr>
									</thead>
									<tbody className="divide-y divide-border">
										{leaderboard.entries.map((entry) => (
											<tr key={entry.userId}>
												<th scope="row" className="px-4 py-3 font-semibold">
													{entry.rank}
												</th>
												<td className="px-4 py-3">
													<UserDisplay
														id={entry.userId}
														name={entry.username}
														avatarUrl={entry.avatarUrl}
														showId={false}
													/>
												</td>
												<td className="px-4 py-3 text-right tabular-nums">
													{entry.points.toLocaleString()}
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						) : (
							<p className="p-5 text-muted-foreground">No member activity has been recorded yet.</p>
						)}
					</Card>
				)}
				{leaderboard.enabled && (
					<nav aria-label="Leaderboard pages" className="flex items-center justify-between gap-3">
						<Button
							type="button"
							size="sm"
							variant="outline-secondary"
							disabled={leaderboard.page <= 1}
							onClick={() => changePage(leaderboard.page - 1)}
						>
							Previous
						</Button>
						<p aria-live="polite" className="text-sm text-muted-foreground">
							Page {leaderboard.page} of {leaderboard.pageCount}
						</p>
						<Button
							type="button"
							size="sm"
							variant="outline-secondary"
							disabled={leaderboard.page >= leaderboard.pageCount}
							onClick={() => changePage(leaderboard.page + 1)}
						>
							Next
						</Button>
					</nav>
				)}
			</div>
		);
	})();

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<PillLink
				href={`${admin ? "/admin/guild" : "/guild"}/${encodeURIComponent(guildId)}`}
				variant="outline-secondary"
				size="sm"
				className="mb-5 gap-2"
			>
				<FiArrowLeft aria-hidden="true" />
				Back to guild
			</PillLink>
			<h1 className="mb-5 typography-heading-2 text-3xl font-bold tracking-tight">Guild leaderboard</h1>
			{guildQuery.data && (
				<div className="mb-5">
					<GuildDisplay id={guildId} name={guildQuery.data.guildName} icon={guildQuery.data.guildIcon} />
				</div>
			)}
			{pageContent}
		</main>
	);
}
