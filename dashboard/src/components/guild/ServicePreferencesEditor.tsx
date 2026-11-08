import { Button, Card, Input, LabelField, Select, Switch } from "@febkosq8/arc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { useState, type ReactNode, type SubmitEvent } from "react";
import { toast } from "sonner";

import APIHandler, {
	type AdminGuildChannel,
	type ServicePreferencesEditorGuild,
	type GuildRole,
	type PreferenceEntity,
} from "@jappan/handlers/APIHandler";

const textChannelTypes = ["GuildText", "GuildAnnouncement"];

function getErrorMessage(error: unknown): string {
	if (axios.isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}
	return "Could not save preferences. Please try again.";
}

function channelOptions(channels: AdminGuildChannel[] | undefined, current: PreferenceEntity | null) {
	const options = (channels ?? [])
		.filter((channel) => textChannelTypes.includes(channel.typeName))
		.map((channel) => ({
			key: channel.id,
			label: `#${channel.name} (${channel.id}) | ${channel.parent?.name ?? "No Category"}`,
		}));
	if (current && !options.some((option) => option.key === current.id)) {
		options.unshift({ key: current.id, label: `${current.name ?? "unavailable"} (${current.id})` });
	}
	return [{ key: "", label: "None" }, ...options];
}

function roleOptions(roles: GuildRole[] | undefined, current: PreferenceEntity | null) {
	const options = (roles ?? [])
		.filter((role) => role.assignable)
		.map((role) => ({ key: role.id, label: `${role.name} (${role.id})` }));
	if (current && !options.some((option) => option.key === current.id)) {
		options.unshift({ key: current.id, label: `${current.name ?? "unavailable"} (${current.id})` });
	}
	return [{ key: "", label: "None" }, ...options];
}

function ToggleField({
	label,
	checked,
	onChange,
	disabled,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled: boolean;
}) {
	return (
		<label className="flex items-center gap-3">
			<Switch checked={checked} onChange={onChange} disabled={disabled} />
			<span className="font-medium">{label}</span>
		</label>
	);
}

function SelectField({
	id,
	label,
	value,
	onChange,
	data,
	disabled,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	data: { key: string; label: string }[];
	disabled: boolean;
}) {
	return (
		<div>
			<LabelField id={id} label={label} className="mb-1" />
			<Select id={id} value={value} onChange={onChange} data={data} disabled={disabled} className="h-10" />
		</div>
	);
}

function NumberField({
	id,
	label,
	value,
	onChange,
	min,
	max,
	disabled,
	placeholder,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
	min: number;
	max: number;
	disabled: boolean;
	placeholder?: string;
}) {
	return (
		<div>
			<LabelField id={id} label={label} className="mb-1" />
			<Input
				id={id}
				type="number"
				inputMode="numeric"
				min={min}
				max={max}
				step={1}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				disabled={disabled}
				placeholder={placeholder ?? "Not configured"}
				className="w-full"
			/>
		</div>
	);
}

function toNumberOrNull(value: string): number | null {
	return value.trim() === "" ? null : Number(value);
}

function PreferenceForm({
	id,
	title,
	description,
	pending,
	disabled,
	onSubmit,
	children,
}: {
	id: string;
	title: string;
	description: string;
	pending: boolean;
	disabled: boolean;
	onSubmit: () => void;
	children: ReactNode;
}) {
	function submit(event: SubmitEvent<HTMLFormElement>) {
		event.preventDefault();
		onSubmit();
	}
	return (
		<Card hoverable={false} role="region" aria-labelledby={id} className="min-w-0 rounded-md border-border p-3">
			<form onSubmit={submit} className="space-y-3">
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3 id={id} className="font-semibold">
							{title}
						</h3>
						<p className="text-sm text-muted-foreground">{description}</p>
					</div>
					<Button
						type="submit"
						size="sm"
						variant="outline-primary"
						className="shrink-0"
						disabled={pending || disabled}
					>
						{pending ? "Saving..." : "Save"}
					</Button>
				</div>
				{children}
			</form>
		</Card>
	);
}

interface SectionProps {
	guild: ServicePreferencesEditorGuild;
	channels: AdminGuildChannel[] | undefined;
	roles: GuildRole[] | undefined;
	readOnly: boolean;
	onSaved: () => Promise<void>;
}

function useSave<Input>(save: (input: Input) => Promise<void>, label: string, onSaved: SectionProps["onSaved"]) {
	return useMutation<void, Error, Input>({
		mutationFn: (input) => {
			const promise = (async () => {
				await save(input);
				await onSaved();
			})();
			toast.promise(promise, {
				loading: `Saving ${label.toLowerCase()} preferences...`,
				success: `${label} preferences saved.`,
				error: (error) => getErrorMessage(error),
			});
			return promise;
		},
	});
}

