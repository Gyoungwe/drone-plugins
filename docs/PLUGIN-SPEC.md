# Drone 插件规范 v1

本文是 Drone 插件（能力插件、UI 插件、组合包）格式与内容的**唯一权威规范**。UI 组件层的细节（槽位 props、样式纪律、热重载）见宿主仓库 `packages/desktop/resources/ui-plugins/SPEC.md`，本文只在需要时引用它。

规范中的「必须」是硬性要求，由 `npm run check` 和验收拦截；「应当」是默认做法，偏离时要在 README 写明原因。平台能力的实现状态以 Drone `docs/pluginization/v3-evidence.md` 和对应门禁结果为准。

---

## 1. 目标与边界

1. **宿主不依赖可选插件。** Drone 在只安装「必需插件」（§6.1）的情况下，必须能启动、通过全部测试、完成核心流程（新任务、知识库、技能与连接、主机）。任何可选插件缺失、损坏或不兼容，只能让对应功能消失或降级，不能让宿主报错、白屏或拒绝启动。
2. **用原生 Pi 包扩展功能。** 新功能以标准 Pi 包（npm 包 + `package.json` 的 `pi` 字段）交付，安装后同时能在原生 Pi 和 Drone Desktop 中使用。Drone 专属能力（界面、能力协商、结果合同）是在 Pi 包之上的**可选增强**，不是另一套插件系统。
3. **宿主只负责机制，插件负责功能。** 宿主提供会话、授权、存储、界面框架和公开合同；领域逻辑（知识、分析、证据、连接器……）放在插件里。

---

## 2. 插件分级

| 级别 | 是什么 | 最低要求 | 在 Drone 中的表现 |
|---|---|---|---|
| **L0 原生 Pi 包** | 任何带 `pi` 字段的 npm 包（第三方也可以） | 符合 Pi 包规范 | 工具、技能、提示词正常可用；在「技能与连接」中显示为通用包；没有专属界面 |
| **L1 Drone 能力插件** | L0 + `plugin.manifest.json` | §4、§5 | 增加能力协商、权限声明展示、结果合同、版本兼容检查 |
| **L2 Drone UI 插件** | 带 `ui/plugin.json`（`droneUi: 1`）的包 | §4、§7 | 挂载到宿主槽位或区域，或作为无头插件运行 |
| **组合包** | 同时满足 L1 和 L2 | 同上 | 能力与界面一起安装、一起启停 |

一个包只发布到一个 npm 名下；能力和界面属于同一功能时，**应当**做成组合包，而不是拆成两个互相依赖的包。

---

## 3. 目录与 `package.json`

```text
packages/<name>/
  package.json             # 必须
  plugin.manifest.json     # L1/L2 必须
  README.md                # 必须：用途、工具清单、权限说明、降级行为
  src/                     # 源码（必须是构建输入，不能只有占位）
  dist/                    # 构建产物，由 src 生成并提交（发布产物必须能从 src 复现）
  skills/<skill>/SKILL.md  # 可选：随包分发的 Pi 技能
  prompts/*.md             # 可选
  ui/plugin.json           # L2：UI 插件清单
  ui/src/                  # L2：UI 入口
  test/                    # 必须：至少一条注册测试 + 一条降级测试
  scripts/build.mjs        # 必须：支持 --check（校验 dist 与 src 一致）
  scripts/smoke.mjs        # 必须：从 npm pack 产物安装后加载
  build-manifest.json      # 必须：artifactSource、输入哈希、输出哈希
```

`package.json` 要求：

