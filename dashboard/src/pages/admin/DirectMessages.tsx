import { Button, Card, DateHandler, Input, Tag } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState, type SubmitEvent } from "react";
import {
	FiChevronLeft,
	FiChevronRight,
	FiLoader,
	FiMessageSquare,
	FiRefreshCw,
	FiSend,
	FiWifi,
	FiWifiOff,
} from "react-icons/fi";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";

import { AccessRedirect, accessErrorStatus } from "@jappan/components/AuthRoute";
import UserDisplay from "@jappan/components/display/UserDisplay";
import ExternalTextLink from "@jappan/components/ExternalTextLink";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import APIHandler, { type User } from "@jappan/handlers/APIHandler";
import useDirectMessageWebsocket from "@jappan/handlers/useDirectMessageWebsocket";
import {
	fetchDirectMessageHistory,
	getWebsocket,
	sendDirectMessage,
	WebsocketRequestError,
} from "@jappan/handlers/websocket";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

const CONVERSATIONS_PER_PAGE = 30;

function errorMessage(error: unknown, fallback: string): string {
	if (error instanceof WebsocketRequestError) return error.message;
	if (axios.isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}
	return fallback;
}

function conversationSocket() {
	const socket = getWebsocket();
	if (!socket?.connected) throw new WebsocketRequestError(503, "Not connected to the conversation. Reconnecting…");
	return socket;
}

function websocketAccessStatus(error: unknown): 401 | 403 | undefined {
	if (error instanceof WebsocketRequestError && (error.status === 401 || error.status === 403)) return error.status;
	return undefined;
}

