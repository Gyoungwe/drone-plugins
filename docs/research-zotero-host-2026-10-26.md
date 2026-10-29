# Research / Zotero host adapter slice (2026-10-26)

状态：**代码切片完成；真实外部工作流未验收**。

本轮为 `pi-research` 增加了 `/host` 可导出的 `zoteroHostLoader` / `registerZoteroHost`。它只接收宿主注入的 `ZoteroHostPort.read(path)`，调用既有 exact DOI reconciliation，返回 item/attachment 的 metadata-only 回执；凭据、网络、响应大小、授权和写回均由组合根负责。适配器没有 Electron、Pi SDK、Node 文件或网络 import。

已验证：

- `zotero-host.test.ts` 覆盖 versioned loader、注册、无效 DOI 在 transport 前拒绝，以及不完整响应保持 `unknown`。
- `pi-research` typecheck/build/test/smoke 的候选门禁在本切片后应重跑；本文件不把 fixture 或静态导入当作外部成功。
- 既有 `desktopRuntime` 仍只提供 read-only research run `status` / `listRuns`；本轮没有虚构未在宿主注册的 Zotero capability。

未关闭边界：

- 当前公开 `window.DroneUI` 没有 Zotero runtime binding，因此没有新增 Zotero UI page；`desktop-ui-pack` 仍只挂 Research status panel。
- 没有可用的真实 Zotero Desktop / Web API 目标、用户凭据或正式安装包 GUI，因此本轮真实探测、写入、写后回读、停用/恢复生命周期均为 `NOT_RUN`。
- Zotero 外部写入仍要求宿主授权与 read-back；本 adapter 仅为只读 identity seam，不改变该门禁。
