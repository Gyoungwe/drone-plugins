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

## 原库持久化 owner 候选（2026-10-28）

`ledger-owner.ts` 复用同一 WASM canonical SQL，并将每个 application/workspace 的事务串行化。实际 host ports 是每次借用的当前 caller 权限，没有 process 全局账本。原库 SHA 命名备份以 expected-null 创建并回读；原 `ledger.sqlite` 的 staged SQL 通过 pending JSON(old/candidate SHA) → binary CAS → terminal JSON 记录提交。取消后不新写 metadata；新合法 caller 显式 reconcile，只有 previous/candidate 两种匹配可收口，其余保持 needs-recovery；恢复原库也在原路径走 pending/CAS/回读。WAL/SHM/journal 存在、外部 SHA 变化、混合 project/schema 均拒绝自动接管。

新增 6 项 owner 回归，连同原 30 项共 36 项通过，TypeScript/build:check 通过，日志 `/tmp/inquiry-owner-final-check.log`。测试使用真实原 SQLite、真实内存 SQL、公共 Node binary IO 和临时目录；JSON metadata port 是测试的原子 Node fixture，**不是宿主 JsonStore/真实 SDK provider 的最终证据**。测试覆盖备份字节、提交/reopen、原路径精确恢复、被拒提交显式 not-committed、实际提交后撤销零新 metadata 与 fresh-caller committed、WAL 拒绝、外部变化和领域失败回滚。provider/native/UI/旧 seam 删除仍未完成，新包继续 private 未发布候选。

## 通用 provider 与真实 SDK 端口切片（2026-10-28）

`runtime.ts` 提供真实 `inquiry.runtime@1`（`inquiry.read` / `inquiry.write`），经当前 `caller.scope`、明确 root handles 和原库目录绑定复用应用内 owner。JSON 与 binary 为独立授权，但两者 canonical 目录必须是同一原库目录；固定 `inquiry-binding.json` 只允许绑定一个实际 workspace，其他 workspace 拒绝覆盖。状态/检查/六 ledger/decision/recovery 操作复用 canonical service，结果明确标作 plugin-asserted/imported，不授 host provenance 权威。通用服务规范复用既有提交 `030bda3`（本分支 `ad2bc35`），没有另造 router。

原 36 项加 provider/显式已有数据绑定/第二 workspace 拒绝共 39 项、类型与 build:check 通过；24 项 manifest 合同通过。候选包仍 private，只声明 Desktop 服务；**native entry、已安装 rendered UI、旧 seam 删除仍未完成**。

不可变 candidate tarball `/tmp/inquiry-provider-bound-original-20261028/gyoungwe-pi-inquiry-0.1.0.tgz` SHA-256 `bb87b1e4dda4bfae2456751853b2b79fdeb959745e89cbd04b810ff4c470034f`，API Node-helper candidate SHA `dd1a78e3fab1d2f6aefdc93e570b6e064f171b573c55e32c94db459678a1fd2f`。实际 npm 安装→installed source catalog→真实 SDK consumer→generic provider→普通受限 worker→生产 Desktop host ports/真实 JsonStore→WASM SQL，通过 `/tmp/inquiry-provider-sdk-3.log`。真实 bridge binding 持有同一 provider factory（计数 1），不是 rendered UI；原 project、原字节备份、原路径 restore、实际旧 SQLite writer 排他与关闭后交接均回读通过。service-only provider 无持久 native/UI attachment 时每次短 lease 会关闭，旧 root handles 正确失效；未用全局 owner 或路径 JSON 复活权限。正式 GUI **NOT_RUN**。
