import { useState } from "react";
import type { ArtifactRecord } from "../src/models.js";
import type { WriteInput } from "../src/runtime-schema.js";
import type { copy } from "./copy.js";

interface ArtifactRerunListProps {
	artifacts: readonly Pick<ArtifactRecord, "id" | "path" | "sha256" | "status">[];
	status: { unavailable?: readonly string[] };
	busy: boolean;
	act(input: WriteInput & { action: "rerunArtifact" }): Promise<void>;
	readProvenance(id: string): Promise<{ value: unknown } | undefined>;
	t: typeof copy.en;
}

export function ArtifactRerunList({
	artifacts,
	status,
	busy,
	act,
	readProvenance,
	t,
}: ArtifactRerunListProps) {
	const [provenance, setProvenance] = useState<{ value: unknown }>();
	const unavailable = status.unavailable?.includes("rerun-executor");
	const inspect = async (id: string) => {
		const result = await readProvenance(id);
		if (result) setProvenance(result);
	};
	return (
		<section>
			<h3>
				{t.artifacts} ({artifacts.length})
			</h3>
			{artifacts.length === 0 ? (
				<p>{t.empty}</p>
			) : (
				<ul>
					{artifacts.map((record) => (
						<li key={record.id} className="rounded border border-border p-2">
							<p className="break-all">{record.path}</p>
							<p>
								{record.status} · {record.sha256}
							</p>
							<div className="flex flex-wrap items-center gap-2">
								<button type="button" disabled={busy} onClick={() => void inspect(record.id)}>
									{t.provenance}
								</button>
								<button
									type="button"
									disabled={busy || unavailable}
									onClick={() => void act({ action: "rerunArtifact", id: record.id })}
								>
									{t.rerun}
								</button>
								{unavailable && <span className="text-xs text-muted">{t.rerunUnavailable}</span>}
							</div>
						</li>
					))}
				</ul>
			)}
			{provenance &&
				(provenance.value === null ? (
					<p>{t.empty}</p>
				) : (
					<pre className="overflow-auto whitespace-pre-wrap break-all">
						{JSON.stringify(provenance.value, null, 2)}
					</pre>
				))}
		</section>
	);
}
