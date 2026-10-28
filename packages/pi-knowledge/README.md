# @gyoungwe/pi-knowledge

Knowledge/Vault tools for official Pi, with an optional Drone Desktop knowledge workspace in the same package. **0.3.0 is an unpublished candidate.** The latest release established before this change is 0.2.1.

`pi.extensions` points only to the self-contained `dist/index.mjs`; the worker lives in `lib/knowledge/runtime`. Native Pi does not import the UI, React, Electron or Drone private modules. `plugin.manifest.json` additionally declares `ui/plugin.json`, whose independent `drone-knowledge-ui` contribution exports the read-only knowledge page and an explicit unavailable surface for features awaiting migration. React stays external and is provided by Desktop; the read-only entry and scoped styles are bundled in `ui/bundle.js`; the retained graph source is not loaded by this entry.

Until a Vault is bound, `knowledge_status` returns `{ "status": "unconfigured", "next": "/drone-init" }`. Installation never creates a Vault implicitly or changes existing `.pi/` or Vault formats. Task tools belong to pi-core; the research-workflow skill belongs to pi-research.

The source and worker build are owned here. `npm run build` rebuilds native bundles, declarations and UI from this package; `build:check` verifies hashes and independently rebuilds UI for comparison. `npm run check` includes native and UI types/tests plus packed native extension and clean UI installation smoke tests. The native smoke dispatches native/internal status through real official SDK sessions with an offline deterministic provider, verifies configured shutdown releases the local writer lease, and restarts the packed default entry. These checks do not replace formal installed-app acceptance.

The moved UI source, tests and styles retain Git ancestry through `git mv` from desktop-ui-pack (and its earlier non-squashed Drone subtree import). The 0.3.0 desktop-ui-pack companion now provides only the research status panel. **Before enabling this candidate, disable or remove desktop-ui-pack 0.2.0**, which still owns the historical knowledge contributions. Do not enable those old contributions alongside this package. The public 0.2.0 artifact is unchanged; rollback disables this candidate UI and reinstalls/re-enables the prior package while preserving Vault and binding data.

This is a partial P2 migration. The candidate Desktop UI uses its own overview/search runtime and store, sharing one isolated index resource with two native read tools. Review lists, exact previews, apply/reject, history and undo use that owner's Wiki algorithms, project scope and source/proposal/binding revisions; writes require separate state and Vault grants. Review and semantic settings also use scoped broker ports and CAS revisions.

The canonical review panel now offers one independent structured model review. It displays the resolved model, requires explicit data/cost acknowledgement and a separate optional auto-apply choice, and supports canceling only that invocation. The host separately approves each actual model request. The plugin checks foreground session idleness and the same candidate/source/binding again before model input, after the response and before applying. Model agreement is never human review or scientific certification; missing usage/pricing stays unknown. Audit/history/undo use the same owner and IO as human review. The native owner exposes the same model-review algorithm; full managed command registration and an official native receipt remain pending. Full research hooks, publication authority and remaining domain writes are not yet supplied by this Desktop adapter. The published UI 1.x compatibility methods remain real until their consumers migrate. See [migration evidence](../../docs/knowledge-ui-co-package-2026-10-26.md) and [model review owner evidence](../../docs/native-knowledge-model-review-owner-2026-10-28.md).

`npm run test:styles` checks light/dark computed styles and host sibling isolation in a fresh headless Chromium profile. Set `DRONE_UI_TEST_BROWSER` for the executable and optionally `DRONE_UI_TEST_HOST_CSS` for compiled host styles. Fixture checks are not formal GUI acceptance.

The candidate declares `application-state` for its existing configuration/index directory and the local writer coordination root `~/.drone/runtime-leases/knowledge-writers`. This is not permission to access the whole home directory. Temporary-Vault acceptance has exercised explicit file/state/resource grants; formal installed-app grants remain to be verified. Explicit runtime owners reserve canonical Vault and index identities in that shared local directory and release only after actual worker exit; no lock is written into the Vault. Cross-user/multi-machine sharing is not covered, and crash residues require explicit recovery rather than PID-based deletion. The candidate default CLI now creates an explicit owner and releases its lease on SDK shutdown. The old Desktop compatibility pool still does not enable leases. The new Desktop read adapter instead uses the host resource manager’s real owner reservation. Native sessions share an owner while keeping tickets, proof identities and cancellation separate; The new Desktop read UI and its two native tools share their granted read owner; full research/native hooks must still join that resource model. The owner reservation survives worker failure until accepted owner operations drain. Direct legacy domain factories remain outside that owner lifetime. Full native/UI ownership remains incomplete P2 work.

The candidate UI declares `droneUi: 2`: v1-only hosts must reject it before loading. Desktop native/runtime/resource support requires the unpublished Plugin API 1.3 candidate. The source dependency minimum is now `^1.3.0`; release must first publish and verify that API candidate. Private tarball overrides are not evidence of a public registry installation.

## 0.3.0 source candidate

Knowledge category counts and recent-note groups now share one rule: explicit frontmatter type takes precedence, then the nearest recognized category directory, then filename keywords for untyped notes. A method named `mapping-tools.md` remains a method; a typed concept is not relabeled from its filename. This is a local source candidate, not an npm publication claim.

Scientific claim comparisons preserve missing conditions and unknown directions
as unresolved. Only comparable observations with explicit opposite directions
produce a conflict candidate; text similarity alone cannot establish one.
Versioned comparisons retain both source hashes and unresolved conditions across
restarts without promoting earlier records to scientific verification.

Automatic topic-memory capture after a summary consumes the exact body-bound
claims returned by a reviewed host delivery. It checks the final body, claim-set
and source hashes instead of accepting the model's original tool arguments.
Absent or stale delivery receipts leave that automatic capture unavailable;
ordinary knowledge reading and candidate memory remain separate capabilities.

Explicit experience navigation is available through the existing
`research_search_knowledge` tool with `kind:"experiences"`, a `workflow` and a
`host_id`. It reuses the current Vault/project's existing experience store and
filters by the supplied workflow and host. Results keep `navigationOnly:true`,
`evidenceEligible:false` and `instructionEligible:false`; this mode does not
automatically inject memory or turn a previous repair into an execution plan.
