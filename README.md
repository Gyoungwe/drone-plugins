# Drone Plugins

Drone 的独立插件 workspace。它承载可独立安装、升级、禁用和卸载的能力插件与 Desktop UI Pack；Drone Desktop 宿主、backend、IPC、安全边界和公开合同仍维护在主仓库。

## 当前状态

仓库已进入首个插件迁移阶段：`pi-knowledge` 作为独立的 `@gyoungwe` 包发布，运行时使用提交在本仓库内的自包含 bundle；宿主实现和私有源代码不作为外部依赖。

| 包 | 目的 | 状态 |
|---|---|---|
| `@gyoungwe/pi-knowledge` | 原生 Pi 知识 / Vault 闭环 | artifact、manifest、package-local build/check/smoke 已通过 |
| `@gyoungwe/pi-analysis` | 原生 Pi 科学分析 adapter/readiness 门禁 | 自包含 bundle、manifest、registration test、tarball + Pi loader smoke 已通过 |
| `@gyoungwe/desktop-ui-pack` | Desktop UI 插件集合 | manifest / package skeleton |
| `@gyoungwe/research-suite` | 聚合包 | 0.1.5，捆绑 pi-core / pi-knowledge / pi-research |

## 开发门槛

```sh
npm ci
npm run build
npm run check
```

`npm run build` 先刷新各插件 bundle；`packages/pi-knowledge` 的 `npm run build:check` 验证 bundle、worker、skill 和内容 manifest；`research-suite` 的构建会把发布版本依赖复制到包内 staging tree，确保 npm tarball 真正包含 bundled dependencies，并检查 `research-workflow` 只由 `pi-research` 提供。`npm run check` 随后运行所有包级检查、干净安装 smoke 和 tarball 形状校验。插件仓库的 CI 以后将针对 Pi `1.1.0`、Desktop 锁定版本、最新稳定版和 canary 运行兼容矩阵。

Knowledge category precedence and the 0.2.1 / suite 0.1.10 source candidates are documented in [the category repair record](docs/knowledge-category-fix.md). These candidate versions are not npm publication evidence.

2026-10-25 的 0.2.1 / 0.2.0 / 0.1.10 发布准备、候选包验收与 npm 认证阻塞见 [发布记录](docs/knowledge-research-npm-2026-10-25.md)。公开发布状态仍为 BLOCKED_AUTH。
