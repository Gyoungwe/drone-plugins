type Options = Record<string, any>;
type Result = Record<string, any>;
type Reconciler = (expected: Options) => Promise<Result>;
/** Read-only Web API adapter. Credentials come from the host environment only. */
export declare function createZoteroReconciler({ libraryType: rawLibraryType, libraryId, apiKey, request, }?: Options): Reconciler;
/** Read-only local desktop API adapter, limited to the user library. */
export declare function createLocalZoteroReconciler({ request, timeoutMs, userLibraryIds, }?: Options): Reconciler;
/** Local API first, then Web API; return the most informative read-only result. */
export declare function createCompositeZoteroReconciler({ local, web, env }?: Options): Reconciler;
export {};
