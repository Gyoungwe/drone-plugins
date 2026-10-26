# P2 知识后台实例化与宿主退出计划

2026-10-26。依据已批准的“通用 Pi 宿主 + 可卸载功能插件”架构。**这是待继续实施的垂直迁移设计；同包 UI 完成不等于 P2 完成。** 相关候选与测试见 [同包迁移记录](knowledge-ui-co-package-2026-10-26.md)。不得因新增 factory 或协议接口便关闭宿主独立性验收。

## 1. 当前实质边界

| 代码 | 当前状态与必须解决的问题 |
| --- | --- |
| `pi-knowledge/src/core/runtime-host.ts` | 全模块可变 host callbacks、worker factory、slots、锁。configure 合并不同调用者，模块副本再靠 process 桥连接；不能作为应用实例所有权。 |
| `core/config.ts` | 已有 state factory，但原目录选择仍读取 process.env。0.2 顶层 convenience API 暂保留；新 factory 固定目录，应用 A 的环境变化不得改变 B。 |
| `core/service.ts` | 按 index.sqlite 路径池化 worker，却经 process event 交换 service 对象。替换原先先开新 worker 再 drain 旧 worker；worker 启动就写 schema/迁移/FTS，不能并行。 |
| `core/{ui-state,specialist-host}.ts` | 模块导入即注册 process listener；UI flows、specialist callback、队列与 active guards 必须转入 runtime 实例及会话。 |
| `core/{ui-service,publication,wiki-model-review}.ts` | previews/semantic jobs、WeakSet 证明、模型审核 active set 通过 runtimeSlot 代理。证明与 read tickets 属于会话，不得和应用级索引共享授权语义。 |
| `core/{semantic-settings,review-policy,topic-memory,experience-store}.ts` | 混合直接文件读写、目录选择与队列。接管时需保持旧路径、schema、损坏处理及原子写语义。 |
| `extension/{knowledge-extension,internal-knowledge-extension}.ts` | default extension 创建 worker 配置，内部有 extensionHost 单例。原生/UI 必须绑定同一个领域实例，不能分别 configure 两份 bundle 再广播共享。 |
| 宿主 `backend/src/knowledge/ui.ts` | worker resource、process 生命周期、具名领域方法、WebDAV、研究 run 查询及 workbench 动态入口杂糅；最终删除，不换个 facade 名字继续保留。 |
| 宿主 `knowledge/specialist-*`、`services/knowledge-session`、daily-discovery、maintenance | 领域 prompt、队列/预算、模型审核/维护规划迁插件；通用模型调用、会话身份、审批、取消留宿主。 |

## 2. 实例和写者的所有权

`KnowledgeRuntime` 是插件私有组合根，拥有 binding/config、worker pool、UI state、specialists、publication、review 和 jobs。内部按以下层次组合，不向宿主暴露“万能 knowledge API”：

- **应用/持久化域**：binding store、目录、索引 owner、维护任务及不含会话正文的 UI 通知。一个 Vault 可能绑定多个工作区，不能按 workspaceId 创建多个 index writer。
- **工作区**：project identity、工作区配置、来源与权限边界；不同工作区可以共享只读索引事实，不能共享写入批准。
- **会话/调用**：真实 session identity、证据读取票据、publication proof、preview token、specialist budgets、模型任务和 AbortSignal。会话关闭立即撤销，另一个会话不能复用。

唯一写者标识至少包括规范化的 **Vault 实路径 + 实际 index.sqlite 路径 + 持久化 owner**。同一索引的线程启动、schema 更新、reconcile 和关闭均在这个租约内。替换顺序为资源验证 → 停止旧请求 → drain/确认旧 worker 退出 → 新 worker 启动/验证 → 发布新实例；失败返回错误，不能把已关闭旧 worker 当可用回退。跨目录指向同一 Vault 的配置还必须防止文件级双写，不能只锁 SQLite 文件。

应用内由通用 resource owner 维护租约；CLI 与 Desktop 同时运行则需要双方遵守同一个跨进程写者协议。第一版可以明确拒绝第二个 writer，不能静默允许各自落盘，也不必先建复杂跨进程共享服务。若采用独占租约文件，崩溃残留不能凭 PID 猜测后自动删除；恢复须验证旧进程已退出及所有权，无法证明就报占用。该跨进程租约**尚未实现**。

