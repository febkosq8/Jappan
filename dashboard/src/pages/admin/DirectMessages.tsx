import { Button, Card, DateHandler, Input, Tag } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useLayoutEffect, useRef, useState, type SubmitEvent } from "react";
import { FiLoader, FiMessageSquare, FiRefreshCw, FiSend, FiWifi, FiWifiOff } from "react-icons/fi";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { useSearchParams } from "react-router-dom";

import { AccessRedirect, accessErrorStatus } from "@jappan/components/AuthRoute";
import UserDisplay from "@jappan/components/display/UserDisplay";
import ErrorPage from "@jappan/components/ErrorPage";
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

type PaginationAction = {
	label: string;
	ariaLabel: string;
	disabled: boolean;
	onClick: () => void;
};

function InboxPagination({
	label,
	count,
	page,
	previous,
	next,
}: {
	label: string;
	count: string;
	page: number;
	previous: PaginationAction;
	next: PaginationAction;
}) {
	return (
		<nav aria-label={label} className="flex w-full flex-wrap items-center justify-center gap-1">
			<Button
				type="button"
				size="sm"
				variant="outline-secondary"
				className="h-10 gap-1 px-1.5 sm:h-8 sm:px-2"
				aria-label={previous.ariaLabel}
				title={previous.ariaLabel}
				disabled={previous.disabled}
				onClick={previous.onClick}
			>
				<FaChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
				{previous.label}
			</Button>
			<span aria-hidden="true" className="px-1 text-muted-foreground">
				·
			</span>
			<span className="text-center text-xs font-medium">
				<span className="text-foreground">{count}</span>
				<span className="block text-muted-foreground">Page {page}</span>
			</span>
			<span aria-hidden="true" className="px-1 text-muted-foreground">
				·
			</span>
			<Button
				type="button"
				size="sm"
				variant="outline-secondary"
				className="h-10 gap-1 px-1.5 sm:h-8 sm:px-2"
				aria-label={next.ariaLabel}
				title={next.ariaLabel}
				disabled={next.disabled}
				onClick={next.onClick}
			>
				{next.label}
				<FaChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
			</Button>
		</nav>
	);
}

function errorMessage(error: unknown, fallback: string): string {
	if (error instanceof WebsocketRequestError) return error.message;
	if (axios.isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}
	return fallback;
}

