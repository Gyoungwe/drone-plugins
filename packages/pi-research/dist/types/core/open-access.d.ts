/**
 * 合法开放获取（OA）全文定位：只查询公开、许可明确的元数据服务，按可信度排序给出 PDF 候选。
 *
 * 来源（全部是公开 API / 出版者或存储库自己提供的文件，不接触任何影子图书馆）：
 *   1. Europe PMC   — DOI/PMID → PMCID、OA 标记、许可（身份补全）
 *   2. PMC Cloud    — PMC 文章数据集（AWS S3 公开桶 pmc-oa-opendata，2026-08 起替代已下线的 oa.fcgi）：
 *                     metadata/PMC{id}.{v}.json 给出许可与 pdf_url，PDF 直接由 https 读取，无验证码
 *   3. Europe PMC   — OA 文章的渲染 PDF（站点有 Cloudflare 校验，桌面环境可用时才成功）
 *   4. Unpaywall    — 出版者 / 机构库 / 预印本的合法 OA 位置（需要联系邮箱）
 *   5. OpenAlex     — 同上，含 arXiv / bioRxiv / medRxiv 等仓储位置
 *   6. Semantic Scholar — openAccessPdf、arXiv
 *   7. Crossref     — 出版者登记的全文链接（可能受订阅限制；失败即失败，不绕过）
 *
 * 这里只产生候选与查询记录，不下载正文；下载、校验（必须是 PDF 字节）与归档在 source-archive.mjs。
 * 找不到 OA 版本时如实返回 not-found：闭源文献只能由用户用自己的访问权限下载后以 local_file 导入。
 */
export declare const OA_SOURCES: readonly string[];
export declare const PMC_CLOUD_BASE = "https://pmc-oa-opendata.s3.amazonaws.com";
export declare const OA_DEFAULT_TIMEOUT_MS = 12000;
export declare const OA_MAX_CANDIDATES = 8;
export interface OpenAccessCandidate {
    url: string;
    source: string;
    kind: string;
    license: string | null;
    version: string | null;
    hostType: string | null;
    note: string | null;
}
export interface OpenAccessQuery {
    source: string;
    status: "ok" | "error" | "skipped";
    detail: string | null;
}
export interface OpenAccessResolution {
    doi: string | null;
    pmcid: string | null;
    pmid: string | null;
    title: string | null;
    oaStatus: string | null;
    license: string | null;
    candidates: OpenAccessCandidate[];
    queried: OpenAccessQuery[];
}
export interface OpenAccessOptions {
    doi?: unknown;
    pmcid?: unknown;
    pmid?: unknown;
    email?: unknown;
    fetchImpl?: FetchImpl;
    timeoutMs?: number;
    signal?: AbortSignal;
    sources?: readonly string[];
    maxCandidates?: number;
    env?: Record<string, string | undefined>;
}
type FetchImpl = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export declare function normalizePmcid(value: unknown): string | null;
export declare function normalizePmid(value: unknown): string | null;
/** 联系邮箱：参数 → 环境变量；Unpaywall 要求提供，OpenAlex 用它进入礼貌池。 */
export declare function contactEmail(explicit: unknown, env?: Record<string, string | undefined>): string | null;
/** PMC Cloud 元数据里的 s3:// 路径有同名的公开 https 读取地址（保留 md5 查询参数）。 */
export declare const pmcCloudHttps: (value: unknown) => string | null;
/**
 * 解析开放获取候选。返回 { doi, pmcid, pmid, oaStatus, license, candidates[], queried[] }。
 * 每个来源独立超时、独立失败；来源顺序即候选顺序（Europe PMC / PMC 官方文件优先于聚合器）。
 */
export declare function resolveOpenAccess({ doi, pmcid, pmid, email, fetchImpl, timeoutMs, signal, sources, maxCandidates, env, }?: OpenAccessOptions): Promise<OpenAccessResolution>;
declare const _default: {
    resolveOpenAccess: typeof resolveOpenAccess;
    contactEmail: typeof contactEmail;
    normalizePmcid: typeof normalizePmcid;
    normalizePmid: typeof normalizePmid;
    pmcCloudHttps: (value: unknown) => string | null;
    OA_SOURCES: readonly string[];
};
export default _default;
