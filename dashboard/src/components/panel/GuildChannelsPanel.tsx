import { Button, Card, DateHandler, Tag } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

import APIHandler, { type AdminGuildChannel } from "@jappan/handlers/APIHandler";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/AdminRoute";
import ChannelDisplay from "@jappan/components/display/ChannelDisplay";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildSectionLink from "@jappan/components/panel/GuildSectionLink";

function ChannelGroupList({ guildId, channels }: { guildId: string; channels: AdminGuildChannel[] }) {
	const categoryType = 4;
	const categories = channels.filter((channel) => channel.type === categoryType);
	const categoryIds = new Set(categories.map((category) => category.id));
	const childrenByParent = new Map<string, AdminGuildChannel[]>();
	const uncategorized: AdminGuildChannel[] = [];
	for (const channel of channels) {
		if (channel.type === categoryType) continue;
		if (!channel.parent) {
			uncategorized.push(channel);
		} else {
			const children = childrenByParent.get(channel.parent.id) ?? [];
			children.push(channel);
			childrenByParent.set(channel.parent.id, children);
		}
	}
	const missingCategories = [...childrenByParent.entries()].filter(([id]) => !categoryIds.has(id));
	const groups = [
		...(uncategorized.length
			? [
					{
						key: "uncategorized",
						name: "Uncategorized channels",
						categoryId: null,
						unavailable: false,
						createdTimestampMs: null,
						channels: uncategorized,
					},
				]
			: []),
		...categories.map((category) => ({
			key: category.id,
			name: category.name,
			categoryId: category.id,
			unavailable: false,
			createdTimestampMs: category.createdTimestampMs,
			channels: childrenByParent.get(category.id) ?? [],
		})),
		...missingCategories.map(([id, children]) => ({
			key: id,
			name: children[0]?.parent?.name ?? "Unavailable category",
			categoryId: id,
			unavailable: true,
			createdTimestampMs: null,
			channels: children,
		})),
	];
	return (
		<div className="mt-4 space-y-4">
			{groups.map((group) => (
				<Card
					key={group.key}
					hoverable={false}
					role="region"
					aria-label={group.name}
					className={
						group.categoryId === null
							? "min-w-0 rounded-md border-dashed border-border bg-muted/30 p-3"
							: "min-w-0 rounded-md border-border p-3"
					}
				>
					<div className="flex items-center justify-between gap-2">
						<h3 className="wrap-break-word font-semibold">{group.name}</h3>
						<Tag variant="secondary" size="xs" className="shrink-0">
							{group.channels.length} {group.channels.length === 1 ? "channel" : "channels"}
						</Tag>
					</div>
					{group.categoryId === null && (
						<p className="mt-1 text-sm text-muted-foreground">These channels are not in a category.</p>
					)}
					{group.categoryId && (
						<p className="break-all text-xs text-muted-foreground">
							{group.unavailable ? "Category unavailable · " : ""}
							{group.categoryId}
						</p>
					)}
					{group.createdTimestampMs !== null && (
						<p className="mt-1 text-sm text-muted-foreground">
							Created: {DateHandler.getDateTime(group.createdTimestampMs)}
						</p>
					)}
					{group.channels.length === 0 ? (
						<p className="mt-2 text-sm text-muted-foreground">No channels in this category.</p>
					) : (
						<ul className="mt-3 grid items-start gap-3 sm:grid-cols-2">
							{group.channels.map((channel) => (
								<li key={channel.id}>
									<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
										<div className="flex flex-wrap items-start justify-between gap-2">
											<div className="min-w-0 wrap-break-word">
												<ChannelDisplay guildId={guildId} id={channel.id} name={channel.name} />
											</div>
											<div className="ml-auto flex flex-wrap justify-end gap-1">
												{channel.nsfw && (
													<Tag variant="warning" size="xs">
														NSFW
													</Tag>
												)}
												{channel.rateLimitPerUser != null &&
													channel.rateLimitPerUser > 0 && (
														<Tag variant="secondary" size="xs">
															Slowmode:{" "}
															{DateHandler.formatDuration(channel.rateLimitPerUser)}
														</Tag>
													)}
												{channel.userLimit !== undefined && channel.userLimit > 0 && (
													<Tag variant="secondary" size="xs">
														User limit: {channel.userLimit}
													</Tag>
												)}
												<Tag variant="secondary" size="xs" className="whitespace-nowrap">
													{channel.typeName.replace(/([a-z])([A-Z])/g, "$1 $2")}
												</Tag>
											</div>
										</div>
										<dl className="mt-2 grid grid-cols-[3fr_2fr] gap-x-3 gap-y-1 text-sm">
											<div className="col-span-2 grid min-w-0 grid-cols-[3fr_2fr] gap-x-3">
												<div className="flex min-w-0 flex-wrap gap-x-1">
													<dt className="text-muted-foreground">Created:</dt>
													<dd className="wrap-break-word">
														{DateHandler.getDateTime(channel.createdTimestampMs)}
													</dd>
												</div>
												{channel.bitrate !== undefined && (
													<div className="flex min-w-0 flex-wrap gap-x-1">
														<dt className="text-muted-foreground">Bitrate:</dt>
														<dd className="whitespace-nowrap">
															{channel.bitrate.toLocaleString()} bps
														</dd>
													</div>
												)}
											</div>
											<div className="flex min-w-0 flex-wrap gap-x-1">
												<dt className="text-muted-foreground">Can send message:</dt>
												<dd
													className={
														channel.canSendMessage
															? "font-medium text-success"
															: "font-medium text-destructive"
													}
												>
													{channel.canSendMessage ? "Yes" : "No"}
												</dd>
											</div>
											<div className="flex min-w-0 flex-wrap gap-x-1">
												<dt className="text-muted-foreground">Can read messages:</dt>
												<dd
													className={
														channel.canReadMessages
															? "font-medium text-success"
															: "font-medium text-destructive"
													}
												>
													{channel.canReadMessages ? "Yes" : "No"}
												</dd>
											</div>
											<div className="flex min-w-0 flex-wrap gap-x-1">
												<dt className="text-muted-foreground">Can manage messages:</dt>
												<dd
													className={
														channel.canManageMessages
															? "font-medium text-success"
															: "font-medium text-destructive"
													}
												>
													{channel.canManageMessages ? "Yes" : "No"}
												</dd>
											</div>
											{channel.topic && (
												<div className="col-span-2 min-w-0">
													<dt className="text-muted-foreground">Topic:</dt>
													<dd className="wrap-break-word whitespace-pre-wrap">
														{channel.topic}
													</dd>
												</div>
											)}
											{channel.rateLimitPerUser === null && (
												<div className="flex min-w-0 flex-wrap gap-x-1">
													<dt className="text-muted-foreground">Slowmode:</dt>
													<dd>Unavailable</dd>
												</div>
											)}
										</dl>
									</Card>
								</li>
							))}
						</ul>
					)}
				</Card>
			))}
		</div>
	);
}

