import { Avatar, Button, Card, DateHandler, Input } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState, type SubmitEvent } from "react";

import { AccessRedirect, accessErrorStatus } from "@jappan/components/AuthRoute";
import UserDisplay from "@jappan/components/display/UserDisplay";
import ExternalTextLink from "@jappan/components/ExternalTextLink";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import APIHandler, { type User } from "@jappan/handlers/APIHandler";
import useDirectMessageWebsocket from "@jappan/handlers/useDirectMessageWebsocket";
import {
	fetchDirectMessageConversations,
	fetchDirectMessageHistory,
	getWebsocket,
	sendDirectMessage,
	WebsocketRequestError,
} from "@jappan/handlers/websocket";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

function errorMessage(error: unknown, fallback: string): string {
	if (error instanceof WebsocketRequestError) return error.message;
	if (axios.isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}
	return fallback;
}

function inboxSocket() {
	const socket = getWebsocket();
	if (!socket?.connected) throw new WebsocketRequestError(503, "Not connected to the inbox. Reconnecting…");
	return socket;
}

export default function DirectMessages() {
	useDocumentTitle(formatTitle("Direct messages", "Admin"));
	const queryClient = useQueryClient();
	const [page, setPage] = useState(1);
	const [selectedUser, setSelectedUser] = useState<User | null>(null);
	const [cursors, setCursors] = useState<string[]>([]);
	const [draft, setDraft] = useState("");
	const [socketAccessError, setSocketAccessError] = useState<401 | 403 | null>(null);
	const before = cursors[cursors.length - 1];
	const conversationKey = ["admin", "direct-messages", "conversations", page];
	const messageKey = ["admin", "direct-messages", "messages", selectedUser?.id, before];
	const conversations = useQuery({
		queryKey: conversationKey,
		queryFn: () =>
			page === 1 && !queryClient.getQueryData(conversationKey)
				? APIHandler.getAdminDirectMessageConversations(page)
				: fetchDirectMessageConversations(inboxSocket(), page),
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: false,
		retry: false,
	});
	const messages = useQuery({
		queryKey: messageKey,
		queryFn: () => {
			if (!selectedUser) throw new Error("No conversation selected");
			if (!before && !queryClient.getQueryData(messageKey)) {
				return APIHandler.getAdminDirectMessages(selectedUser.id);
			}
			return fetchDirectMessageHistory({ socket: inboxSocket(), userId: selectedUser.id, before });
		},
		enabled: selectedUser !== null,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: false,
		retry: false,
	});
	const websocketStatus = useDirectMessageWebsocket({
		enabled: conversations.data !== undefined && socketAccessError === null,
		onChange: async (userIds) => {
			const refreshes = [queryClient.invalidateQueries({ queryKey: conversationKey, exact: true })];
			if (selectedUser && (!userIds || userIds.includes(selectedUser.id))) {
				refreshes.push(queryClient.invalidateQueries({ queryKey: messageKey, exact: true }));
			}
			await Promise.all(refreshes);
		},
		onAccessProblem: setSocketAccessError,
	});
	const send = useMutation({
		mutationFn: ({ userId, content }: { userId: string; content: string }) =>
			sendDirectMessage({ socket: inboxSocket(), userId, content }),
		onSuccess: async (_message, { userId }) => {
			setDraft("");
			setCursors([]);
			await queryClient.invalidateQueries({ queryKey: ["admin", "direct-messages", "messages", userId] });
		},
	});
	const accessStatus =
		socketAccessError ??
		accessErrorStatus(conversations.error) ??
		accessErrorStatus(messages.error) ??
		accessErrorStatus(send.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	function selectUser(user: User) {
		setSelectedUser(user);
		setCursors([]);
		setDraft("");
		send.reset();
	}

	function submit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedUser || !draft.trim() || send.isPending || websocketStatus !== "connected") return;
		send.mutate({ userId: selectedUser.id, content: draft });
	}

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<h1 className="text-3xl font-bold tracking-tight typography-heading-2">Admin - Direct messages</h1>
			<p className="mt-2 text-sm text-muted-foreground">
				Only bot administrators can access this inbox. Conversations appear when the bot receives a DM after
				this feature is enabled. Message history is fetched from Discord, not stored in Jappan.
			</p>
			<p role="status" className="mt-2 text-sm text-muted-foreground">
				{websocketStatus === "connected"
					? "Live inbox connected."
					: websocketStatus === "connecting"
						? "Connecting to the live inbox…"
						: "Live inbox disconnected. Reconnecting…"}
			</p>
			<div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
				<Card hoverable={false} className="min-w-0 rounded-md border-border">
					<Card.Content className="p-3!">
						<h2 className="mb-3 text-xl font-bold">Conversations</h2>
						{conversations.isPending ? (
							<LoadingIndicator label="Loading conversations" />
						) : conversations.isError ? (
							<div role="alert" className="space-y-2">
								<p>{errorMessage(conversations.error, "Could not load conversations.")}</p>
								<Button type="button" size="sm" onClick={() => void conversations.refetch()}>
									Retry
								</Button>
							</div>
						) : conversations.data.items.length === 0 ? (
							<p className="text-sm text-muted-foreground">No conversations found.</p>
						) : (
							<ul className="space-y-1">
								{conversations.data.items.map(({ user, lastReceivedAt }) => (
									<li key={user.id}>
										<Button
											type="button"
											variant="ghost"
											aria-pressed={selectedUser?.id === user.id}
											disabled={send.isPending}
											onClick={() => selectUser(user)}
											className="h-auto w-full flex-col items-start border border-transparent p-2 text-left hover:text-primary aria-pressed:bg-accent aria-pressed:text-primary"
										>
											<span className="flex min-w-0 items-center gap-2">
												<Avatar
													name={user.displayName ?? user.username}
													image={user.avatarUrl}
													size="sm"
													aria-hidden="true"
												/>
												<span className="min-w-0 truncate">
													{user.displayName ?? user.username}
												</span>
											</span>
											<span className="mt-1 block text-xs text-muted-foreground">
												Received {DateHandler.getDateTime(new Date(lastReceivedAt).getTime())}
											</span>
										</Button>
									</li>
								))}
							</ul>
						)}
						<div className="mt-3 flex items-center justify-between gap-2">
							<Button
								type="button"
								size="sm"
								variant="outline-primary"
								disabled={page === 1 || websocketStatus !== "connected"}
								onClick={() => setPage(page - 1)}
							>
								Previous
							</Button>
							<span className="text-sm">Page {page}</span>
							<Button
								type="button"
								size="sm"
								variant="outline-primary"
								disabled={!conversations.data?.hasMore || websocketStatus !== "connected"}
								onClick={() => setPage(page + 1)}
							>
								Next
							</Button>
						</div>
					</Card.Content>
				</Card>
				<Card hoverable={false} className="min-w-0 rounded-md border-border">
					<Card.Content className="p-3!">
						{!selectedUser ? (
							<p className="text-muted-foreground">Select a conversation to read and reply.</p>
						) : (
							<>
								<h2 className="mb-3 text-xl font-bold">Conversation</h2>
								<UserDisplay user={selectedUser} size="sm" />
								{messages.isPending ? (
									<LoadingIndicator label="Loading messages" />
								) : messages.isError ? (
									<div role="alert" className="mt-4 space-y-2">
										<p>{errorMessage(messages.error, "Could not load messages from Discord.")}</p>
										<Button type="button" size="sm" onClick={() => void messages.refetch()}>
											Retry
										</Button>
									</div>
								) : (
									<>
										<div className="mt-4 flex flex-wrap gap-2">
											<Button
												type="button"
												size="sm"
												variant="outline-primary"
												disabled={!messages.data.nextBefore || websocketStatus !== "connected"}
												onClick={() => {
													if (messages.data.nextBefore)
														setCursors([...cursors, messages.data.nextBefore]);
												}}
											>
												Older messages
											</Button>
											<Button
												type="button"
												size="sm"
												variant="outline-primary"
												disabled={cursors.length === 0 || websocketStatus !== "connected"}
												onClick={() => setCursors(cursors.slice(0, -1))}
											>
												Newer messages
											</Button>
											<Button
												type="button"
												size="sm"
												variant="outline-primary"
												disabled={websocketStatus !== "connected"}
												onClick={() => void messages.refetch()}
											>
												Refresh
											</Button>
										</div>
										{messages.data.messages.length === 0 ? (
											<p className="mt-4 text-sm text-muted-foreground">
												No messages in this page.
											</p>
										) : (
											<ol
												className="mt-4 max-h-120 space-y-3 overflow-y-auto"
												aria-label="Messages"
											>
												{messages.data.messages.map((message) => (
													<li
														key={message.id}
														className="rounded-md border border-border p-3"
													>
														<div className="flex flex-wrap items-baseline justify-between gap-2">
															<span className="font-medium">
																{message.author.displayName ?? message.author.username}
															</span>
															<time
																className="text-xs text-muted-foreground"
																dateTime={new Date(
																	message.createdTimestampMs,
																).toISOString()}
															>
																{DateHandler.getDateTime(message.createdTimestampMs)}
															</time>
														</div>
														{message.content && (
															<p className="mt-1 whitespace-pre-wrap wrap-break-word">
																{message.content}
															</p>
														)}
														{message.embeds.map((embed, index) => (
															<div
																key={index}
																className="mt-2 rounded-md border border-border p-2 text-sm"
															>
																{embed.title && (
																	<p className="font-medium">{embed.title}</p>
																)}
																{embed.description && (
																	<p className="whitespace-pre-wrap wrap-break-word">
																		{embed.description}
																	</p>
																)}
																{embed.fields.map((field, fieldIndex) => (
																	<div
																		key={fieldIndex}
																		className="mt-1 whitespace-pre-wrap wrap-break-word"
																	>
																		<strong>{field.name}</strong>
																		<p>{field.value}</p>
																	</div>
																))}
															</div>
														))}
														{message.attachments.map((attachment) => (
															<p key={attachment.url} className="mt-1 break-all text-sm">
																<ExternalTextLink
																	href={attachment.url}
																	text={attachment.name}
																/>
															</p>
														))}
														{message.stickers.map((sticker) => (
															<p key={sticker.url} className="mt-1 text-sm">
																<ExternalTextLink
																	href={sticker.url}
																	text={`Sticker: ${sticker.name}`}
																/>
															</p>
														))}
													</li>
												))}
											</ol>
										)}
									</>
								)}
								<form onSubmit={submit} className="mt-4 space-y-2">
									<label htmlFor="direct-message-reply" className="block font-medium">
										Reply as the bot
									</label>
									<Input
										as="textarea"
										id="direct-message-reply"
										className="min-h-24! w-full"
										maxLength={2000}
										value={draft}
										disabled={send.isPending}
										onChange={(event) => setDraft(event.target.value)}
									/>
									<div className="flex items-center justify-between gap-2">
										<span className="text-xs text-muted-foreground">{draft.length}/2000</span>
										<Button
											type="submit"
											disabled={
												!draft.trim() || send.isPending || websocketStatus !== "connected"
											}
										>
											{send.isPending ? "Sending..." : "Send message"}
										</Button>
									</div>
									{send.isError && (
										<p role="alert" className="text-sm text-destructive">
											{errorMessage(send.error, "Could not send the message. Please try again.")}
										</p>
									)}
								</form>
							</>
						)}
					</Card.Content>
				</Card>
			</div>
		</main>
	);
}
