import type { PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import type {
	KnowledgePreferences,
	KnowledgeSetReviewPolicyInput,
} from "../src/desktop/contract";
import { useEffect, useRef, useState } from "react";
import { Button } from "./runtime-api";
import { useNativeKnowledgeText } from "./native-copy";

/** Package settings share the runtime owner; paths are display values, never new grants. */
export function NativeKnowledgePreferences({
	client,
	observationRevision,
	refreshing,
}: {
	client: PluginUiRuntimeClient;
	observationRevision: number;
	refreshing: boolean;
}) {
	const t = useNativeKnowledgeText();
	const [value, setValue] = useState<KnowledgePreferences | null>(null);
	const [mode, setMode] = useState<"automatic" | "strict">("strict");
	const [loading, setLoading] = useState(false),
		[saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null),
		[saved, setSaved] = useState(false);
	const epoch = useRef(0);
	useEffect(() => {
		const request = ++epoch.current;
		setLoading(true);
		setSaving(false);
		setSaved(false);
		setError(null);
		setValue(null);
		void client
			.invoke("preferences", null)
			.then(
				(result) => {
					if (request !== epoch.current) return;
					const preferences = result as KnowledgePreferences;
					setValue(preferences);
					setMode(
						preferences.reviewPolicy.persistedMode ??
							preferences.reviewPolicy.mode,
					);
				},
				(cause) => {
					if (request === epoch.current)
						setError(cause instanceof Error ? cause.message : String(cause));
				},
			)
			.finally(() => {
				if (request === epoch.current) setLoading(false);
			});
		return () => {
			++epoch.current;
		};
	}, [client, observationRevision]);
	async function save(snapshot: KnowledgePreferences, bindingRevision: number) {
		const request = ++epoch.current;
		setSaving(true);
		setSaved(false);
		setError(null);
		const input: KnowledgeSetReviewPolicyInput = {
			bindingRevision,
			expectedVersion: snapshot.reviewPolicy.version,
			mode,
		};
		try {
			const result = (await client.invoke(
				"setReviewPolicy",
				input,
			)) as KnowledgePreferences;
			if (request !== epoch.current) return;
			setValue(result);
			setMode(result.reviewPolicy.persistedMode ?? result.reviewPolicy.mode);
			setSaved(true);
		} catch (cause) {
			if (request === epoch.current)
				setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			if (request === epoch.current) setSaving(false);
		}
	}
	return (
		<section
			className="space-y-4"
			aria-label={t.settings}
			data-testid="native-knowledge-preferences"
		>
			<h2 className="text-sm font-semibold">{t.settings}</h2>
			{loading && (
				<p role="status" className="text-sm text-ink-dim">
					{t.loading}
				</p>
			)}
			{error && (
				<p role="alert" className="text-sm text-err">
					{error}
				</p>
			)}
			{value && (
				<>
					<section
						className="rounded-xl border border-border bg-surface p-4"
						aria-label={t.bindingDetails}
					>
						<h3 className="text-sm font-medium">{t.bindingDetails}</h3>
						{value.binding ? (
							<dl className="mt-3 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
								<dt>{t.vaultPath}</dt>
								<dd className="break-all font-mono">{value.binding.vault}</dd>
								<dt>{t.profile}</dt>
								<dd>{t[`profile_${value.binding.profile}`]}</dd>
								<dt>{t.depositMode}</dt>
								<dd>{t[value.binding.depositMode]}</dd>
								<dt>{t.subagentPolicy}</dt>
								<dd>{t[value.binding.subagentPolicy]}</dd>
								<dt>{t.bindingRevision}</dt>
								<dd>{value.binding.revision}</dd>
								<dt>{t.updatedAt}</dt>
								<dd>{value.binding.updatedAt}</dd>
							</dl>
						) : (
							<p className="mt-3 text-sm text-ink-dim">{t.unconfigured}</p>
						)}
						<p className="mt-3 text-xs text-ink-dim">
							{t.bindingEditingUnavailable}
						</p>
					</section>
					<section
						className="rounded-xl border border-border bg-surface p-4"
						aria-label={t.reviewPolicy}
					>
						<h3 className="text-sm font-medium">{t.reviewPolicy}</h3>
						<dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
							<dt>{t.effectiveMode}</dt>
							<dd>{t[value.reviewPolicy.mode]}</dd>
							<dt>{t.persistedMode}</dt>
							<dd>
								{value.reviewPolicy.persistedMode
									? t[value.reviewPolicy.persistedMode]
									: t.notPersisted}
							</dd>
						</dl>
						<p className="mt-3 text-xs text-ink-dim">{t.reviewPolicyHint}</p>
						{value.reviewPolicy.override && (
							<p role="status" className="mt-3 text-xs text-warn">
								{t.policyOverride}
							</p>
						)}
						{value.reviewPolicy.diagnostic && (
							<p role="alert" className="mt-3 text-xs text-err">
								{t[value.reviewPolicy.diagnostic]}
							</p>
						)}
						{!value.canWriteState && (
							<p className="mt-3 text-xs text-ink-dim">
								{t.stateWriteRequired}
							</p>
						)}
						{value.binding && (
							<div className="mt-3 flex flex-wrap items-center gap-3">
								<label className="text-xs">
									{t.reviewPolicy}
									<select
										aria-label={t.reviewPolicy}
										value={mode}
										onChange={(event) => {
											setMode(event.target.value as "automatic" | "strict");
											setSaved(false);
										}}
										disabled={
											saving ||
											loading ||
											refreshing ||
											!value.canWriteState ||
											value.reviewPolicy.override !== null ||
											value.reviewPolicy.diagnostic !== null
										}
										className="ml-2 rounded-lg border border-border bg-surface px-3 py-2"
									>
										<option value="automatic">{t.automatic}</option>
										<option value="strict">{t.strict}</option>
									</select>
								</label>
								<Button
									size="sm"
									disabled={
										saving ||
										loading ||
										refreshing ||
										!value.canWriteState ||
										value.reviewPolicy.override !== null ||
										value.reviewPolicy.diagnostic !== null ||
										mode ===
											(value.reviewPolicy.persistedMode ??
												value.reviewPolicy.mode)
									}
									onClick={() => void save(value, value.binding!.revision)}
								>
									{saving ? t.saving : t.savePolicy}
								</Button>
							</div>
						)}
						{saved && (
							<p role="status" className="mt-3 text-xs text-ink-dim">
								{t.policySaved}
							</p>
						)}
					</section>
				</>
			)}
		</section>
	);
}
