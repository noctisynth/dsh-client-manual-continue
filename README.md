# DSH Manual Continue

面向 DSH 的独立手动续跑插件工程。目标是在准确的中断状态下，以原位 ▶ 接受真实人类点击，通过 Host 校验投递插件来源输入，并复用原生 Chat 通知回执。

通知式续跑仍会增加模型输入与会话历史；它不是恢复原模型流或 JavaScript 执行栈。

工程导航为 DESIGN-001《工程上下文导航》，任务状态以 TODO-001《实施待办》为准，全局规则由 AGENTS《项目协作规范》维护。需求、技术决策、事实与证据按编号查阅。

当前已建立精确版本工具链、严格类型检查、纯终止事实折叠与离线插件来源消息构造。尚无可安装或可执行真实续跑的插件入口：当前目标缺少独立主按钮扩展点，安全 Host 路线及支持调用者范围仍需确认；契约与本项目验证分别见 EVIDENCE-004、EVIDENCE-005。不得将独立逻辑通过视作完整插件交付。

## 本地开发

使用已锁定的 pnpm 与 Node.js 24.21.0 验证，执行 pnpm install --frozen-lockfile 后通过 pnpm run check 运行类型检查、Biome、离线测试与构建。也可分别执行 typecheck、lint、test、build 脚本。Host 与 Client 环境类型分开；当前没有 Client UI 模块，不预建空适配器。

测试只创建离线 Session 和消息值，不调用真实 Agent、安装插件或发送模型请求。构建只输出已实现的逻辑模块，不提供虚构的 Loader/Remote 入口。

## 版本与发布管理

使用 Semifold 管理版本意图、版本、变更日志与发布编排。环境需提供 smif CLI，版本基线和验证结果见 EVIDENCE-003；流程与发布条件见 SPEC-001。

日常检查：

```sh
npm run release:check
npm run release:status
```

产品变更使用 npm run changeset 记录版本意图；纯上下文变更无需 changeset。release:version 和 release:publish 分别用于经授权的版本更新与发布，预览时追加 --dry-run。当前包保留 private 标记，完成产物及发布条件核验后再明确开放，不直接执行 npm publish 绕过 Semifold。
