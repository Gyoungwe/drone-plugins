# P2：显式历史读窗导入

状态：源码与实际同 tar SDK 切片通过；完整 P2/正式包 GUI 尚未完成。

`knowledge-migrate-recovery` 是 0.3 managed native 的显式前台命令，不接受目标/路径/会话参数。沿真实 caller.scope、session.inspect 与 records own namespace 执行；inspect/commit 分别经过宿主实际 write 授权。迁移仅声明 0.2.0/0.2.1 的 `drone-knowledge-recovery-v1`，必须在 0.4.0 前删除该清单和命令。旧条目 provenance 保持 unknown，不推断发布版本或 creator。

数据边界只导入不超过 8 个历史读窗：合法相对路径、hash、session/scope/Vault binding、窗口与 consumed 标记。未知 grant/proof/root 字段不会复制；`used:true` 保留，`evicted:false` 等待未来真实 eviction。导入元数据不会生成 live WeakSet 权威、当前已读 ticket、文件授权或 publication proof。

本轮新增校验分别保护外部持久化 JSON、宿主 IPC tagged result、实际来源会话/工作区、当前 Vault 绑定、独立外部写入授权及写后 durable 回读；没有在同一内部调用链重复解码。existing own checkpoint 使用同一严格 decoder，损坏数据不会被静默忽略。写后绑定变化或取消均不报告成功。

实际 SDK 覆盖 non-durable、malformed legacy/own、foreign scope/binding、伪造权限字段、consumed window、重复导入、原 legacy 保留、真实审批中止与零写后回执；三条真实会话按创建顺序完整关闭。宿主日志 `/tmp/knowledge-adoption-timer-green.log` 两项通过（迁移闭环和最小共享 owner 关闭），使用真实 clean install、独立 Node26 worker、SQLite resource、SDK records 和授权 broker。候选 knowledge tar SHA256 `6ec6c8b1afdf0310f66b27306280de8c8c90ca91259214a3e9a23ff93162f0fa`，API tar SHA256 `79b5d34ad78355129beb52a09dc63fa445d9ddb82bb1f3d05ccd6ce056eed9aa`。

真实多会话清理 RED 的最小复现是首会话打开索引、另一会话仅普通 Hello。已完成的主题探测残留 600ms timer，使最后关闭进程撞上既有 500ms 关闭边界；完成或超时都在 finally 清理原 timer 后，按创建顺序关闭通过。没有增加 timeout、重试或绕过 shutdown barrier。临时定位日志全部从源码删除。

插件 source typecheck、76 文件 446 测试通过。严格策略异步测试先完成真实 index reconcile，再断言 unread Wiki 拒绝，避免冷索引 coverage 先失败掩盖该测试的目标；没有放宽拒绝强度。

未完成项：真实 managed eviction 后的 reread 闭环、child scope、全树/未打开历史、task privileged provider 组合、explainer archive、旧 host 领域算法删除与正式安装包 GUI。当前文本不宣称这些已完成。

最终冻结：source `512043e`（前置 read effects `331a19f`、timer 修复 `bb26228`），official build `05cf187`；最终 knowledge tar SHA256 `850513debaed231e52263497407fc85618d33e6efb4eca214af9e71d9d06bec4`，同 API `79b5d34ad78355129beb52a09dc63fa445d9ddb82bb1f3d05ccd6ce056eed9aa`。最终相同 tar 的完整 publication、migration、共享 owner shutdown 三项实际 SDK 通过，日志 `/tmp/knowledge-adoption-frozen-packed.log`。这替代上一段临时 `6ec6…` 包作为本批最终回执；上一条仍是 timer RED→GREEN 的历史事实。

诊断后继：source `02973ed` / official build `af91f79` 删除 probe 的笼统 catch，配置/绑定/内部错误继续上抛；唯一已定义的 600ms optional deadline 使用固定无正文警告并保持普通聊天，finally 清 timer。source 446/446 与 TSC 通过；新 tar `8b06ea6973338ec9ea39c1f637d589e64f272ca25fb2f26aea398f60d3134772` 的实际 migration、共享 owner close 通过；完整 publication→新 branch→全树 HTML 历史/私有协议回归通过。native official SDK smoke、带实际匹配私有 API 的 UI clean-install smoke 通过；GUI 未运行。
