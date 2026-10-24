/**
 * Pure URL policy for institution-proxy navigation.
 *
 * Keeping this policy in the research package lets backend services and the
 * extension compatibility layer share the same contract without moving
 * Electron sessions or filesystem persistence into the package. The `.pi`
 * implementation remains self-contained for packaged extension execution.
 */
/**
 * Build a proxied URL from a user-configured institution template.
 *
 * Templates may contain `%s`, end in `url=`/`?`/`&`, or be a proxy/login
 * prefix. Existing target hosts are rejected to avoid applying a proxy twice.
 */
export declare function buildProxiedUrl(originalUrl: string, template?: string): string | null;
/**
 * Infer an EZproxy-style template from the URL reached by an institutional
 * login flow. Only HTTP(S) URLs with an explicit `url=` target are accepted.
 */
export declare function inferEzproxyTemplateFromUrl(navigatedUrl: string): string | null;
