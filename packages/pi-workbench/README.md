# @gyoungwe/pi-workbench

Portable task planning and domain-memory tools for native Pi and Drone Desktop. The package also ships an optional, removable `panel.tab` UI contribution discovered from `plugin.manifest.json` → `entrypoints.ui`; it reads the host transcript store for the active task list and leaves persistence to the host runtime.

The package keeps task and memory state scoped to one extension registration. It does not write files or use process-global state. A host adapter may provide a `WorkbenchStore` and persist snapshots through its own approval and atomic storage contract. The first UI slice renders current-session tasks and a truthful memory empty state; it does not invent a renderer-side memory store.