function AuditLogSection({ guild, channels, readOnly, onSaved }: SectionProps) {
	const { auditLog } = guild.servicePreferences;
	const [enabled, setEnabled] = useState(auditLog.enabled);
	const [channelId, setChannelId] = useState(auditLog.channel?.id ?? "");
	const [fullVerbosity, setFullVerbosity] = useState(auditLog.fullVerbosity);
	const mutation = useSave(
		(input: { enabled: boolean; channelId: string | null; fullVerbosity: boolean }) =>
			APIHandler.updateAuditLogPreference(guild.id, input),
		"Audit log",
		onSaved,
	);
	const disabled = readOnly || mutation.isPending;
	return (
		<PreferenceForm
			id="audit-preferences"
			title="Audit log"
			description="Post moderation and server events to a channel."
			pending={mutation.isPending}
			disabled={readOnly || (enabled && !channelId)}
			onSubmit={() =>
				mutation.mutate({ enabled, channelId: channelId || null, fullVerbosity: enabled && fullVerbosity })
			}
		>
			<ToggleField label="Enabled" checked={enabled} onChange={setEnabled} disabled={disabled} />
			<SelectField
				id="audit-channel"
				label="Channel"
				value={channelId}
				onChange={setChannelId}
				data={channelOptions(channels, auditLog.channel)}
				disabled={disabled || !enabled}
			/>
			<ToggleField
				label="Full verbosity"
				checked={enabled && fullVerbosity}
				onChange={setFullVerbosity}
				disabled={disabled || !enabled}
			/>
		</PreferenceForm>
	);
}

function LevelingSection({ guild, roles, readOnly, onSaved }: SectionProps) {
	const { leveling } = guild.servicePreferences;
	const [enabled, setEnabled] = useState(leveling.enabled);
	const [threshold, setThreshold] = useState(leveling.threshold?.toString() ?? "");
	const [roleId, setRoleId] = useState(leveling.role?.id ?? "");
	const mutation = useSave(
		(input: { enabled: boolean; threshold: number | null; roleId: string | null }) =>
			APIHandler.updateLevelingPreference(guild.id, input),
		"Leveling",
		onSaved,
	);
	const disabled = readOnly || mutation.isPending;
	return (
		<PreferenceForm
			id="leveling-preferences"
			title="Leveling"
			description="Reward members with a role once they reach a level."
			pending={mutation.isPending}
			disabled={readOnly || (enabled && (threshold.trim() === "") !== (roleId === ""))}
			onSubmit={() => mutation.mutate({ enabled, threshold: toNumberOrNull(threshold), roleId: roleId || null })}
		>
			<ToggleField label="Enabled" checked={enabled} onChange={setEnabled} disabled={disabled} />
			<NumberField
				id="leveling-threshold"
				label="Level threshold"
				value={threshold}
				onChange={setThreshold}
				min={1}
				max={1000}
				disabled={disabled || !enabled}
			/>
			<SelectField
				id="leveling-role"
				label="Reward role"
				value={roleId}
				onChange={setRoleId}
				data={roleOptions(roles, leveling.role)}
				disabled={disabled || !enabled}
			/>
		</PreferenceForm>
	);
}

function MemberAnnouncementsSection({ guild, channels, readOnly, onSaved }: SectionProps) {
	const { memberAnnouncements } = guild.servicePreferences;
	const [joinEnabled, setJoinEnabled] = useState(memberAnnouncements.joinEnabled);
	const [joinChannelId, setJoinChannelId] = useState(memberAnnouncements.joinChannel?.id ?? "");
	const [leaveEnabled, setLeaveEnabled] = useState(memberAnnouncements.leaveEnabled);
	const [leaveChannelId, setLeaveChannelId] = useState(memberAnnouncements.leaveChannel?.id ?? "");
	const mutation = useSave(
		(input: {
			joinEnabled: boolean;
			joinChannelId: string | null;
			leaveEnabled: boolean;
			leaveChannelId: string | null;
		}) => APIHandler.updateMemberAnnouncementsPreference(guild.id, input),
		"Member announcement",
		onSaved,
	);
	const disabled = readOnly || mutation.isPending;
	return (
		<PreferenceForm
			id="announcement-preferences"
			title="Member announcements"
			description="Announce members joining and leaving."
			pending={mutation.isPending}
			disabled={readOnly || (joinEnabled && !joinChannelId) || (leaveEnabled && !leaveChannelId)}
			onSubmit={() =>
				mutation.mutate({
					joinEnabled,
					joinChannelId: joinChannelId || null,
					leaveEnabled,
					leaveChannelId: leaveChannelId || null,
				})
			}
		>
			<ToggleField
				label="Join announcements"
				checked={joinEnabled}
				onChange={setJoinEnabled}
				disabled={disabled}
			/>
			<SelectField
				id="announcement-join-channel"
				label="Join channel"
				value={joinChannelId}
				onChange={setJoinChannelId}
				data={channelOptions(channels, memberAnnouncements.joinChannel)}
				disabled={disabled || !joinEnabled}
			/>
			<ToggleField
				label="Leave announcements"
				checked={leaveEnabled}
				onChange={setLeaveEnabled}
				disabled={disabled}
			/>
			<SelectField
				id="announcement-leave-channel"
				label="Leave channel"
				value={leaveChannelId}
				onChange={setLeaveChannelId}
				data={channelOptions(channels, memberAnnouncements.leaveChannel)}
				disabled={disabled || !leaveEnabled}
			/>
		</PreferenceForm>
	);
}

