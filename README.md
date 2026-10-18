# Drone Plugins

Drone 的独立插件 workspace。它承载可独立安装、升级、禁用和卸载的能力插件与 Desktop UI Pack；Drone Desktop 宿主、backend、IPC、安全边界和公开合同仍维护在主仓库。

## 当前状态

仓库已进入首个插件迁移阶段：`pi-knowledge` 作为独立的 `@gyoungwe` 包发布，运行时使用提交在本仓库内的自包含 bundle；宿主实现和私有源代码不作为外部依赖。

| 包 | 目的 | 状态 |
|---|---|---|
| `@gyoungwe/pi-knowledge` | 原生 Pi 知识 / Vault 闭环 | artifact、manifest、package-local build/check/smoke 已通过 |
| `@gyoungwe/pi-analysis` | 原生 Pi 科学分析 adapter/readiness 门禁 | 自包含 bundle、manifest、registration test、tarball + Pi loader smoke 已通过 |
| `@gyoungwe/desktop-ui-pack` | Desktop UI 插件集合 | manifest / package skeleton |
| `@gyoungwe/research-suite` | 聚合包 | package skeleton |

## 开发门槛

```sh
npm install
npm run check
```

`packages/pi-knowledge` 的 `npm run build:check` 验证 bundle、worker、skill 和内容 manifest；`packages/pi-analysis` 的 `npm run check` 验证 adapter contract、bundle freshness、registration test，以及实际 npm tarball 安装后的 Pi loader discovery；根 `npm run smoke:install` 会在干净 prefix 中联合安装这些 tarball 并再次验证原生扩展发现。插件仓库的 CI 以后将针对 Pi `1.1.0`、Desktop 锁定版本、最新稳定版和 canary 运行兼容矩阵。
