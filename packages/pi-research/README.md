# @gyoungwe/pi-research

Native Pi package for a bounded, evidence-gated research loop.

The package exposes local source discovery, hash-checked reads, source-linked
candidate note deposition and a source-grounded answer packet. A source must be
discovered before it can be read; an answer packet requires two distinct read
receipts. The packet is evidence for a model or host to assess, and never claims
independent scientific verification.

`research_loop` from the existing research domain remains available for the
run-level evidence lifecycle. Network, Zotero and institutional adapters stay
at the host boundary until their Electron-free package split is complete.

The package is self-contained after `npm run build`; the Pi host is a peer
dependency and is not bundled.
# @gyoungwe/pi-research

Native Pi research evidence tools. This package owns the host-neutral evidence
loop, bounded local source search/read/deposition, PDF page markers, and the
current-session `research_loop` receipt lifecycle. It has no dependency on
Drone host packages, Electron, or a Desktop checkout.

Tools: `research_search_sources`, `research_read_source`,
`research_deposit_research_note`, `research_answer_sources`, `research_status`,
and `research_loop`. It reads bounded files under the current workspace and
writes candidate notes under `.pi/research-notes`; it does not access the
network, subprocesses, credentials, or external systems.

When a workspace source directory is missing, a source changes after search, or
the evidence lifecycle is incomplete, the tool returns an explicit error and
does not claim an answerable result. Remote search, institutional access and
Zotero are reported as host responsibilities rather than silently simulated.

Source archive persistence, institutional access, and Zotero adapters remain
host ports until their contracts and isolated read/write evidence are migrated;
the package reports those capabilities as host responsibilities instead of
silently falling back to a second implementation.