export default function DirectMessages() {
	useDocumentTitle(formatTitle("Direct messages", "Admin"));
	const queryClient = useQueryClient();
	const [page, setPage] = useState(1);
	const [selectedUser, setSelectedUser] = useState<User | null>(null);
	const [cursors, setCursors] = useState<string[]>([]);
	const [draft, setDraft] = useState("");
	const [socketAccessError, setSocketAccessError] = useState<401 | 403 | null>(null);
	const [conversationUnavailable, setConversationUnavailable] = useState(false);
	const before = cursors[cursors.length - 1];
	const conversationKey = ["admin", "direct-messages", "conversations", page];
	const messageKey = ["admin", "direct-messages", "messages", selectedUser?.id, before];
	const conversations = useQuery({
		queryKey: conversationKey,
		queryFn: () => APIHandler.getAdminDirectMessageConversations(page, CONVERSATIONS_PER_PAGE),
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: false,
		retry: false,
	});
	const { status: websocketStatus, bot } = useDirectMessageWebsocket({
		userId: selectedUser?.id ?? "",
		enabled: selectedUser !== null && socketAccessError === null && !conversationUnavailable,
		onSubscribed: () => {
			void queryClient.invalidateQueries({
				queryKey: ["admin", "direct-messages", "messages", selectedUser?.id],
				refetchType: "none",
			});
		},
		onChange: async () => {
			if (selectedUser && before) {
				await queryClient.invalidateQueries({
					queryKey: ["admin", "direct-messages", "messages", selectedUser.id, undefined],
					exact: true,
					refetchType: "all",
				});
			}
			await queryClient.invalidateQueries({ queryKey: messageKey, exact: true });
		},
		onAccessProblem: setSocketAccessError,
		onUnavailable: () => setConversationUnavailable(true),
	});
	const messages = useQuery({
		queryKey: messageKey,
		queryFn: () => {
			if (!selectedUser) throw new Error("No conversation selected");
			return fetchDirectMessageHistory({ socket: conversationSocket(), userId: selectedUser.id, before });
		},
		enabled: selectedUser !== null && websocketStatus === "connected" && !conversationUnavailable,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: false,
		retry: false,
	});
	const send = useMutation({
		mutationFn: ({ userId, content }: { userId: string; content: string }) =>
			sendDirectMessage({ socket: conversationSocket(), userId, content }),
		onSuccess: async (_message, { userId }) => {
			setDraft("");
			setCursors([]);
			await queryClient.invalidateQueries({
				queryKey: ["admin", "direct-messages", "messages", userId, undefined],
				exact: true,
				refetchType: "all",
			});
		},
	});
	const accessStatus =
		socketAccessError ??
		accessErrorStatus(conversations.error) ??
		websocketAccessStatus(messages.error) ??
		websocketAccessStatus(send.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	const connectionDescription = conversationUnavailable
		? "This conversation is no longer available."
		: websocketStatus === "connected"
			? "Live conversation connected."
			: websocketStatus === "connecting"
				? "Connecting to the live conversation…"
				: "Live conversation disconnected. Reconnecting…";

	function selectUser(user: User) {
		setSelectedUser(user);
		setCursors([]);
		setDraft("");
		setConversationUnavailable(false);
		send.reset();
	}

	function submit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedUser || !draft.trim() || send.isPending || websocketStatus !== "connected") return;
		send.mutate({ userId: selectedUser.id, content: draft });
	}

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<header>
				<h1 className="typography-heading-2 text-3xl font-bold tracking-tight">Direct messages</h1>
				<p className="mt-1 text-muted-foreground">
					Bot administrators can read and reply to direct messages. History is fetched from Discord.
				</p>
			</header>
			<div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
				<Card hoverable={false} className="min-w-0 rounded-md border-border p-5 sm:p-6">
					<Card.Content className="p-0!">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h2 className="flex items-center gap-2 text-lg font-semibold">
								<FiMessageSquare className="size-5 text-primary" aria-hidden="true" />
								Conversations
							</h2>
							<Button
								type="button"
								size="icon-sm"
								variant="outline-primary"
								className="group/refetch"
								aria-label="Refresh conversations"
								title="Refresh conversations"
								onClick={() => void conversations.refetch()}
							>
								<FiRefreshCw className="size-4 group-hover/refetch:animate-spin" aria-hidden="true" />
							</Button>
						</div>
						<p className="mt-1 text-sm text-muted-foreground">
							Conversations appear when the bot receives a direct message.
						</p>
						{conversations.isPending ? (
							<LoadingIndicator label="Loading conversations" />
						) : conversations.isError ? (
							<div role="alert" className="mt-4 flex flex-wrap items-center gap-2">
								<p className="text-sm text-destructive">
									{errorMessage(conversations.error, "Could not load conversations.")}
								</p>
								<Button
									type="button"
									size="sm"
									variant="outline-primary"
									onClick={() => void conversations.refetch()}
								>
									Retry
								</Button>
							</div>
						) : conversations.data.items.length === 0 ? (
							<p className="mt-4 text-sm text-muted-foreground">No conversations found.</p>
						) : (
							<ul className="mt-4 max-h-120 space-y-2 overflow-y-auto">
								{conversations.data.items.map(({ user, lastReceivedAt }) => (
									<li key={user.id}>
										<Card hoverable={false} className="rounded-md border-border p-0">
											<Button
												type="button"
												variant="ghost"
												aria-label={`Open conversation with ${user.displayName ?? user.username} (@${user.username})`}
												aria-describedby={`conversation-received-${user.id}`}
												aria-pressed={selectedUser?.id === user.id}
												disabled={send.isPending}
												onClick={() => selectUser(user)}
												className="peer absolute inset-0 h-full w-full border border-transparent p-0 aria-pressed:bg-accent"
											/>
											<div className="pointer-events-none relative min-w-0 p-3 peer-hover:text-primary peer-aria-pressed:text-primary [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_p]:flex-wrap [&_p>span]:min-w-0 [&_p>span]:shrink [&_p>span]:break-all">
												<UserDisplay user={user} size="xl" />
												<div
													id={`conversation-received-${user.id}`}
													className="mt-2 flex flex-wrap items-center justify-between gap-1 text-xs text-muted-foreground"
												>
													Received
													<Tag
														variant="secondary"
														size="xs"
														className="ml-auto max-w-full font-normal"
													>
														<time dateTime={lastReceivedAt}>
															{DateHandler.getDateTime(
																new Date(lastReceivedAt).getTime(),
															)}
														</time>
													</Tag>
												</div>
											</div>
										</Card>
									</li>
								))}
							</ul>
						)}
						<div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-4">
							<Button
								type="button"
								size="sm"
								variant="outline-primary"
								className="gap-1"
								disabled={page === 1}
								onClick={() => setPage(page - 1)}
							>
								<FiChevronLeft aria-hidden="true" />
								Previous
							</Button>
							<span className="text-sm text-muted-foreground">Page {page}</span>
							<Button
								type="button"
								size="sm"
								variant="outline-primary"
								className="gap-1"
								disabled={!conversations.data || page >= conversations.data.pagination.totalPages}
								onClick={() => setPage(page + 1)}
							>
								Next
								<FiChevronRight aria-hidden="true" />
							</Button>
						</div>
					</Card.Content>
				</Card>
				<Card hoverable={false} className="min-w-0 rounded-md border-border p-5 sm:p-6">
					<Card.Content className="p-0!">
						{!selectedUser ? (
							<div className="flex min-h-48 flex-col items-center justify-center text-center">
								<span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
									<FiMessageSquare className="size-5" aria-hidden="true" />
								</span>
								<h2 className="mt-3 text-lg font-semibold">Select a conversation</h2>
								<p className="mt-1 text-sm text-muted-foreground">
									Choose a conversation to read messages and reply as the bot.
								</p>
							</div>
						) : (
							<>
								<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
									<h2 className="flex items-center gap-2 text-lg font-semibold">
										<FiMessageSquare className="size-5 text-primary" aria-hidden="true" />
										Conversation
									</h2>
									<div className="flex flex-wrap items-center justify-end gap-2">
										<Tag
											role="status"
											variant={
												conversationUnavailable
													? "destructive"
													: websocketStatus === "connected"
														? "success"
														: websocketStatus === "connecting"
															? "secondary"
															: "warning"
											}
											size="xs"
											title={connectionDescription}
											aria-label={connectionDescription}
										>
											{conversationUnavailable || websocketStatus === "disconnected" ? (
												<FiWifiOff className="mr-1 size-3" aria-hidden="true" />
											) : websocketStatus === "connecting" ? (
												<FiLoader className="mr-1 size-3 animate-spin" aria-hidden="true" />
											) : (
												<FiWifi className="mr-1 size-3" aria-hidden="true" />
											)}
											{conversationUnavailable
												? "Unavailable"
												: websocketStatus === "connected"
													? "Connected"
													: websocketStatus === "connecting"
														? "Connecting"
														: "Reconnecting"}
										</Tag>
										<Button
											type="button"
											size="icon-sm"
											variant="outline-primary"
											className="group/refetch"
											aria-label="Refresh messages"
											title="Refresh messages"
											disabled={websocketStatus !== "connected" || conversationUnavailable}
											onClick={() => void messages.refetch()}
										>
											<FiRefreshCw
												className="size-4 group-hover/refetch:animate-spin"
												aria-hidden="true"
											/>
										</Button>
									</div>
								</div>
								<UserDisplay user={selectedUser} size="xl" />
								{conversationUnavailable ? (
									<p role="alert" className="mt-4 text-sm text-destructive">
										This conversation is no longer available.
									</p>
								) : messages.isPending ? (
									<LoadingIndicator
										label={
											websocketStatus === "connected" ? "Loading messages" : connectionDescription
										}
									/>
								) : messages.isError ? (
									<div role="alert" className="mt-4 flex flex-wrap items-center gap-2">
										<p className="text-sm text-destructive">
											{errorMessage(messages.error, "Could not load messages from Discord.")}
										</p>
										<Button
											type="button"
											size="sm"
											variant="outline-primary"
											disabled={websocketStatus !== "connected"}
											onClick={() => void messages.refetch()}
										>
											Retry
										</Button>
									</div>
								) : (
									<>
										<nav
											aria-label="Message pagination"
											className="mt-4 flex w-full items-center justify-between gap-1 sm:justify-center"
										>
											<Button
												type="button"
												size="icon-md"
												variant="outline-secondary"
												className="h-10 w-10 sm:h-8 sm:w-8"
												aria-label="Newer messages"
												title="Newer messages"
												disabled={cursors.length === 0 || websocketStatus !== "connected"}
												onClick={() => setCursors(cursors.slice(0, -1))}
											>
												<FaChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
											</Button>
											<span aria-hidden="true" className="px-1 text-muted-foreground">
												·
											</span>
											<span className="text-center text-xs font-medium">
												<span className="text-foreground">
													{messages.data.messages.length}{" "}
													{messages.data.messages.length === 1 ? "message" : "messages"} on
													this page
												</span>
												<span className="block text-muted-foreground">
													Page {cursors.length + 1}
												</span>
											</span>
											<span aria-hidden="true" className="px-1 text-muted-foreground">
												·
											</span>
											<Button
												type="button"
												size="icon-md"
												variant="outline-secondary"
												className="h-10 w-10 sm:h-8 sm:w-8"
												aria-label="Older messages"
												title="Older messages"
												disabled={!messages.data.nextBefore || websocketStatus !== "connected"}
												onClick={() => {
													if (messages.data.nextBefore)
														setCursors([...cursors, messages.data.nextBefore]);
												}}
											>
												<FaChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
											</Button>
										</nav>
										{messages.data.messages.length === 0 ? (
											<p className="mt-4 text-sm text-muted-foreground">
												No messages in this page.
											</p>
										) : (
											<ol
												className="mt-4 max-h-120 space-y-3 overflow-y-auto pr-3"
												aria-label="Messages"
											>
												{messages.data.messages.map((message) => (
													<li
														key={message.id}
														className="rounded-md border border-border p-3"
													>
														<div className="flex flex-wrap items-center justify-between gap-2">
															<UserDisplay
																user={message.author}
																size="md"
																showId={false}
															/>
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
															<Card
																key={index}
																hoverable={false}
																className="mt-2 rounded-md border-transparent bg-muted/30 p-3 text-sm shadow-none"
															>
																<svg
																	aria-hidden="true"
																	className="pointer-events-none absolute inset-0 h-full w-full text-border"
																>
																	<rect
																		x="0.5"
																		y="0.5"
																		width="calc(100% - 1px)"
																		height="calc(100% - 1px)"
																		rx="var(--radius-md)"
																		fill="none"
																		stroke="currentColor"
																		strokeDasharray="8 4"
																	/>
																</svg>
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
															</Card>
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
								<form onSubmit={submit} className="mt-4 space-y-2 border-t border-border pt-4">
									<label htmlFor="direct-message-reply" className="block font-medium">
										{bot ? "Reply as" : "Reply"}
									</label>
									{bot && (
										<UserDisplay
											name={bot.name}
											avatarUrl={bot.avatarUrl}
											size="xs"
											showId={false}
											id={bot.id}
										/>
									)}
									<Input
										as="textarea"
										id="direct-message-reply"
										aria-label={bot ? `Reply as ${bot.name}` : "Reply"}
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
											className="gap-2"
											disabled={
												!draft.trim() || send.isPending || websocketStatus !== "connected"
											}
										>
											<FiSend aria-hidden="true" />
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
