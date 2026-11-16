import { Button, Card, DateHandler, Input, Tag } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState, type SubmitEvent } from "react";
import { FiLoader, FiMessageSquare, FiSend, FiWifi, FiWifiOff } from "react-icons/fi";
import { FaAnglesDown, FaAnglesUp, FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { useSearchParams } from "react-router-dom";

import { AccessRedirect } from "@jappan/components/AuthRoute";
import CopyIdButton from "@jappan/components/display/CopyIdButton";
import UserDisplay from "@jappan/components/display/UserDisplay";
import ErrorPage from "@jappan/components/ErrorPage";
import ExternalTextLink from "@jappan/components/ExternalTextLink";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import type { AdminDirectMessageConversation } from "@jappan/handlers/APIHandler";
import type { InboxConnection } from "@jappan/handlers/useDirectMessageInbox";
import useDirectMessageWebsocket from "@jappan/handlers/useDirectMessageWebsocket";
import {
	fetchDirectMessageConversations,
	fetchDirectMessageHistory,
	getWebsocket,
	markDirectMessageRead,
	sendDirectMessage,
	WebsocketRequestError,
} from "@jappan/handlers/websocket";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";
import { toast } from "sonner";

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
	return fallback;
}

function errorStatus(error: unknown): string {
	if (error instanceof WebsocketRequestError) return String(error.status);
	return "Error";
}

function conversationSocket() {
	const socket = getWebsocket();
	if (!socket?.connected) throw new WebsocketRequestError(503, "Not connected to the conversation. Reconnecting…");
	return socket;
}

function inboxSocket() {
	const socket = getWebsocket();
	if (!socket?.connected) throw new WebsocketRequestError(503, "Not connected to the inbox. Reconnecting…");
	return socket;
}

function websocketAccessStatus(error: unknown): 401 | 403 | undefined {
	if (error instanceof WebsocketRequestError && (error.status === 401 || error.status === 403)) return error.status;
	return undefined;
}

function ReadStatus({ conversation }: { conversation: AdminDirectMessageConversation }) {
	const readerLink = conversation.lastReadBy && (
		<ExternalTextLink
			href={`https://discord.com/users/${encodeURIComponent(conversation.lastReadBy.id)}`}
			text={`@${conversation.lastReadBy.username}`}
		/>
	);

	return (
		<div className="flex min-w-0 items-start justify-between gap-2 text-sm text-muted-foreground">
			<div className="flex shrink-0 flex-col items-start gap-1">
				<span>Last read by</span>
				{conversation.unread && (
					<Tag variant="primary" size="xs">
						Unread
					</Tag>
				)}
			</div>
			<div className="flex min-w-0 flex-col items-end gap-1 text-right">
				{readerLink && conversation.lastReadAt ? (
					<>
						<span className="max-w-full wrap-anywhere">{readerLink}</span>
						<time className="max-w-full wrap-anywhere" dateTime={conversation.lastReadAt}>
							{DateHandler.getDateTime(new Date(conversation.lastReadAt).getTime())}
						</time>
					</>
				) : (
					<span>No read record</span>
				)}
			</div>
		</div>
	);
}

