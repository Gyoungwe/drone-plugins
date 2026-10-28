# Inquiry canonical SQL 迁移候选

2026-10-28；私有、未发布的 `pi-inquiry` 结构切片，尚未提供生产 provider、native tools/UI 或 binary 持久化。不得以本页关闭 Inquiry/P5。

历史从 Drone `packages/inquiry` 通过 `git subtree split` 导出为 `b69e05ff42fca1207ef4100570fed58dd9c537b4`，以非 squash subtree merge `895b2f0` 导入本仓库 `packages/pi-inquiry`。原 author/date/提交链仍可达；追溯 SQL 可查看该 split commit 下的 `src/storage.ts` 历史，subtree merge 元数据记录前缀。宿主旧入口暂作为基准，待实际 provider/原数据切换完成后删除，不会同时启用两个 writer。

`sqlite-storage.ts` 持有唯一的 canonical SQL/schema/记录验证；内部 `sqlite-connection.ts` 只描述 exec/prepare(get/all/run)、串行写入与关闭。原 `storage.ts` 的 Node SQLite adapter 委托同一类，保留原文件/队列行为；文件与内存 adapter、模型、lineage、provenance 和领域 service 已同源导入。未将 SQLite 改成 JSON。

纯结构后 TypeScript 检查和原 19 项 Node/领域测试通过，日志 `/tmp/inquiry-sql-structure-type-2.log`、`/tmp/inquiry-sql-structure-node-tests-2.log`。这不是 clean-installed plugin/正式 GUI 证据；新包仍是 private migration candidate，未登记可用生产服务。

后继：sql.js adapter 消费同一 SQL，运行 Node/WASM 等价、schema v1/v2、所有领域功能；精确 binary-state 合同经宿主审查后再实现原路径 CAS/备份/WAL/单writer恢复；最终替换旧宿主入口及通路，完成 SDK/UI 与正式安装包验收。普通 domain worker 不重新开放 `node:sqlite`。

## 内存 WASM 行为切片（2026-10-28）

`wasm-storage.ts` 使用固定 sql.js 1.15.2，复用同一个 canonical SQL 类及所有 schema/领域验证；不 import `node:sqlite`，不直接持久化用户文件。`domain.mjs` 仅包含领域 service/模型，`wasm-storage.mjs` 配套独立 CJS loader、WASM 与 MIT 许可证；构建清单记录实际源码和资产 hash，`build:check` 验证可重复字节。

19 项原回归加 11 项 Node/WASM 合同测试共 30 项通过，覆盖六种 ledger、rollback 后合法事务、原 SQLite v1/v2、两引擎全状态等价、export 后继续写、原 SQLite 文件格式/Node 回读与约 3 MiB 合成库。混合 projectId、空 metadata、未知 schema 在两引擎均明确拒绝，不取第一条数据接管。日志 `/tmp/inquiry-wasm-artifact-check.log`。TypeScript 与 build:check 通过。

实际普通 `createProcessPluginRuntime` worker 已在 `--no-experimental-sqlite` 下导入打包的 WASM 资产，运行真实 InquiryService 写问题/读快照/导出 SQLite，测试自身授权临时目录内由原 Node SQLite `quick_check` 回读通过；日志 `/tmp/inquiry-wasm-actual-worker.log`。这是实际受限进程兼容性切片，未冒充生产 provider、正式 GUI 或用户库迁移。

新增异常处理只用于连接初始化失败时真实关闭、SQL rollback 失败保留原错误、原文件临时写清理失败显式聚合；后续事务队列只让原错误留在调用者 promise，绝不吞掉失败并报告成功。缺失与不可信 SQLite 元数据仅在存储输入边界验证。

仍未完成：独立 binary-state 生产端口、旧库备份/WAL/原路径 CAS、真实旧 writer 竞争、provider/native/UI 接线及旧宿主 seam 删除。超过 4 MiB 原库支持未覆盖；knowledge 索引 FTS5 资源不在本切片，仍不得宣称其 SQLite 例外已关闭。
