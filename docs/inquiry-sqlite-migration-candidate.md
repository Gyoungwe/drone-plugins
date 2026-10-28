# Inquiry canonical SQL 迁移候选

2026-10-28；私有、未发布的 `pi-inquiry` 结构切片，尚未提供生产 provider、native tools/UI 或 binary 持久化。不得以本页关闭 Inquiry/P5。

历史从 Drone `packages/inquiry` 通过 `git subtree split` 导出为 `b69e05ff42fca1207ef4100570fed58dd9c537b4`，以非 squash subtree merge `895b2f0` 导入本仓库 `packages/pi-inquiry`。原 author/date/提交链仍可达；追溯 SQL 可查看该 split commit 下的 `src/storage.ts` 历史，subtree merge 元数据记录前缀。宿主旧入口暂作为基准，待实际 provider/原数据切换完成后删除，不会同时启用两个 writer。

`sqlite-storage.ts` 持有唯一的 canonical SQL/schema/记录验证；内部 `sqlite-connection.ts` 只描述 exec/prepare(get/all/run)、串行写入与关闭。原 `storage.ts` 的 Node SQLite adapter 委托同一类，保留原文件/队列行为；文件与内存 adapter、模型、lineage、provenance 和领域 service 已同源导入。未将 SQLite 改成 JSON。

纯结构后 TypeScript 检查和原 19 项 Node/领域测试通过，日志 `/tmp/inquiry-sql-structure-type-2.log`、`/tmp/inquiry-sql-structure-node-tests-2.log`。这不是 clean-installed plugin/正式 GUI 证据；新包仍是 private migration candidate，未登记可用生产服务。

后继：sql.js adapter 消费同一 SQL，运行 Node/WASM 等价、schema v1/v2、所有领域功能；精确 binary-state 合同经宿主审查后再实现原路径 CAS/备份/WAL/单writer恢复；最终替换旧宿主入口及通路，完成 SDK/UI 与正式安装包验收。普通 domain worker 不重新开放 `node:sqlite`。
