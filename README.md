# DSH Manual Continue

面向 DSH 的独立手动续跑插件工程。目标是在准确的中断状态下，以原位 ▶ 接受真实人类点击，通过 Host 校验投递插件来源输入，并复用原生 Chat 通知回执。

通知式续跑仍会增加模型输入与会话历史；它不是恢复原模型流或 JavaScript 执行栈。

工程导航为 DESIGN-001《工程上下文导航》，任务状态以 TODO-001《实施待办》为准，全局规则由 AGENTS《项目协作规范》维护。需求、技术决策、事实与证据按编号查阅。

当前包含工程上下文及版本/发布管理配置，不提供可安装插件产物或插件运行入口，不代表功能已实现。项目方案采用纯 TypeScript 的 Host/Client 适配；原位入口路线与支持构建仍需确认。

## 版本与发布管理

使用 Semifold 管理版本意图、版本、变更日志与发布编排。环境需提供 smif CLI，版本基线和验证结果见 EVIDENCE-003；流程与发布条件见 SPEC-001。

日常检查：

```sh
npm run release:check
npm run release:status
```

产品变更使用 npm run changeset 记录版本意图；纯上下文变更无需 changeset。release:version 和 release:publish 分别用于经授权的版本更新与发布，预览时追加 --dry-run。当前包保留 private 标记，完成产物及发布条件核验后再明确开放，不直接执行 npm publish 绕过 Semifold。
