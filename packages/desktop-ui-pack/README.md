# @gyoungwe/desktop-ui-pack

Optional Desktop UI contributions for Drone. Desktop discovers the installed
package under Pi's managed user package directory and imports the `ui/`
manifest through the existing UI plugin manager. The package uses only the
public UI host boundary; it does not ship Electron, backend, Pi SDK, network,
credentials, or persistence code.

The first contribution is `drone-research-ui`, a small research status panel.
It is disabled by default and follows the host's existing enable, disable,
reload, and persisted configuration lifecycle.
