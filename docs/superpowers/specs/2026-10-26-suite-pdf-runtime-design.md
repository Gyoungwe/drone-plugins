# 聚合包 PDF 运行时收口

目标来源：用户要求完成剩余七类工作，包含 PDF Canvas 警告调查与必要修复。只调整未发布的 research-suite 0.1.11；不修改已发布 research 0.2.0 的字节。

## 观察与方案

公开 suite 0.1.10 的 research 扩展可读取真实论文，但加载时报告缺少 Canvas、DOMMatrix 和 Path2D。同一 Node 22.23.0 下，插件工作区能够加载 Canvas，排除该环境的运行时不兼容。聚合构建只复制 dependencies，漏掉 pdfjs-dist 的 optionalDependencies。

采用 suite 顶层声明与 pdfjs-dist 一致的可选 Canvas 依赖，让 npm 在消费者平台解析原生实现。保持现有文本提取降级，不新增渲染产品功能。拒绝将当前 Mac 的 native 模块直接复制进聚合包，避免破坏其他平台；也不吞掉警告来伪装依赖已满足。

## 回归与交付

增加 suite 单独打包、默认 npm 安装的隔离回归。只装 suite 与其 Pi peer，不与单独研究包混装；从实际扩展位置解析依赖，读取合成 PDF、验证页码来源，并将页面渲染到真实 Canvas，断言像素非空。缺依赖的原包应失败，修复后通过。该自动化不替代真实 AgentSession、正式安装包 GUI 或其他平台实机证据。

重新构建 suite 时使用已公开 API 1.2.0 的同一字节，清除早期同版本候选声明差异。最终候选重新执行双 SDK 工作流、插件完整门禁与发布后干净安装。包版本保持 0.1.11（尚未公开），记录新的 tarball 哈希及旧候选被替代的原因。
