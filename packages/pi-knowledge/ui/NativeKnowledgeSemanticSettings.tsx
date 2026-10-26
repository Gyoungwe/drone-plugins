import type { PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import type { KnowledgeSemanticPreferences } from "../src/desktop/contract";
import { useEffect, useRef, useState } from "react";
import { Button } from "./runtime-api";
import { useNativeKnowledgeText } from "./native-copy";

type SemanticSettings = NonNullable<KnowledgeSemanticPreferences["settings"]>;
type Provider = SemanticSettings["provider"];

function errorText(cause: unknown) {
	return cause instanceof Error ? cause.message : String(cause);
}

/** Semantic settings use the runtime's state broker; this component never owns a path or file handle. */
export function NativeKnowledgeSemanticSettings({
	client,
	observationRevision,
	refreshing,
}: {
	client: PluginUiRuntimeClient;
	observationRevision: number;
	refreshing: boolean;
}) {
	const t = useNativeKnowledgeText();
	const [value, setValue] = useState<KnowledgeSemanticPreferences | null>(null);
	const [provider, setProvider] = useState<Provider>("none");
	const [enabled, setEnabled] = useState(false);
	const [baseUrl, setBaseUrl] = useState("");
	const [model, setModel] = useState("");
	const [loading, setLoading] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);
	const epoch = useRef(0);

	useEffect(() => {
		const request = ++epoch.current;
		setLoading(true);
		setSaving(false);
		setSaved(false);
		setError(null);
		setValue(null);
		void client.invoke("semanticSettings", null).then(
			(result) => {
				if (request !== epoch.current) return;
				const settings = result as KnowledgeSemanticPreferences;
				setValue(settings);
				if (settings.settings) {
					setProvider(settings.settings.provider);
					setEnabled(settings.settings.enabled);
					setBaseUrl(settings.settings.baseUrl);
					setModel(settings.settings.model);
				}
			},
			(cause) => {
				if (request === epoch.current) setError(errorText(cause));
			},
		).finally(() => {
			if (request === epoch.current) setLoading(false);
		});
		return () => {
			++epoch.current;
		};
	}, [client, observationRevision]);

	async function save(snapshot: SemanticSettings, bindingRevision: number) {
		const request = ++epoch.current;
		setSaving(true);
		setSaved(false);
		setError(null);
		try {
			const result = (await client.invoke("setSemanticSettings", {
				bindingRevision,
				expectedSettingsRevision: snapshot.revision,
				settings: {
					enabled,
					provider,
					baseUrl,
					model,
					credentialEnv: snapshot.credentialEnv,
					remoteConsent: snapshot.remoteConsent,
					timeoutMs: snapshot.timeoutMs,
					chunkChars: snapshot.chunkChars,
					minSimilarity: snapshot.minSimilarity,
				},
			})) as KnowledgeSemanticPreferences;
			if (request !== epoch.current) return;
			setValue(result);
			setProvider(result.settings?.provider ?? "none");
			setEnabled(result.settings?.enabled ?? false);
			setBaseUrl(result.settings?.baseUrl ?? "");
			setModel(result.settings?.model ?? "");
			setSaved(true);
		} catch (cause) {
			if (request === epoch.current) setError(errorText(cause));
		} finally {
			if (request === epoch.current) setSaving(false);
		}
	}

	return (
		<section
			className="rounded-xl border border-border bg-surface p-4"
			aria-label={t.semanticSettings}
			data-testid="native-knowledge-semantic-settings"
		>
			<h3 className="text-sm font-medium">{t.semanticSettings}</h3>
			{loading && <p role="status" className="mt-3 text-sm text-ink-dim">{t.loading}</p>}
			{error && <p role="alert" className="mt-3 text-sm text-err">{error}</p>}
			{value?.settings && (
				<div className="mt-3 space-y-3 text-xs">
					<p className="text-ink-dim">{t.semanticSettingsHint}</p>
					<label className="flex items-center gap-2">
						<input
							type="checkbox"
							checked={enabled}
							onChange={(event) => { setEnabled(event.target.checked); setSaved(false); }}
							disabled={!value.canWriteState || saving || refreshing}
						/>
						{t.semanticEnabled}
					</label>
					<label className="block">
						<span>{t.semanticProvider}</span>
						<select
							aria-label={t.semanticProvider}
							value={provider}
							onChange={(event) => { setProvider(event.target.value as Provider); setSaved(false); }}
							disabled={!value.canWriteState || saving || refreshing}
							className="ml-2 rounded-lg border border-border bg-surface px-3 py-2"
						>
							<option value="none">{t.semanticProviderNone}</option>
							<option value="ollama">Ollama</option>
							<option value="openai-compatible">OpenAI compatible</option>
						</select>
					</label>
					{provider !== "none" && (
						<div className="grid gap-3 sm:grid-cols-2">
							<label className="block">
								<span>{t.semanticBaseUrl}</span>
								<input aria-label={t.semanticBaseUrl} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" value={baseUrl} onChange={(event) => { setBaseUrl(event.target.value); setSaved(false); }} disabled={!value.canWriteState || saving || refreshing} />
							</label>
							<label className="block">
								<span>{t.semanticModel}</span>
								<input aria-label={t.semanticModel} className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2" value={model} onChange={(event) => { setModel(event.target.value); setSaved(false); }} disabled={!value.canWriteState || saving || refreshing} />
							</label>
						</div>
					)}
					{!value.canWriteState && <p className="text-ink-dim">{t.stateWriteRequired}</p>}
					<div className="flex items-center gap-3">
						<Button
							size="sm"
							disabled={!value.canWriteState || !value.binding || saving || refreshing}
							onClick={() => {
								if (value.binding && value.settings) void save(value.settings, value.binding.revision);
							}}
						>
							{saving ? t.saving : t.saveSemantic}
						</Button>
						{saved && <span role="status" className="text-ink-dim">{t.semanticSaved}</span>}
					</div>
				</div>
			)}
		</section>
	);
}