| 字段 | 规则 |
|---|---|
| `name` | 第一方用 `@gyoungwe/<name>`；能力插件以 `pi-` 开头 |
| `version` | semver；已发布版本永不覆盖 |
| `type` | `"module"` |
| `pi.extensions` / `pi.skills` / `pi.prompts` | 指向包内相对路径；只能指向本包文件（聚合包 §6.3 除外） |
| `peerDependencies` | Pi 运行时 `@earendil-works/pi-coding-agent: ">=1.1.0 <2.0.0"` 只能作为 peer，**禁止**打包 Pi runtime；纯 UI 包把 `@gyoungwe/plugin-api` 也作为 peer（由宿主提供） |
| `dependencies` | 能力插件：`@gyoungwe/plugin-api: "^1.x"`（构建时打进 `dist`）加普通 npm 库；**禁止**依赖其他 Drone 插件（§6.2） |
| `files` | 显式白名单：`dist`、`lib`、`skills`、`prompts`、`ui`、`plugin.manifest.json`、`build-manifest.json`、`README.md`、`package.json` |
| `keywords` | 包含 `pi-package`，便于 Pi 和用户发现 |
| `scripts` | 必须有 `build`、`build:check`、`test`、`smoke`、`typecheck`，以及串起它们的 `check` |

---

## 4. `plugin.manifest.json`

```json
{
  "schemaVersion": 1,
  "id": "drone-pi-example",
  "version": "0.1.0",
  "pi": { "apiVersion": 1, "minHostVersion": "1.1.0", "testedHosts": ["1.1.0", "latest"] },
  "drone": { "pluginApi": 1, "resultContract": "drone-result/v3" },
  "entrypoints": {
    "extension": "./dist/index.mjs",
    "host": "./dist/host.mjs",
    "worker": "./lib/runtime/worker.mjs",
    "skills": "./skills",
    "ui": "./ui/plugin.json"
  },
  "capabilities": ["analysis"],
  "tools": ["example_status", "example_run"],
  "hosts": ["native-pi", "drone-desktop"],
  "requires": { "hostCapabilities": ["vault-read"] },
  "permissions": {
    "filesystem": ["workspace-read"],
    "network": [],
    "subprocess": [],
    "externalWrites": false
  }
}
```

| 字段 | 规则 |
|---|---|
| `schemaVersion` | 必须为 `1` |
| `id` | 必须匹配 `^drone-[a-z0-9-]+$`，全局唯一，发布后不再更改 |
| `version` | 必须与 `package.json` 的 `version` 一致 |
| `pi.apiVersion`、`pi.minHostVersion` | 必填；`testedHosts` 列出 CI 实际跑过的 Pi 版本 |
| `drone.pluginApi` | 必须为 `1` |
| `drone.resultContract` | 必须为 `drone-result/v3` |
| `entrypoints` | 至少一项；每个路径必须存在，并且包含在 `files` 里。`host` 只供宿主组合根使用（§6.1） |
| `capabilities` | 来自固定词表（§4.1）；不在词表内的值视为错误 |
| `tools` | L1 必填：本包注册的全部工具名；必须与运行时实际注册的完全一致（smoke 校验） |
| `hosts` | `native-pi`、`drone-desktop` 的非空子集；只写 `drone-desktop` 时必须在 README 说明原因 |
| `requires.hostCapabilities` | 依赖的宿主能力，由 `negotiateCapabilities` 协商；缺失时插件必须返回 `degraded` 或 `incompatible`，不能抛错 |
| `permissions` | **如实**声明：`filesystem`（`workspace-read`、`workspace`、`configured-vault`、`vault-read`）、`network`（主机名列表）、`subprocess`（可执行名列表）、`externalWrites`（布尔）。实际行为超出声明即判不合格 |

manifest 是声明，不是安全边界：外部写入、远程执行、删除和发布仍由宿主授权。宿主会在安装确认和插件详情中展示 `permissions` 与 `tools`。

宿主加载能力插件时，应把 manifest 的 `permissions` 传给
`createPermissionedHostPort`（来自 `@gyoungwe/plugin-api`）。该适配器在调用
宿主授权端口前拒绝未声明的文件、网络、子进程和外部写入操作，并产生不含凭据和正文的
`PluginPermissionAuditEvent`。插件直接调用 Node 文件、网络或子进程 API 不会因此获得进程级
隔离；需要真正沙箱时必须由宿主提供独立进程能力并单独验收。

