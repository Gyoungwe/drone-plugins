# Drone Plugins 协作规则

- 插件只能依赖已发布的 `@drone/plugin-api`、公开结果/证据合同和声明过的 Pi `peerDependencies`。
- 禁止 import Drone 源码相对路径、Electron、backend 私有模块、renderer 私有模块或 Pi runtime 的重复副本。
- 每个可发布插件必须有 `plugin.manifest.json`，声明 `pluginApi`、`resultContract`、宿主、能力、权限和 entrypoints。
- manifest 是声明，不是安全边界；高风险写入、远程执行、删除和发布仍由宿主授权。
- 插件必须支持 `compatible`、`degraded` 或 `incompatible` 的加载结果，并保留文本/JSON 降级路径。
- UI 插件默认贡献 `panel.tab`、`rail.view`、`context.action` 或 `command`；只有完整持久工作区才申请 `nav.item`。
- 不提交凭据、Vault、session 正文、`results/` 或本机私有状态。

当前宿主基线：Pi `1.1.0`、Plugin API `1`、结果/证据合同 `drone-result/v3`。