function WarningsSection({ guild, channels, readOnly, onSaved }: SectionProps) {
	const { warnings } = guild.servicePreferences;
	const [timeoutThreshold, setTimeoutThreshold] = useState(warnings.timeoutThreshold?.toString() ?? "");
	const [timeoutDuration, setTimeoutDuration] = useState(warnings.timeoutDurationHours?.toString() ?? "");
	const [banThreshold, setBanThreshold] = useState(warnings.banThreshold?.toString() ?? "");
	const [auditChannelId, setAuditChannelId] = useState(warnings.auditChannel?.id ?? "");
	const mutation = useSave(
		(input: {
			timeoutThreshold: number | null;
			timeoutDurationHours: number | null;
			banThreshold: number | null;
			auditChannelId: string | null;
		}) => APIHandler.updateWarningsPreference(guild.id, input),
		"Warning",
		onSaved,
	);
	const disabled = readOnly || mutation.isPending;
	const hasTimeout = timeoutThreshold.trim() !== "";
	return (
		<PreferenceForm
			id="warning-preferences"
			title="Warnings"
			description="Escalate repeated warnings to a timeout or ban. Leave a threshold empty to turn it off."
			pending={mutation.isPending}
			disabled={readOnly || (hasTimeout && timeoutDuration.trim() === "")}
			onSubmit={() =>
				mutation.mutate({
					timeoutThreshold: toNumberOrNull(timeoutThreshold),
					timeoutDurationHours: hasTimeout ? toNumberOrNull(timeoutDuration) : null,
					banThreshold: toNumberOrNull(banThreshold),
					auditChannelId: auditChannelId || null,
				})
			}
		>
			<NumberField
				id="warning-timeout-threshold"
				label="Timeout threshold"
				value={timeoutThreshold}
				onChange={setTimeoutThreshold}
				min={1}
				max={1000}
				disabled={disabled}
			/>
			<NumberField
				id="warning-timeout-duration"
				label="Timeout duration (hours)"
				value={timeoutDuration}
				onChange={setTimeoutDuration}
				min={1}
				max={672}
				disabled={disabled || !hasTimeout}
			/>
			<NumberField
				id="warning-ban-threshold"
				label="Ban threshold"
				value={banThreshold}
				onChange={setBanThreshold}
				min={1}
				max={1000}
				disabled={disabled}
			/>
			<SelectField
				id="warning-audit-channel"
				label="Audit channel"
				value={auditChannelId}
				onChange={setAuditChannelId}
				data={channelOptions(channels, warnings.auditChannel)}
				disabled={disabled}
			/>
		</PreferenceForm>
	);
}

export default function ServicePreferencesEditor({ guild }: { guild: ServicePreferencesEditorGuild }) {
	const queryClient = useQueryClient();
	const channelsQuery = useQuery({
		queryKey: ["user", "guild", guild.id, "channels"],
		queryFn: () => APIHandler.getGuildChannels(guild.id),
		enabled: guild.isActiveMember,
		retry: false,
	});
	const rolesQuery = useQuery({
		queryKey: ["user", "guild", guild.id, "roles"],
		queryFn: () => APIHandler.getGuildRoles(guild.id),
		enabled: guild.isActiveMember,
		retry: false,
	});
	const handleSaved = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: ["user", "guild", guild.id], exact: true }),
			queryClient.invalidateQueries({ queryKey: ["admin", "guild", guild.id], exact: true }),
		]);
	};

	const sectionProps: SectionProps = {
		guild,
		channels: channelsQuery.data,
		roles: rolesQuery.data,
		readOnly: !guild.isActiveMember,
		onSaved: handleSaved,
	};

	return (
		<Card id="service-preferences" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<h2 className="text-lg font-semibold">Service preferences</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Choose how the bot behaves in this server. Changes apply as soon as they are saved.
			</p>
			{!guild.isActiveMember && (
				<p className="mt-3 text-sm text-destructive animate-pulse">
					The bot is not a member of this guild. Current preferences are shown as read-only.
				</p>
			)}
			{guild.isActiveMember && (channelsQuery.isError || rolesQuery.isError) && (
				<p role="alert" className="mt-3 text-sm text-destructive">
					Could not load channels or roles. Current selections are still shown.
				</p>
			)}
			<fieldset
				disabled={!guild.isActiveMember || channelsQuery.isPending || rolesQuery.isPending}
				className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2"
			>
				<AuditLogSection key={JSON.stringify(guild.servicePreferences.auditLog)} {...sectionProps} />
				<LevelingSection key={JSON.stringify(guild.servicePreferences.leveling)} {...sectionProps} />
				<MemberAnnouncementsSection
					key={JSON.stringify(guild.servicePreferences.memberAnnouncements)}
					{...sectionProps}
				/>
				<WarningsSection key={JSON.stringify(guild.servicePreferences.warnings)} {...sectionProps} />
			</fieldset>
		</Card>
	);
}
