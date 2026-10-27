# `@gyoungwe/pi-core` 迁移记录

2026-10-27，`@gyoungwe/pi-core` 已从 Drone 宿主仓库迁入本仓库的
`packages/pi-core/`。迁移使用 `git subtree split --prefix=packages/pi-core`，再以非 squash
subtree merge 导入；因此原包提交历史仍可从 merge commit `b87464c` 的第二父提交
`826afa9d62403b1ee32fe915c6dbfc039e57306f` 追溯，而不是复制一个无历史的新目录。

## 当前状态

- 源码、测试和 `package.json` 已进入插件仓库 workspace。
- 尚未把这次迁移标为可发布插件：`0f6b4ae` 已将 tasks runtime 的编译产物复制到
  `packages/pi-core/src/task-runtime/`，并移除 pi-core 对 `@drone/tasks` 的直接运行时依赖；当前源码仍引用 Drone 内部的
  `@drone/shared`，构建脚本/独立 tsconfig/manifest 仍未接线。
- 在插件仓库运行 `npm run --workspace @gyoungwe/pi-core typecheck` 会失败，包含缺失
  `tsconfig.base.json`、缺失内部包和 Pi SDK 类型解析错误。这个失败是迁移边界证据，不能
  通过添加相对路径依赖或把宿主源码打包进插件来绕过。
- `npm run check:manifests` 目前也会按预期拒绝该 staging 状态：`packages/pi-core/` 尚未
  有可验证的 `plugin.manifest.json`。临时 manifest、构建脚本和 workspace check 接线已撤回，
  避免把必失败的门禁伪装成已迁移。

## 依赖拆分证据

`registerPiCore` 依赖 `@drone/tasks/runtime`；该 runtime 在宿主的
`packages/tasks/src/runtime/` 下有 20 个模块，其中 `runtime-bridge.ts` 还使用
`@drone/shared` 的 `DroneRuntime`、`Logger` 与 `RuntimeDisposable`。pi-core 的工具源码
另外直接使用 `AskQuestion`/`AskRequest`/`AskResponse`、`MAX_DELIVERED_FILES` 和 todo 合同。
因此仅添加类型声明或把 runtime 路径映射到宿主目录不能形成可安装插件；需要下一轮保留历史地
迁移 runtime，并把这些共享合同下沉到 `@gyoungwe/plugin-api` 或 pi-core 的公开合同后，
再一次性补齐 manifest、独立 tsconfig 和构建门禁。

## 下一步门槛

1. 将 pi-core 使用的共享合同迁到公开 `plugin-api` 或 pi-core 自包含的包内合同；插件不得依赖 `@drone/*`。
2. 为 pi-core 增加独立 `tsconfig`、构建/`--check`、pack smoke 和 L1
   `plugin.manifest.json`，并让工具清单与实际注册工具完全一致。
3. 在插件仓库 `npm run check` 通过后，再考虑宿主锁文件和发布版本同步；当前不更新
   `plugins.lock.json`，也不发布 npm。
