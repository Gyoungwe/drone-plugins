# P2 知识 UI 同包迁移子项（2026-10-26）

状态：**候选实现；P2 整体未完成；未发布**。本子项在 `codex/native-plugin-architecture` 从插件仓库 `d2f76a0` 开始，执行已批准的原生 Pi + 同包可选 UI 设计。历史 npm 版本及此前真实账户、平台未完成状态不变。

## 文件与职责

- `desktop-ui-pack/ui/{api.ts,entry.tsx,knowledge/,styles/}`、UI test/setup 和 style check 经 `git mv` 迁入 `pi-knowledge`，保留原 Git 历史。没有复制整包或留下两份知识实现。
- `pi-knowledge@0.3.0` 候选继续使用 `pi.extensions → dist/index.mjs`，新增 `plugin.manifest.json → ui/plugin.json`；UI 名称为 `drone-knowledge-ui`，仅贡献 `knowledge.page`、`knowledge.surface`、`app.overlay`。worker 与 native/host 入口不导入 UI 或 React。
- 知识图依赖随 UI 迁移；React 仍由宿主提供，浏览器 bundle 自包含图依赖和作用域样式。`scripts/build-ui.mjs` 保持确定性构建，输出哈希纳入 native 包的 build manifest。
- `desktop-ui-pack@0.3.0` 候选只保留 ResearchStatusPanel / panel.tab，删除知识贡献、图依赖与写权限声明。双候选 clean install 检查贡献标识不重叠。
- `research-suite@0.2.0` 候选组合 core 0.1.9、knowledge 0.3.0、research 0.2.0；不引入原本不存在的 desktop-ui-pack 依赖。嵌套 knowledge 的 UI 文件随 tarball 提供，原生 Pi 仍只加载三个 native entry。宿主嵌套 UI 自动发现尚需另外验收。
- 知识包新增 native/UI 分组测试配置，root `check:pi-knowledge` 纳入完整类型、测试、pack/load 检查。修正两个原有测试的隐式 any / process 自定义事件类型错误，使原来未被 root gate 执行的 knowledge typecheck 真实通过；未更改对应领域行为。

## 升级和回退顺序

1. 保留原 Vault、绑定、审核和账户配置，不迁移或删除数据。
2. 启用 pi-knowledge 0.3.0 UI 前，先停用或移除仍含知识贡献的 **desktop-ui-pack 0.2.0**。该公开包不会被改写；新候选没有伪称能自动消除旧版本的重复贡献。
3. 安装知识候选，按需要另装仅研究面板的 desktop-ui-pack 0.3.0。应核对插件管理来源为 pi-knowledge / drone-knowledge-ui。
4. 回退时先停用新知识 UI，再恢复 desktop-ui-pack 0.2.0，并复查原绑定与笔记。此处是待正式安装包执行的步骤，不是已通过 GUI 回执。

## 已执行检查与证据范围

| 检查 | 结果与范围 |
| --- | --- |
| 两直接包 build / build:check / typecheck | 通过；UI 构建在 pi-knowledge 包内，不依赖宿主源码。 |
| pi-knowledge native + UI Vitest | 60 文件、411 测试通过；原知识 UI 回归随源码移动。 |
| desktop-ui-pack Vitest | 1 测试通过；研究面板保留且不导出知识贡献。 |
| pi-knowledge pack native smoke | 官方 Pi SDK 1.1.0 的真实 AgentSession，离线确定性 provider 实际派发 1 次 knowledge_status，返回 unconfigured；无 Vault 自动创建。这个切片不是完整知识工作流验收。 |
| 双候选 clean install / UI load | npm pack 后在临时 consumer 安装，知识三个 UI export 存在，ResearchStatusPanel 不在知识 bundle 中，贡献互斥；输出明确 `gui: NOT_RUN`。 |
| CSS isolation | 独立 headless Chromium、light/dark 合同 fixture；启停前后宿主 sibling 的颜色、边框和布局一致。不是正式安装包截图。 |
| 插件仓库 npm run check | 退出码 0；含全仓 build、manifest、类型、测试、官方 SDK 1.1.0/1.4.0 研究会话回归、suite PDF Canvas 回执、7 包 clean install 和 npm pack 检查。 |
| 新架构正式安装包 GUI / lifecycle | NOT_RUN。宿主新发现路径、停用/恢复/卸载、旧 UI 迁移与回滚需后续真实安装包。 |

## 未关闭的 P2 边界

知识 UI 暂时仍通过已发布 `window.DroneUI.knowledge` 端口和共享状态取数，宿主的知识 service、具名 IPC、持久化、worker 生命周期及 process 事件桥仍未迁完。需继续接通新的通用插件 runtime contract，并移除宿主业务实现及必需编译/打包依赖，才可声明领域真正插件化。单纯把 UI 移到知识包，不代表零插件宿主可以运行。

无 npm 发布、无正式 Vault 修改、无外部账户写入；四项用户保留未完成验收、B8/B8-2 与 MinerU/GROBID 暂缓项未改动。

机器回执与候选 tarball 指纹见 [JSON 证据](knowledge-ui-co-package-2026-10-26.json)。全仓日志 sha256 记录于该文件；候选均未发布。最初 UI 同包切片没有改 native 行为；后续 [runtime 实例化切片](native-knowledge-runtime-plan.md) 已修改 config/锁/worker 替换、显式资源实例、关闭 barrier 和新 owner 租约并重建 native 产物，本页 JSON 指纹与全仓门禁现已更新到该修复后的候选。

本轮新增 `application-state` 候选权限声明，限配置/索引目录和固定本机租约目录；这不是沙箱自动授权。显式 owner 的本机同用户租约有真实进程/SQLite 回归，旧 native/Desktop compatibility owner 的租约仍未启用，因为完整共享 owner 与正常退出 dispose 尚未接通。UI/service/specialist 的旧 process 桥仍为 3 处，publication proof 身份校验未放宽。全量 native 注入与正式 GUI 仍未验收。
