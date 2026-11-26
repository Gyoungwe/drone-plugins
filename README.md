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
npm ci
npm run build
npm run check
```

`npm run build` 刷新各插件 bundle。`packages/pi-knowledge` 的 `npm run build:check` 验证 bundle、worker、skill 和内容 manifest。`research-suite` 将精确锁定的依赖复制到包内 staging tree，确保 npm tarball 包含这些依赖，并检查 `research-workflow` 只由 `pi-research` 提供。`npm run check` 随后运行所有包级检查、干净安装 smoke 和 tarball 形状校验。插件仓库的 CI 以后将针对 Pi `1.1.0`、Desktop 锁定版本、最新稳定版和 canary 运行兼容矩阵。

Knowledge category precedence and the 0.2.1 / suite 0.1.10 source candidates are documented in [the category repair record](docs/knowledge-category-fix.md). The repair record preserves its historical scope; public release verification is recorded separately below.

2026-10-25 的 0.2.1 / 0.2.0 / 0.1.10 正式发布、公开包验收与完整性回读见 [发布记录](docs/knowledge-research-npm-2026-10-25.md)。三个版本均已公开，其他账户与平台边界保持未完成。

知识整页迁移、候选合同和原生 suite 收口状态见 [2026-10-25 候选验收](docs/knowledge-page-closure-2026-10-25.md)。

2026-10-26 原生 Pi 同包知识 UI 迁移子项、旧 UI 停用顺序与尚未完成的后端边界见 [迁移记录](docs/knowledge-ui-co-package-2026-10-26.md)。这不是新版本发布或整个 P2 完成声明。

P2 后台依赖、通用能力、单写者和旧数据接管方案见 [知识 runtime 迁移计划](docs/native-knowledge-runtime-plan.md)。其中基础修复、显式 owner 与完整原生组合已有真实 SDK 回归；Desktop 只读概览/搜索与两原生工具已通过同 owner、授权 broker、双受限进程和实际 SDK 派发；完整 Desktop 业务、旧桥与宿主后台退出仍未完成。

同 owner 的知识正文/双向链接/图谱/分类/jobs 阅读闭包与 CLI transport 抽取见 [阅读闭包候选](docs/native-knowledge-reading-2026-10-26.md)；这仍不代表完整 Desktop 迁移或正式发布。

审核策略的异步状态端口、独立授权设置写入和剩余 owner 边界见 [状态与设置候选](docs/native-knowledge-state-2026-10-26.md)。

候选审阅列表、精确只读预览、真实 coordinator 范围与剩余审核写入见 [审阅阅读候选](docs/native-knowledge-review-2026-10-26.md)。
