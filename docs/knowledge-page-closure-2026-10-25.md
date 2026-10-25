# 知识整页迁移候选验收（2026-10-25）

本轮实现用户选择的方案 1：完整知识产品 UI 归插件，宿主保留绑定状态、打开文件夹和插件管理默认页。`desktop-ui-pack@0.2.0`、`plugin-api@1.2.0`、`pi-core@0.1.9`、`research-suite@0.1.11` 均为未发布候选；已发布的 knowledge 0.2.1、research 0.2.0 和 suite 0.1.10 不变。

## 归属与历史

- `packages/desktop-ui-pack/ui/knowledge/` 保存原 46 个页面、模型、文案及测试文件。非 squash subtree 结构提交 `3d6d33b` 引入源历史 `f1c4fd1a59e9fbf245412f90147cb3730e91d5a3`；随后行为调整单独提交。
- 插件贡献 `knowledge.page`、`knowledge.surface`、`app.overlay` 和原科研 `panel.tab`；完整页保留其他插件 `knowledge.tab`。
- UI 只通过 `window.DroneUI` 的显式知识服务、公开 store、组件和辅助函数访问宿主。没有 `@drone/*`、Electron、Pi runtime 或 `window.pi` 依赖。数据事件桥由宿主维持，停用插件不停止状态接收。
- 知识样式及中英文文案在插件内维护；作用域 utility 样式不含全局 preflight。React 保持外部引用，由宿主绑定到同一实例。发布包带预构建 `ui/bundle.js`，运行时无额外 graph 库解析。
- 会话/工作区切换会清除上一上下文的笔记选择；过期异步回包不覆盖新 Vault。回归覆盖第三方知识页签返回内置页。

## 候选输入与验证

API/core 的可复现 tarball、SHA-256 和用途见 [vendor/README.md](../vendor/README.md)。发布包清单保持 semver，workspace 锁文件仅用已校验的本地候选 tarball；修正原 suite 嵌套锁条目遗留 core 0.1.3 的问题，实际锁定 0.1.9。

| 检查 | 状态 |
| --- | --- |
| 默认 `npm ci`（无 legacy-peer-deps） | PASS |
| UI 确定性构建、`build:check`、严格 typecheck | PASS |
| UI 单元/交互回归 | PASS：13 文件，51 测试；不等于正式 GUI |
| UI npm pack → 干净安装 → 宿主 React shim 加载四贡献 | PASS；正式 GUI 另见下行 |
| suite 精确版本/工具清单/研究门禁回归 | PASS：3 测试；事件总线 fixture 使用独立 EventEmitter |
| 全仓 `npm run check` | PASS：CSS 修复后最终完整命令 exit 0，另通过独立浏览器隔离回归 |
| 最终 suite tarball 的真实双 SDK 完整工作流 | PASS：Pi 1.1.0 / 1.4.0；各 13 工具调用、1 次原生 UI 批准、两源研究、交付回读 completed；宿主保存原始回执；离线脚本模型不代表科学质量已验证 |
| CSS 浏览器隔离回归 | PASS：独立 Chromium computed style 验证 light/dark、宿主卡片启停快照；另加载正式构建的宿主 CSS 复验 |
| 正式安装包 GUI | PASS：最终 macOS arm64 unsigned/adhoc DMG，完整页面/搜索/阅读/图谱/设置、真实合成候选差异与来源阅读→应用→写后回读、停用/重启/恢复通过；原有 20 个 Markdown 哈希不变，仅新增两份合成验收文件 |
| npm 发布 | NOT_RUN，需具体版本发布授权 |

候选包 SHA-256：`desktop-ui-pack@0.2.0` 为 `c9f468edb8eef41ca6cb7aae613eedd7040ba6be774e16295170e6dd241ddf2a`；`research-suite@0.1.11` 为 `b4bd11dd7c0f440c494bef4144e7d0bdd47a0348ff9bdb2a54a9c0c09f517932`。

本文件不替代正式安装包证据。Zotero 云端、认证 MCP、Protocols.io 写入、其他平台和在线科学质量仍保留原未完成状态；MinerU/GROBID 与 B8 不在本轮范围。

CSS 回归根因：`@theme inline` 输出在插件 wrapper 内生成自引用 `--color-ink:var(--color-ink)`，遮蔽宿主继承值；`@property --tw-*` 注册则不受选择器作用域限制。修复使用 reference theme、插件专属 property 和 layer 名称。浏览器 RED 实测原样式将宿主卡片边框从 3px 改成 0px；修复后浅色/深色输入、列表及宿主启停快照一致。

宿主最终 DMG SHA-256：`a6498216ee13032bb8fe5f29b19f8d11d02d5bb4fd262f66dcaf6e830e29b8bb`。宿主完整记录位于 Drone 仓库 `docs/releases/knowledge-page-closure-2026-10-25.json`。渲染崩溃与第三方知识页签由自动化回归覆盖，未在正式 GUI 人为注入故障。

## 合并后验证

两实现分支已快进合入各自 main 并推送，fetch 后远端 SHA 与本地一致；干净工作区复跑跨仓库 migration/lifecycle 通过，保留迁移历史；本次验证基线为 Drone `f743b41ee64d2a8499332db59d70358ebcd802f4` / drone-plugins `118a01313f7c4bdc9607f4bbff6dae880e75a640`。使用隔离 HOME 和 npm 配置，不设置 `DRONE_PLUGINS_DIR`，通过相邻插件仓库绑定重跑宿主 12 项门禁，以及插件 `npm ci`、完整 `npm run check`。额外浏览器样式检查使用独立临时 profile；精简环境下 Chrome 两次在退出阶段崩溃，恢复桌面环境后相同脚本与浏览器通过，未绕过退出码或断言。命令、退出码和日志摘要保存在 Drone 的机器回执 `docs/releases/knowledge-page-closure-2026-10-25.json` → `implementationMainIntegration`。

插件第一次空缓存安装发现锁文件仍记录较早 API 候选的 integrity，而已提交 tarball 与公开证据 SHA-256 一致；修正锁校验值后独立安装及完整检查通过。未改候选包字节或产品源码。此前缓存下的安装结果不能作为可复现干净安装证明，本次结果替代该项。正式 DMG GUI 和双 SDK 完整流程沿用前轮相同产品源码的真实回执，本次未重新执行 GUI；合并与门禁不表示四个候选版本已发布。