原生入口保持官方 `(pi) => void` 格式。插件内拆出 `createNativeExtension(runtime)`，默认 CLI 组合自己的 runtime；Drone 的受信任 loader/adapter 将原生工具/hooks 和 Desktop operations 绑定到同一受管领域实例。隔离进程时通过通用调用桥复用实例，不能把函数/Worker/service 对象经 process 全局事件发送。若 native 与 UI 仍各自创建一个 runtime，迁移不能验收通过。

`publication.ts` 用 WeakSet 的对象身份鉴别本进程签发的 proof，并处理 message_update/turn_end/agent_end 投影。JSON 进程传输会丢失对象身份；不能为了跨进程而接受 UI/模型自带的同形 proof。投影和签发必须留在同一个领域 owner，跨进程只发送经校验的结果或作用域绑定的不可伪造回执引用，并验证真实 Pi 事件链。仅代理 registerTool 不能保留这一行为。

当前 P1 runtime 缓存和子进程 context 按 workspace/session 固定；知识需要应用级 owner 与逐调用的可信 workspace/session context，必须在通用 registry 中明确这两个层次，不能把 UI payload 的 sessionId 当真实身份。

## 3. 最小通用能力，不把知识方法搬进宿主 SDK

| 能力 | 宿主只负责 | 插件负责 |
| --- | --- | --- |
| scope/lifecycle | 可信 app/workspace/session 身份、已登记实例、取消/撤销、资源回收 | 领域实例与会话票据；配置、审核和发布规则 |
| files | 已批准 root handle 下的 read/list/stat 与受审批的原子写/删除；路径 containment 与写后回读 | Markdown、frontmatter、Wiki 更新、源链接、重命名/冲突策略 |
| state | 配置 root handle、通用 JSON 原子写/损坏处理和敏感度登记；保留路径映射 | binding/review/semantic 等 schema、版本、迁移、乐观 revision |
| worker/resource | 校验安装包资源、启动受限 worker/process、传递授权 root handles、消息/退出、租约和回收 | SQLite schema/索引算法、watcher、worker 消息协议与健康事实 |
| events | 绑定调用者/实例的 JSON 事件订阅、取消订阅和退出清理 | flow/review/jobs/lifecycle DTO、revision 和投影 |
| models/session | 选定模型的通用 completion/structured output、成本授权、会话仍有效校验、取消；不泄露凭据 | review prompt、五项检查、来源集合、预算、是否 apply 与审计记录 |
| network/secrets | 已配置服务的授权请求与 credential reference；脱敏诊断 | embedding/WebDAV 协议、remoteConsent、重试或冲突政策 |

不得新增 `host.knowledgeSearch`、`host.reviewWiki`、`host.researchRuns` 等专用方法。业务 operations/schema 由插件声明，通用 dispatcher 校验信封和可信身份。没有绑定时返回明确 unconfigured；没有模型、凭据、写权限或有效会话时明确拒绝，不能返回空列表/成功掩盖缺口。

现有 P1 子进程只有包目录读权限，没有 Vault 读写、配置写、worker、网络或模型能力。不能通过给整个知识进程无限制 `--allow-fs-write=Vault` 来绕过逐操作授权。最低可行方式：索引 worker 只获 Vault 读取/监视和专属 index 目录写；领域 Vault 写入通过通用 broker 原子操作；JSON 状态使用 host JsonStore 等价端口。SQLite 原生 worker 的目录授权需包含其 WAL/SHM 文件，但不得扩大为整个用户目录。需要写者租约时先授予租约，再启动 worker。

模型审核还必须在生成前、apply 前重新检查 session identity、trust、binding revision、preview hash 与来源内容；现有 `KnowledgeSessionService` 的 session 生命周期检查迁为通用 session capability，五项领域审核留在插件。P1 固定 500ms 进程关闭限制不能冒充知识 reconcile/drain 成功；取消、优雅关闭与强制终止须分别形成回执。

## 4. 数据路径接管

