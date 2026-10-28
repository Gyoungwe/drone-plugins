# Canonical knowledge model-review owner (2026-10-28)

Status: source/real-SDK slice implemented; formal installed-app GUI and full native/legacy closure remain incomplete. `pi-knowledge@0.3.0` and API `1.3.0` are unpublished candidates.

The Wiki model-review algorithm now belongs to the same explicit knowledge owner as review preview, human apply/reject, history and undo. Audit persistence uses the existing `WikiReviewPorts` (broker state CAS in Desktop; existing local atomic adapter in native owners). Its single-flight state belongs to that owner, with no process-wide review ledger. The old published 0.2/Host API 1.x named methods keep real compatibility wrappers; their removal is still a separate migration.

The plugin owns the prompt, evidence packet, five checks and apply policy. The host supplies only generic model selection/generation, live-session inspection and granted file/state mechanisms. A foreground review needs a selected live project session, exact binding revision/proposal hash, explicit cost/data acknowledgement and an independent auto-apply choice. It checks session idleness, selected model, sources, target and binding before generation, after the response and immediately before writing. Model agreement never becomes human review or scientific verification. Source excerpts are bounded without silent truncation; missing usage/pricing stays unknown.

The canonical review UI displays the actual selection, sends only a revision/hash-scoped operation through the bound client, and uses invocation-local AbortSignal cancellation. It disables human decisions during the model operation and aborts on unmount/replacement. The host independently approves model data/cost and each granted write. A successful apply emits invalidation and supplies the complete write receipt; partial audit/write failures remain visible.

## Observed evidence

- `desktop-review-owner.integration.test.ts`: 2/2 actual SDK + real temporary SQLite/Vault cases. The model case verifies busy/unacknowledged requests make zero model calls; advice does not write; actual provider cancellation cannot auto-apply; a session becoming busy after generation blocks the write; recovery applies once with audit read-back, history and undo. Closing the native session leaves the UI owner readable; final owner close releases SQLite. `/tmp/model-owner-plugin-integration.log`.
- New model-review UI and existing review/store regressions: 23/23, including explicit acknowledgement, configured profile, auto-apply, unknown pricing and exact invocation signal. `/tmp/model-owner-plugin-ui-final.log`.
- Full knowledge package `check`: 531/531, typecheck, build consistency, packed real native SDK smoke and clean installed UI load pass. `/tmp/model-owner-plugin-check-final.log`. The clean UI consumer uses the privately packed API tarball SHA-256 `5094498d60a7560fb5444d8c077107fad4d38e61b2d548cafa6f89250385ff7f`; no public registry release is claimed.
- Host mechanism source/actual SDK evidence is recorded in Drone `docs/pluginization/native-plugin-model-capabilities-evidence.md` (host commits `c32e37d0`, `b1d2a7ad`). Those host checks are distinct from the plugin's adapter fixture and formal installer gates.

The first package check reached all 531 tests and native smoke, then correctly failed because the explicit private API tarball input was missing. The final full package check supplied it. An earlier test run overlapped this worktree's rebuild and observed the build's temporary removal of `dist/host.mjs`; after rebuilding, checks ran sequentially without relaxing that test. Both failed logs remain under `/tmp/model-owner-plugin-{check,tests-all}.log`.

## Remaining

- Managed native command registration/void-handler receipt and its same-owner model audit read-back are next. The existing managed native surface still has only status/search; native text receipt support is not claimed.
- Full managed native hooks, publication proof identity and remaining knowledge flows still need migration. Published legacy foreground UI methods and `knowledge.specialist-runner` consumers remain active.
- The full candidate tarball must be rebuilt from the final combined clean source and tested with the matching host lock. This development worktree's API symlink is not release evidence; the packed UI smoke installs the separate private API tarball.
- Formal macOS installer GUI model review, enable/disable recovery, upgrade/rollback and zero-domain-plugin final acceptance remain NOT_RUN for this change. Existing four external acceptances and deferred MinerU/GROBID/B8/B8-2 remain unchanged.

Boundary checks introduced are the external model reply shape; scoped user-operation revision/hash/acknowledgement/profile; actual caller/session facts; persisted specialist setting shape; and stale model/source/binding checks before a side effect. Existing audit partial-failure catches preserve a visible partial receipt, never success. The retained 0.2 compatibility wrapper has the explicit API 2 removal condition; no fallback execution path or new retry/cache/flag was added.
