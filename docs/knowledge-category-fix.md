# Knowledge category repair — 2026-10-25

Source candidate: `pi-knowledge@0.2.1`, aggregated by `research-suite@0.1.10`; neither version is claimed published to npm.

The old classifier concatenated frontmatter type and the entire note path, then checked paper/software keywords before method. Consequently `Library/Methods/mapping-tools.md` with `type: method` was counted as software. Both worker counts and recent groups carried duplicate copies of this rule.

`src/core/note-category.ts` now supplies one classifier: explicit type first (unmapped explicit types remain other), nearest recognized category directory second, filename keyword fallback only for untyped notes. Counts and recent groups use it; notes, review status, source hashes and stored index format are unchanged.

Regression evidence: the original implementation failed 8 of 11 targeted cases, including real worker category counts. The fixed implementation passes all 11, including closing and reopening the same indexed Vault. Full knowledge tests pass 41 files / 341 cases; package smoke and workspace `npm run check` pass, including clean install and Pi 1.1.0/latest 1.4.0 research SDK checks. Formatting-only manifest normalization was followed by a fresh build and knowledge/suite build checks.

Host source `e38312a9` consumes plugin source `831e3995c1a1dd35a8e77632978c06457e5c9f8c` and the matching packed SHA-256 `c40c15923108067842d2295fe836959ad25870ef3a7ab89361f6e778528ab6b1`. Clean npm ci, remote fetch without a local override, extension rebuild, all host gates and strict artifact checks passed.

Actual DMG installation and native macOS arm64 GUI acceptance passed with the existing isolated Vault: old software 7 / method 0 became software 4 / method 1; the original method appears in the method tab and is absent from the four-row software tab. Its reader retains L1–32 and the original hash; restarting the installed app retains the classification. All 23 Markdown hashes remain identical. No model prompts, account writes or scientific review were performed in this classification run.

DMG SHA-256: `39835dad55a2cfb6f797ada60b3940b7a14e2bdf0f6279874d1724e9137180d0`. Full evidence is in Drone's `docs/pluginization/knowledge-category-fix-evidence.md` and `docs/releases/knowledge-category-fix-2026-10-25.json` (repair branch `codex/knowledge-category-fix`, now integrated into main). RESEARCH-GUI-CATEGORY is closed for this installed macOS scope; cloud/account acceptance, other platforms and npm publication remain open. Both repair branches were fast-forwarded into main on 2026-10-25: Drone `a853230e`, drone-plugins `c43f7b4`. Post-merge clean npm ci and all host/plugin gates passed, including knowledge tests/smoke; see the host JSON `mainIntegration`. No runtime source changed during integration, so the original installed GUI evidence is retained without claiming a new GUI run. Remaining statuses and npm publication remain unchanged.
