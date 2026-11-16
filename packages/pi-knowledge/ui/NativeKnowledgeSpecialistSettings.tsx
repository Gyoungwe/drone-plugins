import type {
	KnowledgeSpecialistMode,
	KnowledgeSpecialistSettings,
	PluginUiRuntimeClient,
} from "@gyoungwe/plugin-api/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useKnowledgeText } from "./knowledge/copy";
import { useNativeKnowledgeText } from "./native-copy";

type SpecialistPreferences = KnowledgeSpecialistSettings & {
	bindingRevision: number | null;
	canWriteState: boolean;
};
interface SettingsProps {
	client: PluginUiRuntimeClient;
	observationRevision: number;
	refreshing: boolean;
}
interface SettingsState {
	value: SpecialistPreferences | null;
	loading: boolean;
	saving: boolean;
	saved: boolean;
	error: string | null;
}
const initialState: SettingsState = {
	value: null,
	loading: true,
	saving: false,
	saved: false,
	error: null,
};

function useSpecialistSettings(client: PluginUiRuntimeClient, observationRevision: number) {
	const [state, setState] = useState(initialState);
	const epoch = useRef(0);
	const read = useCallback(
		async (request: number) => {
			await client.invoke("specialistSettings", null).then(
				(result) => {
					if (request !== epoch.current) return;
					setState((current) => ({ ...current, value: result as SpecialistPreferences, loading: false }));
				},
				(cause) => {
					if (request !== epoch.current) return;
					setState((current) => ({
						...current,
						error: cause instanceof Error ? cause.message : String(cause),
						loading: false,
					}));
				},
			);
		},
		[client],
	);
	useEffect(() => {
		const request = ++epoch.current;
		setState(initialState);
		void read(request);
		return () => {
			++epoch.current;
		};
	}, [read, observationRevision]);
	return { ...state, setState, epoch, read };
}

async function changeMode(
	client: PluginUiRuntimeClient,
	settings: ReturnType<typeof useSpecialistSettings>,
	mode: KnowledgeSpecialistMode,
	refreshing: boolean,
) {
	const { value, loading, saving, epoch, setState } = settings;
	if (!value?.canWriteState || value.bindingRevision === null || loading || saving || refreshing) return;
	const request = ++epoch.current;
	setState((current) => ({ ...current, saving: true, saved: false, error: null }));
	await client
		.invoke("setSpecialistSettings", {
			mode,
			revision: value.revision,
			bindingRevision: value.bindingRevision,
		})
		.then(
			(result) => {
				if (request !== epoch.current) return;
				setState((current) => ({
					...current,
					value: result as SpecialistPreferences,
					saving: false,
					saved: true,
				}));
			},
			async (cause) => {
				if (request !== epoch.current) return;
				setState((current) => ({
					...current,
					value: null,
					loading: true,
					saving: false,
					error: cause instanceof Error ? cause.message : String(cause),
				}));
				await settings.read(request);
			},
		);
}

function SpecialistStatus({ settings }: { settings: ReturnType<typeof useSpecialistSettings> }) {
	const native = useNativeKnowledgeText();
	return (
		<>
			{(settings.loading || settings.saving || settings.saved) && (
				<p role="status" className="mt-3 text-sm text-ink-dim">
					{settings.saving ? native.saving : settings.loading ? native.loading : native.persistedMode}
				</p>
			)}
			{settings.error && (
				<p role="alert" className="mt-3 text-sm text-err">
					{settings.error}
				</p>
			)}
		</>
	);
}

export function NativeKnowledgeSpecialistSettings({
	client,
	observationRevision,
	refreshing,
}: SettingsProps) {
	const t = useKnowledgeText();
	const settings = useSpecialistSettings(client, observationRevision);
	const { value, loading, saving } = settings;
	return (
		<section
			className="rounded-xl border border-border bg-surface p-4"
			aria-label={t("specialists")}
			data-testid="native-knowledge-specialist-settings"
		>
			<h3 className="text-sm font-medium">{t("specialists")}</h3>
			<SpecialistStatus settings={settings} />
			{value && (
				<label className="mt-3 block text-xs">
					{t("specialistMode")}
					<select
						aria-label={t("specialistMode")}
						value={value.mode}
						onChange={(event) =>
							void changeMode(client, settings, event.target.value as KnowledgeSpecialistMode, refreshing)
						}
						disabled={
							loading || saving || refreshing || !value.canWriteState || value.bindingRevision === null
						}
						className="ml-2 rounded-lg border border-border bg-surface px-3 py-2"
					>
						<option value="automatic">{t("specialistAuto")}</option>
						<option value="manual">{t("specialistManual")}</option>
						<option value="off">{t("specialistOff")}</option>
					</select>
				</label>
			)}
			<p className="mt-3 text-xs text-ink-dim">{t("specialistCost")}</p>
			{value && !value.canWriteState && <p className="mt-3 text-xs text-warn">{t("specialistDenied")}</p>}
		</section>
	);
}
