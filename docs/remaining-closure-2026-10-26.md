# 2026-10-26 剩余验收与 PDF 运行时修复

本轮按用户“设置目标全部完成”继续；不包含明确暂缓的 MinerU/GROBID 和 B8/B8-2。账户写入仍须真实目标与已配置凭据，不能用本地 fixture 代替。

## PDF 修复

公开 suite 0.1.10 的 PDF 文本读取可成功，但聚合包构建只复制 dependencies，没有安装 pdfjs-dist 的可选原生 Canvas。相同 Node 22.23.0 在工作区可加载，在干净 suite 消费者中报 MODULE_NOT_FOUND，并产生 DOMMatrix/Path2D 警告。

research-suite 0.1.11 顶层声明可选 @napi-rs/canvas ^1.0.0，由消费者 npm 安装目标平台原生包，不捆绑 Mac 二进制。新增 test:pdf 隔离安装 suite + Pi 1.1.0，实际研究工具读取生成的一页 PDF，验证页码回执，再通过安装包内 pdfjs 渲染到真实 Canvas；1082 个非白像素且没有 Canvas/polyfill 警告。该检查是安装包工具/原生渲染检查，不冒称 GUI 或模型科学验收。

旧候选红灯日志 SHA256 `f6402083345a96ffaef0e8b84b29968406febbeb10fafb4b081bc6bad71e0029`；修复后的绿灯日志 `860f8a61944648c272ffed55e7d3abdb76afe1b37ee9c5420853927de06d18cc`。默认 npm ci 与完整 npm run check 通过，后者日志 `0c31452ea8d6542fb1a8d636c60085164731beb9e58cf007ff6260906abc3319`。

## 候选及公开状态（阶段记录，最终状态见下文）

- plugin-api 1.2.0 已公开，下载字节与候选一致，干净 npm 安装、ESM/ui 导入与能力协商通过；SHA256 `056322c91ff96fb05bc0b9d1721d834450e6146f3969b819fc1d6267c33ad960`。
- core 0.1.9 已公开，公开 tarball 与候选逐字节一致；SHA256 `4ebf4bf82c2166f07a5312a1b2f6795ff88880bb79698c1f27cce4e26a6358fe`。按公开包名干净安装到 Pi 1.1.0 / 1.4.0 后，真实 AgentSession 各完成四次调用、一次批准、任务 completed 和交付文件独立回读。desktop-ui-pack 0.2.0 仍 staged。
- suite 0.1.11 新候选 SHA256 `767c37940aa32741fe133dfc57b0a75d3597521b11fd5d32904ff3d563ef794e`，替换此前未发布的候选；其中 API 18 个文件与公开 API 字节一致。新候选在真实 Pi 1.1.0 / 1.4.0 AgentSession 分别完成 13 次实际工具调用、一次批准、双来源阅读、写后回读与 task_reconcile completed。使用确定性离线模型，不代表科学质量。
- 另有 N=2 DeepSeek Flash 在线真实会话，在 Pi 1.4.0 和同一 suite 候选完成；两个交付文件的独立哈希与 completed 回执一致。手工来源复核支持有限质量结论，但两篇 503/502 词报告超出提示的 450 词限制；不改原输出来伪造通过。公开来源为 arXiv 1706.03762 与 1810.04805；不提交私有会话/报告正文。

宿主验收与最终状态在 Drone docs/releases/remaining-closure-2026-10-26.md 和对应 JSON 汇总；账户、其他平台、发布后验证不由上述候选结果替代。

后续收紧回归：同时检查 stdout/stderr 的 Canvas 警告，重新运行 test:pdf 通过；日志 SHA256 `299f66c83b3fd884ab960aad42b04f128bbfb125125e6d87e9528864d9c4d6f1`。

修复 b5addb1 已快进合入 main；合并后 npm run check 完整通过，日志 SHA256 `48db665150fe5093857f2d6d06c46556c8458e82e77e9bf0898e1f4905f727f3`。suite 0.1.11 已 staged（`bab97837-b274-4c5a-af54-a0334c396989`），staged 下载字节与新候选一致；与 UI 保持未公开状态，等待 npm 安全认证。

在线复核跟进：两个原始场景累计七次真实会话，最终方法/临床推断报告为 297/152 词，经过明确审阅反馈后有限范围通过。首次字数失败、中间范围/来源描述和指标概括问题全部保留；不能称首次自主科学质量通过。七次交付字节与 completed 回执一致，候选笔记另行回读；有些笔记引用格式与报告不同，不声称字节相同。详见 Drone 同名证据的 onlineFollowup。上述在线复核时三个目标包仍 staged 且公开 registry 404，原 stage ID 保留；未完成账户/设备状态不变。

发布跟进：用户完成 npm 重新登录及 core 安全认证后，core 0.1.9 已公开并通过上述验证；suite 原 stage 的认证回调返回 E404，公开版本复查仍 404，待重新认证；UI 原 stage 保留，未重复上传。账户自查没有找到 Drone 配置的 Zotero 云端及 Protocols.io 凭据；登记的远程桌面离线，本机 Parallels 服务不可达。账户写入与其他平台 GUI 继续未完成，详见宿主 JSON。

## 最终公开发布状态

API 1.2.0、core 0.1.9、suite 0.1.11 与 UI 0.2.0 全部公开，原 stage 均已批准，最终列表为空。suite SHA256 `767c37940aa32741fe133dfc57b0a75d3597521b11fd5d32904ff3d563ef794e`，UI SHA256 `c9f468edb8eef41ca6cb7aae613eedd7040ba6be774e16295170e6dd241ddf2a`；公开下载、integrity/shasum 与候选字节匹配。

suite 按 npm 包名全新安装到 Pi 1.1.0 / 1.4.0，真实会话各完成 13 次调用及完整研究交付回读；公开安装的 PDF 读取、页码及 Canvas 渲染复验通过。UI 公开干净安装与宿主生命周期测试通过，正式 DMG 安装应用中的知识页、PDF 第 3/15 页、停用回退和重新启用恢复均通过，安装的 61 个 UI 包文件与公开 tarball 相同。JSON 回执、日志/截图哈希在 Drone docs/releases/remaining-closure-2026-10-26.json 的 npmPublicationCompletion。

新 profile 未选择项目时 PDF 预览显示参数错误，选定合成项目后正常；`PDF_WITHOUT_SELECTED_PROJECT` 保留为未修复观察。账户写入与其他平台 GUI 仍未完成。只更新文档，没有变更已通过完整 npm run check 的产品源码；此前在线科学验收的有限结论及暂缓范围保持不变。
