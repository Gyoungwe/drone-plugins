# pi-inquiry (private migration candidate)

Canonical Inquiry SQL and original SQLite files remain unchanged in format. This unpublished candidate provides `inquiry.runtime` version 1 through generic `inquiry.read` / `inquiry.write` JSON operations. It has not yet completed native Pi entry, installed UI, legacy seam deletion or formal packaged acceptance; it must not be published or counted as a complete migration.

The installed manifest requests independent JSON metadata and binary state directory grants. Each write needs actual caller authorization, exact writer leases, raw-byte CAS and readback. Original databases receive SHA-named immutable backups; pending writes require explicit reconciliation and restore targets the original path. Active WAL/SHM/journal files, external changes and databases over the host's fixed 4 MiB boundary are refused. All returned records are plugin-asserted or imported data, not independent host provenance proofs. Rerun execution and workspace promotion remain explicitly unavailable until their actual provider/file ports are migrated.

`npm run check:domain` runs canonical Node/WASM SQL, original-byte persistence and provider behavior regressions. Build artifacts include the actual sql.js loader/WASM/license. Private immutable tarball/actual SDK provider evidence remains separate from these tests.
