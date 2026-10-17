# Drone Plugins

Drone 的独立插件 workspace。它承载可独立安装、升级、禁用和卸载的能力插件与 Desktop UI Pack；Drone Desktop 宿主、backend、IPC、安全边界和公开合同仍维护在主仓库。

## 当前状态

这是迁移前骨架。第一阶段只冻结包边界、manifest、发布检查和外部安装流程，不假装 `@drone/plugin-api` 已经完成。

| 包 | 目的 | 状态 |
|---|---|---|
| `@drone/desktop-ui-pack` | Desktop UI 插件集合 | manifest / package skeleton |
| `@drone/research-suite` | 聚合包 | package skeleton |

## 开发门槛

```sh
npm install
npm run check
```

迁移插件前必须先在 Drone 主仓库完成合同闸门和 `npm pack` 外部安装 smoke。插件仓库的 CI 以后将针对 Pi `1.1.0`、Desktop 锁定版本、最新稳定版和 canary 运行兼容矩阵。
