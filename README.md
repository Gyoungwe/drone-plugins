# Drone Plugins

Drone 的独立插件 workspace。它承载可独立安装、升级、禁用和卸载的能力插件与 Desktop UI Pack；Drone Desktop 宿主、backend、IPC、安全边界和公开合同仍维护在主仓库。

## 当前状态

仓库已进入首个插件迁移阶段：`pi-knowledge` 作为独立的 `@gyoungwe` 包发布，运行时使用提交在本仓库内的自包含 bundle；宿主实现和私有源代码不作为外部依赖。

| 包 | 目的 | 状态 |
|---|---|---|
| `@gyoungwe/pi-research` | 研究证据与来源闭环 | 公开 0.2.0，自包含核心与真实会话验收见发布记录 |
| `@gyoungwe/pi-knowledge` | 原生 Pi 知识 / Vault 与同包可选 UI | 公开 0.2.1；0.3.0 同包 UI 为未发布候选，见下方迁移记录 |
| `@gyoungwe/pi-analysis` | 原生 Pi 科学分析 adapter/readiness 门禁 | 自包含 bundle、manifest、registration test、tarball + Pi loader smoke 已通过 |
| `@gyoungwe/desktop-ui-pack` | 研究状态面板 | 公开 0.2.0 仍含历史知识 UI；0.3.0 候选把知识贡献迁给 pi-knowledge，未发布 |
| `@gyoungwe/research-suite` | 聚合包 | 公开 0.1.11；未发布 0.2.0 候选组合 core 0.1.9 / knowledge 0.3.0 / research 0.2.0 |

## 开发门槛

```sh
npm ci
npm run build
npm run check
```

`npm run build` 先刷新各插件 bundle；`packages/pi-knowledge` 的 `npm run build:check` 验证 bundle、worker、skill 和内容 manifest；`research-suite` 的构建会把发布版本依赖复制到包内 staging tree，确保 npm tarball 真正包含 bundled dependencies，并检查 `research-workflow` 只由 `pi-research` 提供。`npm run check` 随后运行所有包级检查、干净安装 smoke 和 tarball 形状校验。插件仓库的 CI 以后将针对 Pi `1.1.0`、Desktop 锁定版本、最新稳定版和 canary 运行兼容矩阵。

Knowledge category precedence and the 0.2.1 / suite 0.1.10 source candidates are documented in [the category repair record](docs/knowledge-category-fix.md). The repair record preserves its historical scope; public release verification is recorded separately below.

2026-10-25 的 0.2.1 / 0.2.0 / 0.1.10 正式发布、公开包验收与完整性回读见 [发布记录](docs/knowledge-research-npm-2026-10-25.md)。三个版本均已公开，其他账户与平台边界保持未完成。

知识整页迁移、候选合同和原生 suite 收口状态见 [2026-10-25 候选验收](docs/knowledge-page-closure-2026-10-25.md)。

2026-10-26 原生 Pi 同包知识 UI 迁移子项、旧 UI 停用顺序与尚未完成的后端边界见 [迁移记录](docs/knowledge-ui-co-package-2026-10-26.md)。这不是新版本发布或整个 P2 完成声明。

P2 后台依赖、通用能力、单写者和旧数据接管方案见 [知识 runtime 迁移计划](docs/native-knowledge-runtime-plan.md)。其中基础修复、显式 owner 与完整原生组合已有真实 SDK 回归；Desktop 只读概览/搜索与两原生工具已通过同 owner、授权 broker、双受限进程和实际 SDK 派发；完整 Desktop 业务、旧桥与宿主后台退出仍未完成。

同 owner 的知识正文/双向链接/图谱/分类/jobs 阅读闭包与 CLI transport 抽取见 [阅读闭包候选](docs/native-knowledge-reading-2026-10-26.md)；这仍不代表完整 Desktop 迁移或正式发布。

审核策略的异步状态端口、独立授权设置写入和剩余 owner 边界见 [状态与设置候选](docs/native-knowledge-state-2026-10-26.md)。

候选审阅列表、精确只读预览、真实 coordinator 范围与剩余审核写入见 [审阅阅读候选](docs/native-knowledge-review-2026-10-26.md)。