export default function GuildChannelsPanel({ guild }: { guild: { id: string; isActiveMember: boolean } }) {
	const channelsQuery = useQuery({
		queryKey: ["user", "guild", guild.id, "channels"],
		queryFn: () => APIHandler.getGuildChannels(guild.id),
		enabled: false,
		retry: false,
	});
	const totalChannelCount = channelsQuery.data?.filter((channel) => channel.type !== 4).length;
	const accessStatus = accessErrorStatus(channelsQuery.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	const errorStatus = axios.isAxiosError(channelsQuery.error) ? channelsQuery.error.response?.status : undefined;
	const errorMessage =
		errorStatus === 409
			? "The bot is no longer a member of this guild."
			: errorStatus === 404
				? "This guild is no longer registered."
				: errorStatus === 503
					? "The guild or a required service is unavailable. Please try again."
					: "Could not load channels. Please try again.";

	return (
		<Card id="guild-channels" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<div className="flex items-center justify-between gap-3">
				<h2 className="flex items-center gap-1 text-lg font-semibold">
					Channels <GuildSectionLink id="guild-channels" label="channels" />
				</h2>
				{totalChannelCount !== undefined && (
					<span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
						Total: {totalChannelCount} {totalChannelCount === 1 ? "channel" : "channels"}
					</span>
				)}
			</div>
			<p className="mt-1 text-sm text-muted-foreground">
				Load the current channels and categories from Discord. Threads are not included.
			</p>
			<Button
				type="button"
				size="sm"
				variant="outline-primary"
				className="mt-3"
				disabled={channelsQuery.isFetching || !guild.isActiveMember}
				onClick={() => void channelsQuery.refetch()}
			>
				{channelsQuery.data ? "Refresh channels" : "Load channels"}
			</Button>
			{!guild.isActiveMember && (
				<p className="mt-3 text-muted-foreground">The bot is not a member of this guild.</p>
			)}
			{channelsQuery.isFetching ? (
				<div className="mt-3">
					<LoadingIndicator label="Loading channels" inline size={80} rows={1} columns={5} />
				</div>
			) : channelsQuery.isError ? (
				<p role="alert" className="mt-3 text-destructive">
					{errorMessage}
				</p>
			) : channelsQuery.data?.length === 0 ? (
				<p className="mt-3 text-muted-foreground">No channels found.</p>
			) : channelsQuery.data ? (
				<ChannelGroupList guildId={guild.id} channels={channelsQuery.data} />
			) : null}
		</Card>
	);
}
