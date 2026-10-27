# P2 审核策略状态与设置候选（2026-10-26）

状态：**部分迁移、未发布**。前一阅读候选 `f26ce487…` 与其回执保持独立，本候选不能覆盖其 GUI/关闭观察。机器指纹与检查结果见 [状态切片回执](native-knowledge-state-2026-10-26.json)。

## 实施边界

审核策略改为共享异步算法，CLI 经本地 JSON 适配，Desktop 经授权 state broker。答案校验与原生 guidance 都等待真实策略读取；延迟策略和真实 SQLite 回归证明严格模式仍检查关联 Wiki，不把 Promise 当作模式值。

设置页提供绑定元数据展示与审核策略。`preferences` 是读操作，`setReviewPolicy` 是写操作；写入需要 `application-state-write` 独立授权、当前绑定版本及预览时的文件版本。旧只读 grant 不自动升级。宿主负责权限和 JSON 事务，插件保留原 `{version:1,mode}` 格式并回读核对；旧版本、损坏 JSON 或撤销授权不会显示保存成功。绑定路径仅展示，不作为新的授权根。设置读取不启动索引进程。

CLI 仍优先采用 `DRONE_REVIEW_MODE=strict`；Desktop 受限运行时不继承该 CLI 环境变量，使用明确状态 JSON，`override:null`。宿主生产 packages/scripts/.pi 源码未发现用该变量施加组织策略的入口。本片没有增加环境读取能力。损坏策略返回严格模式和诊断且禁止覆盖；其他 I/O/权限错误直接上抛，不再沿用旧 catch-all 的静默严格回退。

## 验证和未完成

包内 75 文件、463 测试通过，包括实际 SDK owner/票据隔离、真实 SQLite 的异步策略校验、真实 JSON 原子保存/版本冲突/损坏保留，以及设置 UI 保存、拒绝、刷新和调用撤销。全仓 `npm run check` 已退出 0，含私有候选 clean install/load、Pi 1.1/latest 回归与聚合包/PDF 检查。同一 `68012bd7…` tarball 已通过真实宿主 coordinator/Pi SDK：只读 grant/只读会话拒写、拒绝审批无落盘、批准写后原始字节 hash 回读、过期版本与损坏状态拒绝覆盖、旧绑定拒绝、重启 owner 后保留，以及实际双进程退出和租约释放。默认 CLI 包入口另经真实 SDK 连续两次执行 status/read/search/check，严格预检均 ready、每次 shutdown 释放真实租约；可用 `node scripts/check-native-policy-session.mjs <candidate.tgz> [evidence.json]` 重跑。正式安装包设置 GUI 仍未验收；源级与 SDK 测试不替代它。

完整 Desktop service transport 仍未接入：资源身份不能伪装成本机目录；活跃替换关闭和 activation drain 必须分别处理，不能让 domain.dispose 等待只有随后宿主才会关闭的 child。语义设置、指标、完整 Home、绑定初始化、写入/模型/hooks 与旧宿主 facade 删除仍未完成。正式设置 GUI、公开 API 1.3 发布与最低依赖收口尚未完成。四项外部验收和 B8/B8-2、MinerU/GROBID 暂缓范围保持不变。
