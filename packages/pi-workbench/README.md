# @gyoungwe/pi-workbench

Portable task planning and domain-memory tools for native Pi and Drone Desktop.

The package keeps task and memory state scoped to one extension registration. It does not write files or use process-global state. A host adapter may provide a `WorkbenchStore` and persist snapshots through its own approval and atomic storage contract.