### 4.1 能力词表

取自现有第一方插件已经在用的值：`knowledge`、`research`、`search`、`evidence-context`、`analysis`、`planning`、`files`、`evidence`、`provenance`、`replay`、`connectors`、`read-only`、`provenance-receipts`、`ui`。新增词条需要同时修改本表和 `scripts/check-manifests.mjs`；检查器会校验能力词表。

---

## 5. 能力插件（L1）内容要求

1. **只依赖公开合同。** 只能 import `@gyoungwe/plugin-api`、Node 内置模块和普通 npm 库。禁止 import `@drone/*`、`electron`、Drone 源码相对路径，以及 Pi runtime 的复制品。
2. **工具命名。** 工具名用 `<领域>_<动作>` 小写蛇形，例如 `knowledge_search`；`research_*` 前缀保留给第一方研究流程。不得与已注册的工具重名（第一方插件之间由插件仓库的检查拦截；宿主会在资源诊断中列出第三方包的冲突来源并保留先注册者）。
3. **首次运行要诚实。** 未配置时，状态工具返回 `{ "status": "unconfigured", "next": "<设置命令>" }`，不能假装成功，也不能隐式创建 Vault 或配置。
4. **结果合同。** 产出研究结论的工具，结果必须遵守 `drone-result/v3` 的状态与红线（`ResultStatus`、`ResultRedline`），有证据的地方必须带读取回执。
5. **降级路径。** 每个工具在宿主能力缺失或依赖不可用时，必须返回结构化的 `degraded` / `incompatible` 结果（文本 + JSON），不能抛未处理异常、拖垮会话。
6. **外部副作用。** 写外部系统、删除、远程执行之前，必须通过宿主授权端口（`DroneHostPort` 中的授权请求），并在写后回读。没有授权端口的宿主（原生 Pi）上，这类工具必须改为只读或返回 `incompatible`。
7. **数据边界。** 不在包内、日志或 smoke 输出中写入凭据、Vault 正文、会话正文或 `results/`。
8. **编码尺度。** 遵守 AGENTS.md「编码尺度：不要过度防御」：只在信任边界校验，不写空 `catch`，不写没被要求的兼容层。

---

## 6. 依赖规则

### 6.1 宿主 → 插件

- 宿主只能依赖 Drone `plugins.lock.json` 中列出的**必需插件**；锁文件记录仓库、提交、版本和 tarball sha256，构建时必须校验哈希。
- 宿主代码只能通过插件的 `host` 入口（`@gyoungwe/<pkg>/host`）使用插件，不得深入引用包内路径。
- 锁文件之外的插件都是**可选插件**：宿主代码中不得出现对它们的 import、路径常量或包名硬编码，只能通过运行时发现（Pi 包加载、UI 插件扫描）接入。
- UI 插件从已安装 npm 包的 `plugin.manifest.json` 或 `ui/plugin.json` 中按 `entrypoints.ui` 通用发现；包名不属于宿主源码合同。

### 6.2 插件 → 插件

- 插件之间**不得**互相 import，也不得把另一个 Drone 插件写进 `dependencies`。
- 需要别的插件提供的能力时，声明在 `requires.hostCapabilities` 中，由宿主协商；对方不存在时走降级路径。
- 共享的类型和合同只能放进 `@gyoungwe/plugin-api`，不得从另一个插件包里取。

### 6.3 聚合包

`research-suite` 这类聚合包是唯一允许捆绑其他插件的形态：它只做组合（`bundledDependencies` + `pi.extensions` 指向被捆绑包），自身不包含领域代码，也不得修改被捆绑包的行为。

---

## 7. UI 插件（L2）要求

