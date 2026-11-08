# DSH Manual Continue

面向 DSH 的独立手动续跑插件工程。目标是在准确的中断状态下，以原位 ▶ 接受真实人类点击，通过 Host 校验投递插件来源输入，并复用原生 Chat 通知回执。

通知式续跑仍会增加模型输入与会话历史；它不是恢复原模型流或 JavaScript 执行栈。

工程导航为 DESIGN-001《工程上下文导航》，任务状态以 TODO-001《实施待办》为准，全局规则由 AGENTS《项目协作规范》维护。需求、技术决策、事实与证据按编号查阅。

当前已实现资格与对账逻辑、正式 Host 操作及 strict Remote 构建产物，完成离线风险验证。仍未完成 Client 原位适配、真实 Loader 与人类点击闭环，不是可安装交付的完整插件。当前目标缺少独立主按钮扩展点，页面适配取舍尚未获明确确认；契约、核心与 Host 验证分别见 EVIDENCE-004、EVIDENCE-005、EVIDENCE-006。

分发目标是在声明且实际验证过的未修改 DSH 构建上安装后开箱即用，不做本机路径或特定会话适配。缺少能力或无法确认页面兼容性时保留宿主界面，不宣称任意 DSH 版本均兼容。

## 本地开发

使用已锁定的 pnpm 与 Node.js 24.21.0 验证，执行 pnpm install --frozen-lockfile 后通过 pnpm run check 运行类型检查、Biome、离线测试与构建。也可分别执行 typecheck、lint、test、build 脚本。Host 与 Client 环境类型分开；当前没有 Client UI 模块，不预建空适配器。

测试使用离线 Session、消息与真实 SDK 注册表，并以明确的测试 Agent/Gateway 对象验证 Host 操作；不创建实际模型驱动、不安装插件或发送模型请求。构建输出实际 Host 入口与官方生成的 Remote 契约；只有这些产物不表示真实 Loader、浏览器或通知闭环已通过。

Host 只接受可核实权限的正式调用上下文，不把来源或请求字段当授权。已接受、checkpoint 确认、模型已开始和任务完成是不同状态；未知结果只对账，不自动补投。

## 版本与发布管理

使用 Semifold 管理版本意图、版本、变更日志与发布编排。环境需提供 smif CLI，版本基线和验证结果见 EVIDENCE-003；流程与发布条件见 SPEC-001。

日常检查：

```sh
npm run release:check
npm run release:status
```

产品变更使用 npm run changeset 记录版本意图；纯上下文变更无需 changeset。release:version 和 release:publish 分别用于经授权的版本更新与发布，预览时追加 --dry-run。当前包保留 private 标记，完成产物及发布条件核验后再明确开放，不直接执行 npm publish 绕过 Semifold。
