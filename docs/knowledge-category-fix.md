# Knowledge category repair — 2026-10-25

Source candidate: `pi-knowledge@0.2.1`, aggregated by `research-suite@0.1.10`; neither version is claimed published to npm.

The old classifier concatenated frontmatter type and the entire note path, then checked paper/software keywords before method. Consequently `Library/Methods/mapping-tools.md` with `type: method` was counted as software. Both worker counts and recent groups carried duplicate copies of this rule.

`src/core/note-category.ts` now supplies one classifier: explicit type first (unmapped explicit types remain other), nearest recognized category directory second, filename keyword fallback only for untyped notes. Counts and recent groups use it; notes, review status, source hashes and stored index format are unchanged.

Regression evidence: the original implementation failed 8 of 11 targeted cases, including real worker category counts. The fixed implementation passes all 11, including closing and reopening the same indexed Vault. Full knowledge tests pass 41 files / 341 cases; package smoke and workspace `npm run check` pass, including clean install and Pi 1.1.0/latest 1.4.0 research SDK checks. Formatting-only manifest normalization was followed by a fresh build and knowledge/suite build checks.

Host integration must consume the pinned commit/tarball, rebuild its shipped worker and extensions, and verify an actual installed macOS application. The host's recent-note labels must consume the existing categorized groups rather than infer again from filenames. Final GUI evidence is recorded in the Drone repository; until that record is completed this document alone does not close RESEARCH-GUI-CATEGORY.