保留当前 configuration root 下的 `binding.json`、`review-policy.json`、`specialists.json`、`answer-metrics.json`、`<vaultId>/index.sqlite` 与 WAL/SHM、`semantic.json`、wiki-review/model-audits；保留 Vault 笔记和附属文件，以及 agent 根的 daily-discovery、knowledge-maintenance、WebDAV 配置。不得自动复制到另一目录或建立第二份索引。

旧目录到新插件 state root 的映射在安装迁移阶段明确登记到通用 storage grant；CLI 初始 adapter 可以读取既有 `DRONE_KNOWLEDGE_DIR` 一次，注入固定路径。runtime 内不再每次读取/修改进程环境。插件拥有 schema，宿主拥有安全访问/存储机制，迁移回执记录原路径、schema 与新 owner，正文/凭据不得进入证据文档。停用/卸载撤销运行资源但保留数据。

## 5. 分步实现与验收

1. **基础修复（本轮实施）**：config factory 固定目录；default API 为 0.2 consumers 保留，注明 0.3 runtime 迁移完成且全部 consumers 切换后删除；默认 exclusive queue 按 namespace/key 隔离并正确清理；worker 替换 drain 后再启动，失败明确拒绝；未恢复旧 writer 时使用既有 `disabled + reason` 回执，不能报告 `rolled_back`。前一次排队写入的失败仍返回原调用者，仅允许下一次写继续排队，新写错误不被吞掉。测试两个配置实例互不受环境变化影响、锁的并行/串行和失败释放、真实 SQLite worker 不重叠/数据保留/失败恢复。
2. **实例化（待实施）**：`runtime-host.ts` callbacks → factory；`createBindingStore`、`createUiState`、`createServicePool`、`createSpecialistRegistry`、`createPublicationState`、`createReviewCoordinator` 由插件组合。pure 文件解析/图算法保持纯函数。不能只新增未使用的 factory；逐个替换真实调用方。
3. **同实例接入（待实施）**：官方 native adapter 与 optional Desktop factory 复用上述对象；移除 service/UI/specialist 三个 process 桥和模块导入时监听，再迁 publication host adapter。先验证两个独立 runtime、两个同工作区会话、同一 Vault 的两条调用入口。
4. **通用能力补齐（待实施）**：将文件/JSON/worker/模型/事件端口接到 P1 的授权与隔离协议。先建立真实临时目录与 SQLite 回归，再接真实安装包，不用允许任意 fs/Node 权限的假沙箱。
5. **宿主退出（待实施）**：迁 UI service、cloud、maintenance/discovery 和具名业务 schemas；删除 host `knowledge/ui.ts`、相关 process 监听、必需依赖与知识专属资源。研究 run 展示用研究插件贡献，不能移成插件内部依赖。
6. **最终验收（未运行）**：两 SDK 原生真实知识闭环；正式安装包 UI/原生共用 writer；停用恢复与原路径回读；同会话/跨会话/跨工作区隔离；故障退出与单写者；零领域插件 build/start/chat。

受影响回归至少包括插件 `config.test.ts`、`semantic-settings.test.ts`、`ui-state-events.test.ts`、publication/maintenance/category tests，以及宿主 `knowledge-worker-{race,lifecycle,host}`、`knowledge-{service,ui,sdk,specialists-sdk,publication-hooks,lifecycle}`、`services/knowledge-session.test.ts`。宿主当前 fixtures 仍锁公开 0.2.1，不应为候选行为改写这些历史夹具；切换锁后再把“候选启动失败保留仍在线旧 worker”的旧假设改为“旧 writer 已 drain，失败明确可见，修复资源后重试”。

执行状态：基础修复已写入候选源码并验证：最新定向 2 文件 7 测试通过；知识全包 56 文件 398 测试通过；重建后的全仓 `npm run check` 退出 0，含真实 SDK 回归、干净安装及 tarball 检查。最新候选指纹与 gate 日志哈希见 [机器回执](knowledge-ui-co-package-2026-10-26.json)。其余步骤仍未完成。没有新增 process 全局桥，没有删除仍有消费者的公开 API，没有 npm 发布，也没有修改正式 Vault。