function errorStatus(error: unknown): string {
	if (error instanceof WebsocketRequestError) return String(error.status);
	if (axios.isAxiosError(error) && error.response?.status) return String(error.response.status);
	return "Error";
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
	const [searchParams, setSearchParams] = useSearchParams();
	const [page, setPage] = useState(1);
	const [cursors, setCursors] = useState<string[]>([]);
	const [draft, setDraft] = useState("");
	const [socketAccessError, setSocketAccessError] = useState<401 | 403 | null>(null);
	const [conversationUnavailable, setConversationUnavailable] = useState(false);
	const [backgroundSendErrors, setBackgroundSendErrors] = useState<
		{ userId: string; content: string; error: unknown }[]
	>([]);
	const messagesListRef = useRef<HTMLOListElement>(null);
	const scrollOnOpenRef = useRef(false);
	const selectedUserId = searchParams.get("userId");
	const validUserId = selectedUserId !== null && /^\d{17,20}$/u.test(selectedUserId);
	const currentUserIdRef = useRef(selectedUserId);
	const selectionVersionRef = useRef(0);
	const before = cursors[cursors.length - 1];
	const conversationKey = ["admin", "direct-messages", "conversations", page];
	const conversations = useQuery({
		queryKey: conversationKey,
		queryFn: () => APIHandler.getAdminDirectMessageConversations({ page, perPageLimit: CONVERSATIONS_PER_PAGE }),
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: false,
		retry: false,
	});
	const selectedConversation = useQuery({
		queryKey: ["admin", "direct-messages", "conversation", selectedUserId],
		queryFn: async () => {
			if (!selectedUserId || !validUserId) throw new Error("Invalid conversation user ID");
			const result = await APIHandler.getAdminDirectMessageConversations({
				page: 1,
				perPageLimit: 1,
				userId: selectedUserId,
			});
			return result.items[0]?.user ?? null;
		},
		enabled: validUserId,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: false,
		retry: false,
	});
	const selectedUser = selectedConversation.data ?? null;
	const messageKey = ["admin", "direct-messages", "messages", selectedUser?.id, before];
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
		mutationFn: ({ userId, content }: { userId: string; content: string; selectionVersion: number }) =>
			sendDirectMessage({ socket: conversationSocket(), userId, content }),
		onSuccess: async (_message, { userId, selectionVersion }) => {
			if (currentUserIdRef.current === userId && selectionVersionRef.current === selectionVersion) {
				setDraft("");
				setCursors([]);
			}
			await queryClient.invalidateQueries({
				queryKey: ["admin", "direct-messages", "messages", userId, undefined],
				exact: true,
				refetchType: "all",
			});
		},
		onError: (error, { userId, content, selectionVersion }) => {
			if (currentUserIdRef.current !== userId || selectionVersionRef.current !== selectionVersion) {
				setBackgroundSendErrors((previous) => [...previous, { userId, content, error }]);
			}
		},
	});
	const resetSend = send.reset;
	useLayoutEffect(() => {
		currentUserIdRef.current = selectedUserId;
		selectionVersionRef.current++;
		scrollOnOpenRef.current = selectedUserId !== null;
		setCursors([]);
		setDraft("");
		setConversationUnavailable(false);
		resetSend();
	}, [selectedUserId, resetSend]);

	useLayoutEffect(() => {
		if (
			!scrollOnOpenRef.current ||
			cursors.length !== 0 ||
			websocketStatus !== "connected" ||
			!messages.isSuccess ||
			messages.isFetching
		)
			return;
		const list = messagesListRef.current;
		if (list) list.scrollTop = list.scrollHeight;
		scrollOnOpenRef.current = false;
	}, [cursors.length, websocketStatus, messages.isSuccess, messages.isFetching, messages.data]);

	const accessStatus =
		socketAccessError ??
		backgroundSendErrors.map(({ error }) => websocketAccessStatus(error)).find((status) => status !== undefined) ??
		accessErrorStatus(conversations.error) ??
		accessErrorStatus(selectedConversation.error) ??
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
		queryClient.setQueryData(["admin", "direct-messages", "conversation", user.id], user);
		if (selectedUserId === user.id) {
			scrollOnOpenRef.current = true;
			setCursors([]);
			setDraft("");
			setConversationUnavailable(false);
			resetSend();
			return;
		}
		setSearchParams((current) => {
			const next = new URLSearchParams(current);
			next.set("userId", user.id);
			return next;
		});
	}

	function clearSelection() {
		setSearchParams((current) => {
			const next = new URLSearchParams(current);
			next.delete("userId");
			return next;
		});
	}

	function submit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!selectedUser || !draft.trim() || send.isPending || websocketStatus !== "connected") return;
		send.mutate({ userId: selectedUser.id, content: draft, selectionVersion: selectionVersionRef.current });
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
				<Card hoverable={false} className="flex min-w-0 flex-col rounded-md border-border p-5 sm:p-6">
					<Card.Content className="flex flex-1 flex-col justify-start p-0!">
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
							<div className="mt-4">
								<ErrorPage
									variant="inline"
									status={errorStatus(conversations.error)}
									title="Could not load conversations"
									message={errorMessage(conversations.error, "Could not load conversations.")}
									actions={
										<Button
											type="button"
											size="sm"
											variant="outline-primary"
											onClick={() => void conversations.refetch()}
										>
											Retry
										</Button>
									}
								/>
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
												aria-pressed={selectedUserId === user.id}
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
						<div className="mt-auto pt-4">
							<div className="border-t border-border pt-4">
								<InboxPagination
									label="Conversation pagination"
									count={
										conversations.data
											? `${conversations.data.pagination.total} ${
													conversations.data.pagination.total === 1
														? "conversation"
														: "conversations"
												}`
											: conversations.isPending
												? "Loading…"
												: "Count unavailable"
									}
									page={page}
									previous={{
										label: "Previous",
										ariaLabel: "Previous conversations",
										disabled: page === 1,
										onClick: () => setPage(page - 1),
									}}
									next={{
										label: "Next",
										ariaLabel: "Next conversations",
										disabled:
											!conversations.data || page >= conversations.data.pagination.totalPages,
										onClick: () => setPage(page + 1),
									}}
								/>
							</div>
						</div>
					</Card.Content>
				</Card>
				<Card hoverable={false} className="min-w-0 rounded-md border-border p-5 sm:p-6">
					<Card.Content className="p-0!">
						{backgroundSendErrors.map(({ userId, content, error }, index) => (
							<div key={index} className="mb-4">
								<ErrorPage
									variant="inline"
									status={errorStatus(error)}
									title="Could not send message"
									message={
										<>
											<p>Conversation user: {userId}</p>
											<p>{errorMessage(error, "Could not send the message.")}</p>
											<p className="mt-2 whitespace-pre-wrap break-all">{content}</p>
										</>
									}
									actions={
										<Button
											type="button"
											variant="outline-primary"
											onClick={() =>
												setBackgroundSendErrors((previous) =>
													previous.filter((_, errorIndex) => errorIndex !== index),
												)
											}
										>
											Dismiss
										</Button>
									}
								/>
							</div>
						))}
						{selectedUserId === null ? (
							<div className="flex min-h-48 flex-col items-center justify-center text-center">
								<span className="flex size-10 items-center justify-center rounded-md bg-primary/10 text-primary">
									<FiMessageSquare className="size-5" aria-hidden="true" />
								</span>
								<h2 className="mt-3 text-lg font-semibold">Select a conversation</h2>
								<p className="mt-1 text-sm text-muted-foreground">
									Choose a conversation to read messages and reply as the bot.
								</p>
							</div>
						) : !validUserId ? (
							<ErrorPage
								variant="inline"
								status="400"
								title="Invalid conversation"
								message="The conversation user ID in this link is invalid."
								actions={
									<Button type="button" variant="outline-primary" onClick={clearSelection}>
										Clear selection
									</Button>
								}
							/>
						) : selectedConversation.isPending ? (
							<LoadingIndicator label="Loading conversation" />
						) : selectedConversation.isError ? (
							<ErrorPage
								variant="inline"
								status={errorStatus(selectedConversation.error)}
								title="Could not load conversation"
								message={errorMessage(selectedConversation.error, "Could not load the conversation.")}
								actions={
									<Button
										type="button"
										variant="outline-primary"
										onClick={() => void selectedConversation.refetch()}
									>
										Retry
									</Button>
								}
							/>
						) : !selectedUser ? (
							<ErrorPage
								variant="inline"
								status="404"
								title="Conversation unavailable"
								message="This conversation is no longer available."
								actions={
									<>
										<Button
											type="button"
											variant="outline-primary"
											onClick={() => void selectedConversation.refetch()}
										>
											Retry
										</Button>
										<Button type="button" variant="outline-secondary" onClick={clearSelection}>
											Clear selection
										</Button>
									</>
								}
							/>
						) : (
							<>
								<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
									<h2 className="flex items-center gap-2 text-lg font-semibold">
										<FiMessageSquare className="size-5 text-primary" aria-hidden="true" />
										Conversation
									</h2>
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
								<div className="flex flex-wrap items-center justify-between gap-3">
									<UserDisplay user={selectedUser} size="xl" />
									<div className="ml-auto flex shrink-0 items-center gap-2">
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
									</div>
								</div>
								<Card hoverable={false} className="mt-4 min-w-0 rounded-md border-border p-3">
									{conversationUnavailable ? (
										<ErrorPage
											variant="inline"
											status="404"
											title="Conversation unavailable"
											message="This conversation is no longer available."
										/>
									) : messages.isPending ? (
										<LoadingIndicator
											label={
												websocketStatus === "connected"
													? "Loading messages"
													: connectionDescription
											}
										/>
									) : messages.isError ? (
										<ErrorPage
											variant="inline"
											status={errorStatus(messages.error)}
											title="Could not load messages"
											message={errorMessage(
												messages.error,
												"Could not load messages from Discord.",
											)}
											actions={
												<Button
													type="button"
													size="sm"
													variant="outline-primary"
													disabled={websocketStatus !== "connected"}
													onClick={() => void messages.refetch()}
												>
													Retry
												</Button>
											}
										/>
									) : (
										<>
											<InboxPagination
												label="Message pagination"
												count={`${messages.data.messages.length} ${
													messages.data.messages.length === 1 ? "message" : "messages"
												}`}
												page={cursors.length + 1}
												previous={{
													label: "Newer",
													ariaLabel: "Newer messages",
													disabled: cursors.length === 0 || websocketStatus !== "connected",
													onClick: () => setCursors(cursors.slice(0, -1)),
												}}
												next={{
													label: "Older",
													ariaLabel: "Older messages",
													disabled:
														!messages.data.nextBefore || websocketStatus !== "connected",
													onClick: () => {
														if (messages.data.nextBefore)
															setCursors([...cursors, messages.data.nextBefore]);
													},
												}}
											/>
											{messages.data.messages.length === 0 ? (
												<p className="mt-4 text-sm text-muted-foreground">
													No messages in this page.
												</p>
											) : (
												<ol
													ref={messagesListRef}
													className="mt-4 max-h-120 space-y-3 overflow-y-auto pr-3"
													aria-label="Messages"
												>
													{messages.data.messages.map((message) => (
														<li
															key={message.id}
															className={`rounded-md border p-3 ${
																message.author.id === bot?.id
																	? "border-primary/60"
																	: "border-border"
															}`}
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
																	{DateHandler.getDateTime(
																		message.createdTimestampMs,
																	)}
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
																<p
																	key={attachment.url}
																	className="mt-1 break-all text-sm"
																>
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
								</Card>
								<form onSubmit={submit} className="mt-4 space-y-2 border-t border-border pt-4">
									<div className="flex flex-wrap items-center gap-2">
										<label htmlFor="direct-message-reply" className="font-medium">
											{bot || !conversationUnavailable ? "Replying as" : "Reply"}
										</label>
										{bot ? (
											<UserDisplay
												name={bot.name}
												avatarUrl={bot.avatarUrl}
												size="xs"
												showId={false}
												id={bot.id}
											/>
										) : !conversationUnavailable ? (
											<LoadingIndicator
												label="Loading bot identity"
												inline
												size={80}
												columns={5}
												rows={1}
											/>
										) : null}
									</div>
									<Input
										as="textarea"
										id="direct-message-reply"
										aria-label={bot ? `Replying as ${bot.name}` : "Reply"}
										placeholder="Write the message to send"
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
										<ErrorPage
											variant="inline"
											status={errorStatus(send.error)}
											title="Could not send message"
											message={errorMessage(
												send.error,
												"Could not send the message. Please try again.",
											)}
										/>
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
