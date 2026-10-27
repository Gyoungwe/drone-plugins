# P2 知识 UI 同包迁移子项（2026-10-26）

状态：**候选实现；P2 整体未完成；未发布**。本子项在 `codex/native-plugin-architecture` 从插件仓库 `d2f76a0` 开始，执行已批准的原生 Pi + 同包可选 UI 设计。历史 npm 版本及此前真实账户、平台未完成状态不变。

## 文件与职责

- `desktop-ui-pack/ui/{api.ts,entry.tsx,knowledge/,styles/}`、UI test/setup 和 style check 经 `git mv` 迁入 `pi-knowledge`，保留原 Git 历史。没有复制整包或留下两份知识实现。
- `pi-knowledge@0.3.0` 候选继续使用 `pi.extensions → dist/index.mjs`，新增 `plugin.manifest.json → ui/plugin.json`；UI 名称为 `drone-knowledge-ui`，候选 UI 合同为 `droneUi: 2`，仅贡献 `knowledge.page`、`knowledge.surface`；审核 overlay 等未迁功能不注册。worker 与 native/host 入口不导入 UI 或 React。
- 原完整 UI 源码保留在插件内；本轮候选入口只加载插件自有 overview/search 页面，不引用旧知识宿主 API 或图/审核组件。React 仍由宿主提供，浏览器 bundle 保留作用域样式。`scripts/build-ui.mjs` 保持确定性构建，输出哈希纳入 native 包的 build manifest。
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
| pi-knowledge native + UI Vitest | 69 文件、439 测试通过；原知识 UI 回归随源码移动。 |
| desktop-ui-pack Vitest | 1 测试通过；研究面板保留且不导出知识贡献。 |
| pi-knowledge pack native smoke | 官方 Pi SDK 1.1.0 真实会话：首次未配置 status 返回 unconfigured；临时 Vault 配置后两次启动，每次派发 native/internal status，关闭释放固定路径写者锁，第二次可重启。离线确定性 provider；不是完整科研写入闭环。 |
| 双候选私有 API clean install / UI load | 使用显式 API 1.3.0 候选 tarball override，npm pack 后在临时 consumer 安装；不是公开 npm clean install。知识两个 UI export 存在，ResearchStatusPanel 不在知识 bundle 中，贡献互斥；输出明确 `gui: NOT_RUN`。 |
| CSS isolation | 独立 headless Chromium、light/dark 合同 fixture；启停前后宿主 sibling 的颜色、边框和布局一致。不是正式安装包截图。 |
| 插件仓库 npm run check（显式候选 API override） | 退出码 0；含全仓 build、manifest、类型、测试、官方 SDK 1.1.0/1.4.0 研究会话回归、suite PDF Canvas 回执、7 包 clean install 和 npm pack 检查。 |
| Desktop 同 owner 实际 SDK / coordinator / 进程 | 同一知识候选 tarball，经真实宿主 SessionRegistry 和 coordinator 创建 readonly 会话，官方 SDK 1.1.0 离线模型实际派发 status/search；未声明及显式 write 控制工具执行次数为 0。选中会话后的 UI 使用可信 workspaceDirectory 刷新成功，UI 和工具前后同一 domain/index PID，外部新增笔记可见，关闭后二子进程退出、租约释放。临时 Vault，非正式 GUI。 |
| 新架构正式安装包 GUI / lifecycle | NOT_RUN。宿主新发现路径、停用/恢复/卸载、旧 UI 迁移与回滚需后续真实安装包。 |

## 未关闭的 P2 边界

候选 UI 已通过通用 runtime 调用插件自己的 `overview`/`search`，与 Desktop 原生 `knowledge_status`/`knowledge_search` 共享同一 read owner 和受限 SQLite 资源进程。复用原索引算法，Vault 只经已授权文件 broker 读取；SQLite 仅写宿主私有 cache；不启动后台 watch，刷新和搜索真实重建索引。资源租约由宿主 owner group 保留至所有调用与子进程退出。完整 CLI 仍使用完整原生 owner。

Desktop 本片只迁移两个只读工具和概览/搜索页面；图谱、审核、摄入/写入、完整 hooks、模型调用、持久化写端口仍未接入。候选 UI 明确显示未提供能力，不回退调用旧具名 IPC。宿主的知识 service、具名 IPC 与三个 legacy process 桥仍需退出；旧 compatibility pool 没有启用新租约。零领域插件宿主和正式 GUI 生命周期仍未验收。

`droneUi: 2` 让仅支持 v1 的旧宿主在加载前拒绝候选；新宿主只接受有已验证 installed desktopRuntime 来源的 v2 UI。候选使用 API 1.3 的 runtime/native/resource 合同，但 API 尚未公开；正式发布前必须先发布并验证 API 1.3，再更新依赖最低版本和锁文件。当前私有 override 不能作为公开安装 PASS。

无 npm 发布、无正式 Vault 修改、无外部账户写入；四项用户保留未完成验收、B8/B8-2 与 MinerU/GROBID 暂缓项未改动。

机器回执与候选 tarball 指纹见 [JSON 证据](knowledge-ui-co-package-2026-10-26.json)。全仓日志 sha256 记录于该文件；候选均未发布。最初 UI 同包切片没有改 native 行为；后续 [runtime 实例化切片](native-knowledge-runtime-plan.md) 已修改 config/锁/worker 替换、显式资源实例、关闭 barrier 和新 owner 租约并重建 native 产物，本页 JSON 指纹与全仓门禁现已更新到该修复后的候选。

本轮新增 `application-state` 候选权限声明，限配置/索引目录和固定本机租约目录；这不是沙箱自动授权。显式 owner 的本机同用户租约有真实进程/SQLite 回归，候选默认 CLI 已完整注入 owner 并启用租约，正常 SDK shutdown 排空并释放；旧 Desktop compatibility pool 仍未启用。UI/service/specialist 的旧 process 桥仍为 3 处，新 native owner 不广播对象；publication proof 与 ticket 按会话隔离并在关闭时撤销。Desktop 只读 UI/native 同 owner 已通过官方 SDK 模型派发与双受限进程验收；正式 GUI 和完整科研写入闭环仍未验收。

验收执行说明：只读工具 effect 声明修复后，重新构建并执行真实 SDK 回执。中间一次全仓运行在末尾 `pack:check` 与 suite 文档同步构建并发，npm 返回 tarball 读取失败；该次不计 PASS。最终只采用停止并行构建后的完整门禁，指纹见 JSON。私有 API override 是明确的候选输入，不写入正式依赖。

旧宿主 obsidian/0.2 compatibility hook 在已有 `DRONE_KNOWLEDGE_DIR` 绑定时仍可能创建未参与新租约的 owner。正式候选的隔离 profile 只能证明本片，不能据此宣称已有绑定升级或完整 P2 完成；移除旧入口必须后续完成。

真实 coordinator 最终回执通过后，证据已更新；对应 opt-in 宿主回归为 `packages/backend/test/packed-knowledge-runtime-sdk.test.mjs`。它覆盖真实 readonly 会话，不再以静态 scope harness 代替宿主身份解析。此证据更新不改包内容，继续使用 JSON 中的 `352444917…` 知识 tarball。
