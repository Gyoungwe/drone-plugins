# P2 知识阅读闭包候选（2026-10-26）

状态：**阅读闭包候选；完整 P2 未完成；未发布**。前一只读概览/搜索候选及其正式 GUI 证据仍以 [同包迁移回执](knowledge-ui-co-package-2026-10-26.json) 的 `352444917…` tarball 为准，本页新增候选不覆盖旧证据。

## 本轮行为

- 插件自有 `readNote`、`links`、`graph`、`jobs`、`recentByCategory` 五个读操作复用既有 SQLite 算法；同一资源 owner 为 UI 和原生两读工具提供服务。正文保留 hash、行范围、分页、分类与 human-review 段；分页带 `expectedHash`，内容变化时拒绝拼接旧页和新页。
- scope 从宿主可信 `workspaceDirectory` 解析项目，输入不接受 cwd/session/project。应用 scope 仅返回共享内容，会话 scope 返回共享和本项目；图谱缓存包含 scope，双向链接解析、分类及 jobs 均按 scope 过滤。`overview.index.noteCount` 仍表示已批准整 Vault 的索引总量；当前范围计数使用图谱 `totalNotes` 与分类 `counts`。
- UI 阅读不会签发模型阅读证据。真实 native owner 回归先在界面阅读，再请求 evidenceReceipts，仍被拒绝；只有正式工具阅读后才产生有效回执。
- UI 持有自己的阅读/图谱/jobs 状态与导航，复用纯展示组件；候选不加载旧 `ui/api.ts` 或宿主 knowledge store。内部笔记链接经组件回调导航，普通文件与外部链接不打开，原因在页面显示。刷新卸载旧正文后重新从第一页读取新快照；关闭、绑定或会话切换丢弃迟到结果。
- 同时抽取完整 CLI 服务的 transport：`service.ts` 的 prepare/read/search/check/citation/evidence 方法保持原算法，真实 Worker、ready、请求、退出和租约移动到 `worker-transport.ts`。这不等于 Desktop 已接入完整 CLI 服务。

## 验证边界

包内真实 SQLite 回归覆盖共享/两个项目的隔离、图谱缓存 scope 切换、链接两向过滤、分类、jobs 分页、正文行号/hash 与过期 hash 拒绝。临时源码 bundle 已通过真实受限 domain/resource 双进程及输入/输出 schema 检查；源码 bundle 不是 npm 包或正式 GUI 的证据。最终候选已通过完整插件门禁（72 文件、449 知识测试），真实宿主 coordinator/Pi SDK 1.1.0 在生产 capability routing 下连续两次通过五个读操作、输入/结果 schema、scope 切换、分页与 hash、未知/写工具执行为零、同进程与关闭清理；结果和指纹记录于 [机器回执](native-knowledge-reading-2026-10-26.json)。

新 API 1.3 tarball 含通用 Markdown `onLink`，用于私有候选验收，不修改旧 GUI 使用的 API tarball。正式最低依赖、公开 registry clean install 与 npm 发布仍未完成。

## 仍未完成

知识 state/Vault 写入、提案/审核、setup、模型和语义提供者、完整 native hooks/publication、研究与连接器页面仍未迁完。旧宿主 facade、具名 IPC 和 compatibility listeners 尚未删除；旧内置 0.2 owner 不参与新租约，不能用新隔离 profile 验收声称已有绑定升级完成。整页高级功能、零领域插件宿主和正式安装包本轮阅读交互仍需继续验收。四项外部验收和 B8/B8-2、MinerU/GROBID 暂缓范围保持不变。

保留异常观察：真实 coordinator 首轮在功能断言全部通过后，cleanup 抛出未展开的 AggregateError。仅改善测试诊断后，后两轮连续通过；进一步以 3 个并发实例执行 3 轮，9/9 完整 SDK、阅读操作和分阶段清理通过，压力回执索引指纹见机器回执。生产源码未因此修改，原因仍为 `UNRESOLVED_NOT_REPRODUCED`，不能用后续成功称作修复。正式安装包阅读与关闭稳定性仍继续核对。
