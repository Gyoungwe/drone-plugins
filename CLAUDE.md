@AGENTS.md

## Claude Code 接手说明

- 宿主仓库在 `../Drone`。进度与阶段完成条件以 Drone 的 `docs/pluginization/native-plugin-implementation-plan.md` 为准；插件改动用 Drone 仓的 `drone-plugin-dev` skill，跨仓切流用 `drone-maintenance`。
- 插件改动合入本仓后，宿主要单独开 PR 重锁 `plugins.lock.json`（远端 commit + tarball 哈希）。
- 授权：CI（macOS/Linux）全绿后可以合并 PR 到 main；Windows 可忽略。
- GitHub：`gh` 的 GraphQL 在部分环境会 403，失败时改用 REST（`gh api repos/Gyoungwe/drone-plugins/pulls ...`）。
- 网络：npm 要走代理（绕过 no_proxy）；Node 的 fetch 需设置 `NODE_USE_ENV_PROXY=1`。
- 受管插件：能力调用都在 hook/工具/命令内 `await`；SDK 运行期间不 `session.notify`，状态卡等 `agent_settled`。单元测试的假宿主要模拟这两条（Drone `docs/PITFALLS.md`）。
