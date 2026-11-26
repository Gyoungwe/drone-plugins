# @gyoungwe/research-suite

The suite composes the standalone pi-core, pi-knowledge and pi-research packages. Its tarball bundles exact dependencies so official Pi can discover native extensions and skills without a second package resolution. The suite contains no second domain implementation.

## Unpublished 0.4.0 candidate

This candidate pins `pi-core@0.3.0`, `pi-knowledge@0.3.1` and `pi-research@0.4.1`. The previously published suite 0.1.11 remains immutable. The three packages carry their own Desktop UI resources. The suite declares three native Pi extensions, including the Workbench tools from `pi-core` and the connector catalog tools `connector_list` and `connector_get` from `pi-research`.

Before upgrading, remove any separately installed `@gyoungwe/desktop-ui-pack`, `@gyoungwe/pi-workbench` and `@gyoungwe/pi-connectors` to avoid duplicate tools or UI. The Tasks, Workbench and Research status tabs are owned by `pi-core`. Knowledge contributions are owned by `pi-knowledge`.

`npm run build` stages the dependencies and validates their versions, native entries, distinct skill ownership and knowledge UI resources. `build:check` verifies the staged result, and `npm test` checks registrations and research evidence behavior. Desktop discovery of nested UI and installed-app GUI acceptance remain separate host checks.

External writes and installations require host authorization. The suite declares `application-state` for the knowledge package's configured state and index directory and its local writer-lease root. Knowledge's legacy native and Desktop owner keeps leases disabled pending shared-owner shutdown support.
