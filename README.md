# Drone Plugins

Drone 的独立插件 workspace。它承载可独立安装、升级、禁用和卸载的能力插件与 Desktop UI Pack；Drone Desktop 宿主、backend、IPC、安全边界和公开合同仍维护在主仓库。

## 当前状态

仓库已进入首个插件迁移阶段：`pi-knowledge` 作为独立的 `@gyoungwe` 包发布，运行时使用提交在本仓库内的自包含 bundle；宿主实现和私有源代码不作为外部依赖。

| 包 | 目的 | 状态 |
|---|---|---|
| `@gyoungwe/pi-core` | 任务运行时及 Tasks、Workbench、Research status 面板 | 0.3.0 候选合并 Workbench 工具及面板和 Research status 面板 |
| `@gyoungwe/pi-research` | 研究证据、来源闭环与连接器 | 公开 0.2.0；0.4.0 候选合并连接器注册表及 `connector_list`、`connector_get` |
| `@gyoungwe/pi-knowledge` | 原生 Pi 知识 / Vault 与同包可选 UI | 公开 0.2.1；0.3.0 同包 UI 为未发布候选，见下方迁移记录 |
| `@gyoungwe/pi-analysis` | 原生 Pi 科学分析 adapter/readiness 门禁 | 自包含 bundle、manifest、registration test、tarball + Pi loader smoke 已通过 |
| `@gyoungwe/research-suite` | 聚合包 | 公开 0.1.11；0.3.0 候选捆绑 `pi-core@0.3.0`、`pi-knowledge@0.3.0` 和 `pi-research@0.4.0` |

当前有 8 个工作区。升级到合并后的候选包前，卸载曾单独安装的 `@gyoungwe/desktop-ui-pack`、`@gyoungwe/pi-workbench` 和 `@gyoungwe/pi-connectors`，以免重复注册工具或界面贡献。

2026-10-29 原生架构候选新增 `pi-inquiry@0.1.0`：原 SQLite 领域代码保留 Git 历史，同包标准 Pi 入口、受管理 runtime 与可选 UI 共用原格式 SQL/WASM owner。根构建和完整检查已登记该包；当前来源与实际 SDK/UI 范围见 [Inquiry 候选记录](docs/inquiry-sqlite-migration-candidate.md)。它尚未发布，宿主旧 Inquiry 投影/rerun 路径及正式安装包验收仍未完成。

## 开发门槛

```sh
node scripts/prepare-plugin-api.mjs
npm ci
npm run check
```

准备脚本从 Drone GitHub Release 验证 Plugin API 的 SHA-256 和锁文件 SRI，并预填 npm 缓存。`npm run check` 构建各包，再检查构建产物、包级行为和干净安装。构建将已验证的 Plugin API 文件放入运行时包的 `bundleDependencies`，`research-suite` 还捆绑锁定的三个插件。`pi-research` 的 Plugin API peer 为宿主提供的可选类型依赖。

离线安装需要已验证的绝对路径 tarball 和已缓存的第三方依赖。使用 `DRONE_PLUGIN_API_TARBALL=/absolute/plugin-api.tgz node scripts/prepare-plugin-api.mjs --offline -- npm ci --offline --ignore-scripts --no-audit --no-fund`。随后可用相同的 `--offline -- npm run check` 包装命令传递已验证的 API。未发布的同版本开发包可使用 `--worktree --sha256 <hex> -- npm run check`，脚本会在临时副本重新锁定和安装依赖。

获授权的发布从 GitHub Actions 的 **Publish plugin release** 手动选择一个 workspace，填写与清单一致的 `expected_version`。工作流要求受保护的 `main` 和可公开的包，在干净安装并加载打包文件后创建 `<slug>-vX.Y.Z` 草稿，回读校验后发布 `.tgz` 与 `SHA256SUMS`。

Knowledge category precedence and the 0.2.1 / suite 0.1.10 source candidates are documented in [the category repair record](docs/knowledge-category-fix.md). The repair record preserves its historical scope; public release verification is recorded separately below.

2026-10-25 的 0.2.1 / 0.2.0 / 0.1.10 正式发布、公开包验收与完整性回读见 [发布记录](docs/knowledge-research-npm-2026-10-25.md)。三个版本均已公开，其他账户与平台边界保持未完成。

知识整页迁移、候选合同和原生 suite 收口状态见 [2026-10-25 候选验收](docs/knowledge-page-closure-2026-10-25.md)。

2026-10-26 原生 Pi 同包知识 UI 迁移子项、旧 UI 停用顺序与尚未完成的后端边界见 [迁移记录](docs/knowledge-ui-co-package-2026-10-26.md)。这不是新版本发布或整个 P2 完成声明。

P2 后台依赖、通用能力、单写者和旧数据接管方案见 [知识 runtime 迁移计划](docs/native-knowledge-runtime-plan.md)。其中基础修复、显式 owner 与完整原生组合已有真实 SDK 回归；Desktop 只读概览/搜索与两原生工具已通过同 owner、授权 broker、双受限进程和实际 SDK 派发；完整 Desktop 业务、旧桥与宿主后台退出仍未完成。

同 owner 的知识正文/双向链接/图谱/分类/jobs 阅读闭包与 CLI transport 抽取见 [阅读闭包候选](docs/native-knowledge-reading-2026-10-26.md)；这仍不代表完整 Desktop 迁移或正式发布。

审核策略的异步状态端口、独立授权设置写入和剩余 owner 边界见 [状态与设置候选](docs/native-knowledge-state-2026-10-26.md)。

候选审阅列表、精确只读预览、真实 coordinator 范围与剩余审核写入见 [审阅阅读候选](docs/native-knowledge-review-2026-10-26.md)。
