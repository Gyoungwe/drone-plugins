# Drone Plugins 协作规则

先读 [插件规范](docs/PLUGIN-SPEC.md)。跨仓切流按 Drone 的 `drone-maintenance`；删旧轨、合包和拆大文件按 Drone 仓 `.agents/skills/drone-slimming/SKILL.md`，不复制 Skill。

## 反膨胀红线（必须遵守）

1. **唯一契约所有者。** 领域 schema、验证和 UI 状态只由对应包持有；不要把它们镜像到宿主 `plugin-api` / `shared`，宿主只做受管通用传输和必要投影。公开契约变更遵循已批准的版本迁移。
2. **切流即退役。** 证据表明装包、权限和回读都通过后，切流 PR 同步删除旧实现与废弃入口，不留未批准的 fallback。纯瘦身、迁出与重构跑 `node scripts/check-bloat.mjs --require-net-decrease`，业务净行数必须小于零；不拿测试、文档和产物抵扣。
3. **体积预算。** 新业务文件 ≤350 行；400 行结构棘轮不放宽，超过 500 行或列入防膨胀名单的文件只减不增。`src/` 不新增 `.mjs` 或手写 `.d.mts`；不新建不足千行业务代码的微包，优先并入现有 owner。
4. **不堆过程物。** 新 `docs/` 文件 ≤12 KiB；盘点、验收截图和门禁日志留在 PR，发版归档需明确授权。不新增 Git 追踪的构建产物，不跨仓复制 `SKILL.md`；存量交付产物按棘轮和独立提交规则处理，切流前不直接移除。
5. **研究路径控制 token。** 常驻 `SKILL.md` 新增索引 ≤3 KiB，旧长文只减不增，步骤细节按需读。简单只读查询走快路径，深研必须有预算和停止条件；审批和证据检查仍执行。

## 架构与安全

- 依赖公开 `@gyoungwe/plugin-api`、公开结果/证据合同和声明的 Pi peer；禁止跨仓相对导入 Drone 源码或依赖 Electron、backend/renderer 私有模块及 Pi runtime 副本。基线：Pi `1.1.0`、Plugin API `1`、`drone-result/v3`。
- `plugin.manifest.json` 声明 API、结果合同、宿主、能力、权限和入口；声明不等于授权。插件加载要区分 `compatible` / `degraded` / `incompatible` 并保留文本/JSON 路径；UI 优先 `panel.tab`、`rail.view`、`context.action` 或 `command`。只有完整持久工作区才申请 `nav.item`。
- 外部写入、远程执行、删除或发布须获准；保留路径限制、原子写入及可验证回读。不提交凭据、Vault/会话正文、`results/` 或本地私有状态。不发布 npm、不打 tag。

## 实施与验收

- 先写能失败的行为测试，再按单一职责小步修改。跨包依赖公开接口；IO 经宿主端口。只在信任边界校验；错误默认上抛，不加空 `catch`、默认值掩盖失败、无计划兼容或未要求的重试/开关。
- 不新增 `any`、双重断言、非空断言、模块级 `let`、自写继承、跳过或拉长测试；函数 ≤60 行。注释解释原因，TODO 带工单号，异常兼容明确何时删除。结构与行为分开；生成物不与源码混提，棘轮只降不升。非平凡改动提交前用 code-simplifier 复核本次 diff。
- 跑 `npm run check`；改包入口、合同、资源须验证干净构建、安装及相关宿主门禁。插件包先验收，宿主另开重锁 PR。更新相应包 README；fixture 和 loader 不代表真实会话或安装包 PASS。
