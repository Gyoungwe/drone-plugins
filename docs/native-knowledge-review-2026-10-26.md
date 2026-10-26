# P2 审阅阅读候选 — 2026-10-26

本片状态 **PARTIAL**：候选包提供 `reviews` 与 `previewReview`，不提供应用、拒绝、模型审核或写入票据。公开版本仍为 knowledge 0.2.1 / desktop-ui-pack 0.2.0 / suite 0.1.11；本片 0.3.0 / 0.3.0 / 0.2.0 未发布。机器回执见 [JSON](native-knowledge-review-2026-10-26.json)。

- `core/wiki-review-reader.ts` 是 CLI 与 Desktop 共用的列表/预览算法；目标规则、托管块和 immutable hash 复用 `wiki-policy.ts`。状态文档仍位于现有 `<vaultId>/wiki-review/{pending,reviewed}`，没有搬动数据或读取状态根的父目录。
- 列表沿用已有前 100 个有序候选文件的读取预算；total 是该有界范围中的当前项目结果，不是无限量归档总数。真实项目来自可信 caller。应用级无项目返回明确 `project:null` 空列表，跨项目预览拒绝；binding revision 和 proposalHash 变化要求刷新。损坏 JSON 显示诊断，权限撤销向上传递；pending JSON null 不得回退到 reviewed 旧文档。
- SQLite 读取当前来源 hash，预览保留原文/候选/人工保护正文及来源行号，不创建模型阅读票据。`canApply` 只是历史内容条件，不是授权；纯 UI 不提供写按钮。
- 插件页面自有 store、纯差异视图和来源导航；刷新/会话变更撤销旧预览。旧 CLI 也消费同一 reader，真实 SQLite 测试核对两者投影相同。

固定 knowledge tarball SHA256：`fb8a0c39138096b14cdbea1da8f56dbb5e7f7eb2b81758da2eb3e10b6fe2bc1d`。私有 API 1.3 候选 SHA256：`202a7572e4dae9a6ea77bd14191d7c98666b7c0570a92ed68aec6ede66b85622`。安装的是私有 tarball，不是公共 registry 完成证明；依赖最低版本与正式发布顺序仍待 API 1.3 发布后处理。

包门禁通过 77 文件、471 项测试及干净安装/原生 SDK smoke。真实宿主 coordinator + Pi 1.1 离线模型会话通过原生读工具回归；审阅 operations 经真实 coordinator 验证 app/alpha/beta 隔离、精确文本与行号/hash、stale/tampered 拒绝、来源/目标变化、无审阅文件写入，以及关闭进程与租约释放。报告 SHA256：`1cd6cca347a65a4a878528ac814589cf31185a2f319aa1813a2693aac3946d53`。该证据不等同于审阅 GUI：本片 GUI **NOT_RUN**，将与完整服务迁移统一验收；68012bd 设置候选的 GUI 证据保留独立身份。

一次全仓 PDF clean-install 未装到 Canvas macOS 原生可选依赖。隔离诊断重装通过，匹配平台的 optional dependency/lock/下载/`.node` 均存在，但原失败临时目录已由原门禁删除，不能确认根因；保留 **UNRESOLVED_NOT_REPRODUCED**，不称为已修复。之前阅读候选的一次未复现 cleanup AggregateError 也继续保留。最终相关门禁回执和日志指纹写在 JSON，不跳过失败门禁。

下一片继续完整 Desktop service pool 与受管 resource transport、semantic settings 和 metrics 端口。完整原生 hooks/proof、审核写入、绑定初始化、完整 Home、宿主旧门面删除均未完成；本片不扩大到暂缓的 B8 或外部账户验收。