export default function DirectMessages({ inbox }: { inbox: InboxConnection }) {
	useDocumentTitle(formatTitle("Direct messages", "Admin"));
	const queryClient = useQueryClient();
	const [searchParams, setSearchParams] = useSearchParams();
	const [page, setPage] = useState(1);
	const [cursors, setCursors] = useState<string[]>([]);
	const [draft, setDraft] = useState("");
	const [socketAccessError, setSocketAccessError] = useState<401 | 403 | null>(null);
	const [conversationUnavailable, setConversationUnavailable] = useState(false);
	const [documentVisible, setDocumentVisible] = useState(() => document.visibilityState === "visible");
	const [bottomScrollVersion, setBottomScrollVersion] = useState(0);
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
		queryFn: () =>
			fetchDirectMessageConversations({
				socket: inboxSocket(),
				page,
				perPageLimit: CONVERSATIONS_PER_PAGE,
			}),
		enabled: inbox.status === "connected",
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: false,
		retry: false,
	});
	const selectedConversation = useQuery({
		queryKey: ["admin", "direct-messages", "conversation", selectedUserId],
		queryFn: async () => {
			if (!selectedUserId || !validUserId) throw new Error("Invalid conversation user ID");
			const result = await fetchDirectMessageConversations({
				socket: inboxSocket(),
				page: 1,
				perPageLimit: 1,
				userId: selectedUserId,
			});
			return result.items[0] ?? null;
		},
		enabled: validUserId && inbox.status === "connected",
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
		refetchOnMount: false,
		retry: false,
	});
	const selectedUser = selectedConversation.data?.user ?? null;
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
	const read = useMutation({
		mutationFn: ({ userId, messageId }: { userId: string; messageId: string | null; selectionVersion: number }) =>
			markDirectMessageRead({ socket: conversationSocket(), userId, messageId }),
		onError: (_error, { userId, selectionVersion }) => {
			if (currentUserIdRef.current !== userId || selectionVersionRef.current !== selectionVersion) {
				toast.error("Could not mark the previous conversation as read.");
			}
		},
	});
	const resetSend = send.reset;
	const resetRead = read.reset;
	useLayoutEffect(() => {
		currentUserIdRef.current = selectedUserId;
		selectionVersionRef.current++;
		scrollOnOpenRef.current = selectedUserId !== null;
		setCursors([]);
		setDraft("");
		setConversationUnavailable(false);
		resetSend();
		resetRead();
	}, [selectedUserId, resetSend, resetRead]);

	useEffect(() => {
		const onVisibilityChange = () => setDocumentVisible(document.visibilityState === "visible");
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () => document.removeEventListener("visibilitychange", onVisibilityChange);
	}, []);

	const markRead = read.mutate;
	useEffect(() => {
		if (
			!documentVisible ||
			!selectedUser ||
			before ||
			websocketStatus !== "connected" ||
			conversationUnavailable ||
			!messages.isSuccess ||
			messages.isFetching
		)
			return;
		const page = messages.data;
		const list = messagesListRef.current;
		if (
			page &&
			(page.messages.length === 0 || (list && list.scrollHeight - list.scrollTop - list.clientHeight <= 2))
		) {
			markRead({
				userId: selectedUser.id,
				messageId: page.lastReceivedMessageId,
				selectionVersion: selectionVersionRef.current,
			});
		}
	}, [
		before,
		bottomScrollVersion,
		conversationUnavailable,
		documentVisible,
		markRead,
		messages.data,
		messages.dataUpdatedAt,
		messages.isFetching,
		messages.isSuccess,
		selectedUser,
		websocketStatus,
	]);

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
		(inbox.status === "error" ? websocketAccessStatus(inbox.error) : undefined) ??
		backgroundSendErrors.map(({ error }) => websocketAccessStatus(error)).find((status) => status !== undefined) ??
		websocketAccessStatus(conversations.error) ??
		websocketAccessStatus(selectedConversation.error) ??
		websocketAccessStatus(messages.error) ??
		websocketAccessStatus(send.error) ??
		websocketAccessStatus(read.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	const connectionDescription = conversationUnavailable
		? "This conversation is no longer available."
		: websocketStatus === "connected"
			? "Live conversation connected."
			: websocketStatus === "connecting"
				? "Connecting to the live conversation…"
				: "Live conversation disconnected. Reconnecting…";
	const liveStatus =
		inbox.status === "error"
			? "unavailable"
			: inbox.status === "connecting"
				? "connecting"
				: !selectedUser
					? "connected"
					: conversationUnavailable
						? "unavailable"
						: websocketStatus;
	const liveDescription =
		inbox.status === "error"
			? "Inbox updates are unavailable."
			: inbox.status === "connecting"
				? "Connecting to inbox updates…"
				: selectedUser
					? connectionDescription
					: "Live inbox connected.";
	const replyDisabled = send.isPending || websocketStatus !== "connected" || conversationUnavailable;

	function selectUser(conversation: AdminDirectMessageConversation) {
		const { user } = conversation;
		queryClient.setQueryData(["admin", "direct-messages", "conversation", user.id], conversation);
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
		if (!selectedUser || !draft.trim() || replyDisabled) return;
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
			<div className="mt-6 grid gap-4 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:grid-cols-[minmax(0,24rem)_minmax(0,1fr)]">
				<Card hoverable={false} className="flex min-w-0 flex-col rounded-md border-border p-5 sm:p-6">
					<Card.Content className="flex flex-1 flex-col justify-start p-0!">
						<div className="flex flex-wrap items-center justify-between gap-3">
							<h2 className="flex items-center gap-2 text-xl font-semibold">
								<FiMessageSquare className="size-5 text-primary" aria-hidden="true" />
								Conversations
							</h2>
							<Tag
								role="status"
								variant={
									liveStatus === "unavailable"
										? "destructive"
										: liveStatus === "connected"
											? "success"
											: liveStatus === "connecting"
												? "secondary"
												: "warning"
								}
								size="xs"
								title={liveDescription}
								aria-label={liveDescription}
							>
								{liveStatus === "unavailable" || liveStatus === "disconnected" ? (
									<FiWifiOff className="mr-1 size-3" aria-hidden="true" />
								) : liveStatus === "connecting" ? (
									<FiLoader className="mr-1 size-3 animate-spin" aria-hidden="true" />
								) : (
									<FiWifi className="mr-1 size-3" aria-hidden="true" />
								)}
								{liveStatus === "unavailable"
									? "Unavailable"
									: liveStatus === "connected"
										? "Connected"
										: liveStatus === "connecting"
											? "Connecting"
											: "Reconnecting"}
							</Tag>
						</div>
						<p className="mt-1 text-base text-muted-foreground">
							Conversations appear when the bot receives a direct message.
						</p>
						{inbox.status === "error" ? (
							<div className="mt-4">
								<ErrorPage
									variant="inline"
									status={errorStatus(inbox.error)}
									title="Could not connect to the inbox"
									message={errorMessage(inbox.error, "Could not connect to the inbox.")}
									actions={
										<Button type="button" size="sm" variant="outline-primary" onClick={inbox.retry}>
											Retry
										</Button>
									}
								/>
							</div>
						) : inbox.status === "connecting" ? (
							<LoadingIndicator label="Connecting to the inbox" />
						) : conversations.isPending ? (
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
							<ul className="mt-4 max-h-160 space-y-3 overflow-y-auto pr-2">
								{conversations.data.items.map((conversation) => {
									const { user, lastReceivedAt } = conversation;
									return (
										<li key={user.id}>
											<Card hoverable={false} className="rounded-md border-border p-0">
												<Button
													type="button"
													variant="ghost"
													aria-label={`Open conversation with ${user.displayName ?? user.username} (@${user.username})`}
													aria-describedby={`conversation-received-${user.id} conversation-read-${user.id}`}
													aria-pressed={selectedUserId === user.id}
													disabled={send.isPending}
													onClick={() => selectUser(conversation)}
													className="peer absolute inset-0 h-full w-full border border-transparent p-0 aria-pressed:bg-accent"
												/>
												<div className="pointer-events-none relative min-w-0 p-4 peer-hover:text-primary peer-aria-pressed:text-primary [&_a]:pointer-events-auto [&_button]:pointer-events-auto [&_p]:flex-wrap [&_p>span]:min-w-0 [&_p>span]:shrink [&_p>span]:break-all">
													<UserDisplay user={user} size="xl" />
													<Card
														hoverable={false}
														className="mt-3 min-w-0 rounded-md border-border bg-muted/30 p-3 shadow-none"
													>
														<div
															id={`conversation-received-${user.id}`}
															className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground"
														>
															<span title="Last message received from this user">
																Last message
																<span className="sr-only">
																	{" "}
																	received from this user
																</span>{" "}
																at
															</span>
															<time className="ml-auto" dateTime={lastReceivedAt}>
																{DateHandler.getDateTime(
																	new Date(lastReceivedAt).getTime(),
																)}
															</time>
														</div>
													</Card>
													<Card
														hoverable={false}
														className="mt-2 min-w-0 rounded-md border-border bg-muted/30 p-3 shadow-none"
													>
														<div id={`conversation-read-${user.id}`}>
															<ReadStatus conversation={conversation} />
														</div>
													</Card>
												</div>
											</Card>
										</li>
									);
								})}
							</ul>
						)}
						<div className="mt-auto pt-4">
							<div className="border-t border-border pt-4">
								<InboxPagination
									label="Conversation pagination"
									count={
										inbox.status === "error"
											? "Count unavailable"
											: inbox.status === "connecting"
												? "Connecting…"
												: conversations.data
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
										disabled: page === 1 || inbox.status !== "connected",
										onClick: () => setPage(page - 1),
									}}
									next={{
										label: "Next",
										ariaLabel: "Next conversations",
										disabled:
											inbox.status !== "connected" ||
											!conversations.data ||
											page >= conversations.data.pagination.totalPages,
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
						) : inbox.status === "error" && !selectedConversation.data ? (
							<ErrorPage
								variant="inline"
								status={errorStatus(inbox.error)}
								title="Could not connect to the inbox"
								message={errorMessage(inbox.error, "Could not connect to the inbox.")}
								actions={
									<Button type="button" variant="outline-primary" onClick={inbox.retry}>
										Retry
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
										disabled={inbox.status !== "connected"}
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
								</div>
								<div className="flex flex-wrap items-center justify-between gap-3">
									<UserDisplay user={selectedUser} size="xl" />
									{read.isError && (
										<div className="mt-3">
											<ErrorPage
												variant="inline"
												status={errorStatus(read.error)}
												title="Could not mark conversation as read"
												message={errorMessage(
													read.error,
													"Could not mark this conversation as read.",
												)}
												actions={
													<Button
														type="button"
														variant="outline-primary"
														onClick={() => {
															if (read.variables) read.mutate(read.variables);
														}}
													>
														Retry
													</Button>
												}
											/>
										</div>
									)}
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
											<div className="flex flex-wrap items-center justify-end gap-2">
												<div className="min-w-0 flex-1 basis-56">
													<InboxPagination
														label="Message pagination"
														count={`${messages.data.messages.length} ${
															messages.data.messages.length === 1 ? "message" : "messages"
														}`}
														page={cursors.length + 1}
														previous={{
															label: "Newer",
															ariaLabel: "Newer messages",
															disabled:
																cursors.length === 0 || websocketStatus !== "connected",
															onClick: () => setCursors(cursors.slice(0, -1)),
														}}
														next={{
															label: "Older",
															ariaLabel: "Older messages",
															disabled:
																!messages.data.nextBefore ||
																websocketStatus !== "connected",
															onClick: () => {
																if (messages.data.nextBefore)
																	setCursors([...cursors, messages.data.nextBefore]);
															},
														}}
													/>
												</div>
												<div
													className="flex shrink-0 items-center gap-2"
													role="group"
													aria-label="Scroll messages"
												>
													<Button
														type="button"
														size="icon-sm"
														variant="outline-secondary"
														className="pointer-coarse:min-h-10 pointer-coarse:min-w-10"
														aria-label="Scroll to top of current message page"
														title="Scroll to top of current message page"
														disabled={messages.data.messages.length === 0}
														onClick={() => {
															if (messagesListRef.current)
																messagesListRef.current.scrollTop = 0;
														}}
													>
														<FaAnglesUp aria-hidden="true" />
													</Button>
													<Button
														type="button"
														size="icon-sm"
														variant="outline-secondary"
														className="pointer-coarse:min-h-10 pointer-coarse:min-w-10"
														aria-label="Scroll to bottom of current message page"
														title="Scroll to bottom of current message page"
														disabled={messages.data.messages.length === 0}
														onClick={() => {
															const list = messagesListRef.current;
															if (list) list.scrollTop = list.scrollHeight;
														}}
													>
														<FaAnglesDown aria-hidden="true" />
													</Button>
												</div>
											</div>
											{messages.data.messages.length === 0 ? (
												<p className="mt-4 text-sm text-muted-foreground">
													No messages in this page.
												</p>
											) : (
												<ol
													ref={messagesListRef}
													className="mt-4 max-h-120 space-y-3 overflow-y-auto pr-3"
													aria-label="Messages"
													onScroll={(event) => {
														const list = event.currentTarget;
														if (list.scrollHeight - list.scrollTop - list.clientHeight <= 2)
															setBottomScrollVersion((version) => version + 1);
													}}
												>
													{messages.data.messages.map((message) => (
														<li
															key={message.id}
															className={`rounded-md border p-3 ${
																message.author.id === bot?.id
																	? "border-success/70"
																	: "border-warning/80"
															}`}
														>
															<div className="flex flex-wrap items-center justify-between gap-2">
																<UserDisplay
																	user={message.author}
																	size="md"
																	showId={false}
																/>
																<div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
																	<span className="min-w-0 break-all">
																		Message ID: {message.id}
																	</span>
																	<CopyIdButton id={message.id} label="Message ID" />
																</div>
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
										disabled={replyDisabled}
										onChange={(event) => setDraft(event.target.value)}
									/>
									<div className="flex items-center justify-between gap-2">
										<span className="text-xs text-muted-foreground">{draft.length}/2000</span>
										<Button
											type="submit"
											className="gap-2"
											disabled={!draft.trim() || replyDisabled}
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
