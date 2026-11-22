/**
 * KP5b — the bare-link resolver.
 *
 * A bare `[[name]]` link names a note by its file name.  Resolving one used
 * to match the path with a leading wildcard, `path LIKE '%/<name>'`, which
 * has to read every path in the index.  The filename is now a column with an
 * index on it, so the lookup is a seek.
 *
 * The resolver lives here, away from the runtime, because it is a pure
 * lookup: it needs the database and the scope rule, and nothing else.
 *
 * 链接解析：全路径 [[Library/Papers/x]] 直接对应；只写笔记名的 [[x]] 按文件名唯一匹配。
 * 返回 null 表示目标不在库里（未建的笔记或外部链接）。
 */

/** The database the resolver reads. */
export interface LinkResolverDatabase {
	prepare(sql: string): {
		get(path: string): { path: string } | undefined;
		all(...params: unknown[]): Array<{ path: string }>;
	};
}

/** What the resolver needs to know about a path's scope. */
export type ScopeReader = (path: string, project: string) => boolean;

/**
 * Builds the resolver for one index.
 *
 * `canRead` decides whether a path is visible to a project; a link to a note
 * outside the project does not resolve.
 */
export function createLinkResolver(database: LinkResolverDatabase, canRead: ScopeReader) {
	/**
	 * The note a bare `[[name]]` link points at, if there is exactly one.
	 *
	 * A link with a directory in it is not a bare link, so it resolves only
	 * when the path is exactly a note's path.
	 */
	function resolve(target: string, project?: string): string | null {
		const exact = database.prepare("SELECT path FROM notes WHERE path=?").get(target);
		if (exact && (project === undefined || canRead(target, project))) return target;
		if (target.includes("/")) return null;
		const rows =
			project === undefined
				? database.prepare("SELECT path FROM notes WHERE filename=? LIMIT 2").all(target)
				: database
						.prepare("SELECT path FROM notes WHERE filename=? AND (scope='shared' OR scope=?) LIMIT 2")
						.all(target, project || "");
		return rows.length === 1 ? rows[0].path : null;
	}

	/**
	 * The plan the bare-link lookup runs under.
	 *
	 * A plan is a structural fact: it says whether the lookup seeks an index
	 * or scans the notes, and it does not change with the machine's speed or
	 * its load.  So a guard on it cannot flake.
	 */
	function lookupPlan(): string {
		return database
			.prepare("EXPLAIN QUERY PLAN SELECT path FROM notes WHERE filename=? LIMIT 2")
			.all("")
			.map((row) => String((row as { detail?: string }).detail ?? ""))
			.join(" ");
	}

	return { resolve, lookupPlan };
}
