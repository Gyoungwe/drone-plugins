# @gyoungwe/desktop-ui-pack

Optional Knowledge workspace and research surfaces for Drone Desktop. Version 0.2.0 is a release candidate requiring the `@gyoungwe/plugin-api/ui` 1.2 contract; it has not been published.

The installed package contributes `knowledge.page` (overview, network, reviews and settings), `knowledge.surface` (embedded settings, note reader, flow receipts, Zotero and institutional access), `app.overlay` (review dialog and notices), and the original research `panel.tab`. Other packages may still contribute `knowledge.tab` tabs. Disabling, removing or failing this package returns the host to its lightweight binding/folder/plugin-management page.

All services use the explicit `window.DroneUI.knowledge` port. Session state, event delivery, authorization, path restrictions, persistence and credentials remain host owned. The UI cannot access arbitrary IPC, Node, Electron, the Pi runtime, or `window.pi`. Binding and review operations retain the existing confirmation and read-back rules. The manifest declares the workspace/Vault reads and configured-service writes exposed by these screens; installing the UI does not grant those permissions.

The 46 original knowledge source/test files retain their Drone Git ancestry through a non-squashed subtree import (source main `e5ec4f01`; structural import `3d6d33b`). Domain copy and styles live here. React is external in `ui/bundle.js` and is resolved to the host instance; graph libraries are bundled. Styles include only this package's scoped utility selectors and knowledge selectors, without a second global preflight.

`npm run check` validates deterministic outputs, public API types, component/model regressions, and a clean candidate-tarball install/load. These tests do not replace installed Desktop GUI acceptance. The root `vendor/gyoungwe-plugin-api-1.2.0.tgz` is the reproducible candidate contract used for prepublication checks; publishable package manifests keep semver dependencies.

CSS isolation is verified by `npm run test:styles` in a separate headless Chromium profile (set `DRONE_UI_TEST_BROWSER` for the browser binary; optionally supply compiled host CSS through `DRONE_UI_TEST_HOST_CSS`). It checks light/dark computed colors, borders, grid layout, and host sibling snapshots before enabling, while enabled, and after removing plugin styles. Theme references inherit host tokens; Tailwind property registrations and cascade layers use the plugin namespace.