1. 组件契约、样式纪律、性能和热重载规则全部以宿主的 `ui-plugins/SPEC.md` 为准；本节只补充包级要求。
2. `ui/plugin.json`：`droneUi: 1`、`name` 与包内 `id` 对应、`slots` / `contributions` / `headless` 至少声明一项；未知槽位或区域由宿主忽略并告警。
3. UI 插件只能通过 `window.DroneUI`（stores、hooks、公开 host API）取数据，不得直接请求 IPC 通道或访问 Node。
4. **页面接入优先级：** 优先挂到已有页面的区域（`panel.tab`、`settings.panel`、`knowledge.tab`、`home.section`、`skills.section`），只有完整的独立工作区才用 `rail.view` 新增导航入口，避免一级菜单膨胀。
5. 插件被禁用、卸载或加载失败时，所在区域必须恢复宿主默认状态（宿主已实现：页签回到「任务」，主区回到聊天）。

### 7.1 宿主预留接口（现状）

| 接口 | 状态 |
|---|---|
| 槽位：`chat.tool-call-card`、`chat.subagent-card`、`chat.todo-panel`、`panel.artifacts.card`、`panel.task.milestone-evidence` | 已有 |
| 区域：`app.background`、`app.overlay`、`chat.corner.*`、`chat.diff-sidebar`、`settings.panel`、`panel.tab`、`rail.view` | 已有 |
| 无头插件 `headless: true` | 已有 |
| 区域 `knowledge.tab`：知识库页的页签（与「总览 / 网络图 / 审阅 / 设置」并列） | 已有 |
| 区域 `home.section`：新任务首页的卡片区 | 已有 |
| 区域 `skills.section`：技能与连接页的分区 | 已有 |
| 从任意已安装 npm 包的 `plugin.manifest.json` → `entrypoints.ui` 发现 UI 插件 | 已有 |
| 在安装确认和插件详情中展示 `permissions` 与 `tools` | 已有 |

---

## 8. 版本、兼容与发布

- **三个版本相互独立：** Pi 运行时版本、`pluginApi`（当前 1）、`resultContract`（当前 v3）。
- **插件版本：** 修复用 patch，新增工具或字段用 minor；删除或改名工具、改变结果形状用 major，同时需要宿主同步。
- **插件 API：** `@gyoungwe/plugin-api` 只增不删；需要删除或改名时，升到 `pluginApi: 2`，并保留一个版本周期的兼容。
- **发布：** 只有从公共 registry 下载 tarball、核对 integrity、干净安装并加载通过后，才算发布完成（详见 drone-maintenance 技能的 npm-release 参考）。已发布的版本不覆盖；有缺陷时发新的 patch 版本并 deprecate 旧版。
- **宿主锁定：** 必需插件发布或提交后，宿主更新 `plugins.lock.json`（提交 + sha256），在干净 checkout 上不设 `DRONE_PLUGINS_DIR` 跑完全部检查。

---

## 9. 验收清单（每个插件变更都要过）

插件仓库：
- [ ] `npm run check` 通过（manifest、构建、类型检查、测试、smoke、干净安装、pack）
- [ ] `build:check`：从源码重新构建的产物与提交的完全一致
- [ ] smoke：从 `npm pack` 产物安装后加载，注册的工具与 `manifest.tools` 完全一致
- [ ] 降级测试：去掉所需的宿主能力后，返回 `degraded` / `incompatible`，没有异常
- [ ] `permissions` 与实际行为一致（例如有网络访问就必须声明主机名）
- [ ] README 写明用途、工具、权限和降级行为

宿主（插件被宿主加载或锁定时）：
- [ ] `plugins.lock.json` 已更新；干净 checkout、不设 `DRONE_PLUGINS_DIR` 时，`npm ci → fetch:plugins → lint → typecheck → test → check:arch → build → check:extensions -- --strict` 全部通过
- [x] 宿主独立性检查：源码扫描可选插件 import，并验证空插件安装根
- [ ] 真机：功能可见可用；禁用插件后界面回到默认状态
