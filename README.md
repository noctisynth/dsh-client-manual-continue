# DSH Manual Continue

面向 DSH 的独立手动续跑插件工程。目标是在准确的中断状态下，以原位 ▶ 接受真实人类点击，通过 Host 校验投递插件来源输入，并复用原生 Chat 通知回执。

通知式续跑仍会增加模型输入与会话历史；它不是恢复原模型流或 JavaScript 执行栈。

工程导航为 DESIGN-001《工程上下文导航》，任务状态以 TODO-001《实施待办》为准，全局规则由 AGENTS《项目协作规范》维护。需求、技术决策、事实与证据按编号查阅。

当前已实现资格与对账逻辑、受信 Host 操作、strict Remote 契约，以及页面结构兼容 Client。通过正式会话 Slot 锚定当前实例，在精确原位显示续跑控件；结构、输入、权限、连接或生命周期不满足时保留/还原原界面。已在实际 DSH 0.2.2-rc.1 环境安装并核验启停注册与只读权限链，修复动态 Remote 命名空间注入缺陷，用户确认按钮已出现且暂停/继续正常。成功继续不添加受理横幅。以上不等于所有浏览器交互、通知持久化与其它构建均已验收；验证范围与限制见 EVIDENCE-008、EVIDENCE-009，早期离线与分发证据见 EVIDENCE-004 至 EVIDENCE-007。

分发目标是在声明且实际验证过的未修改 DSH 构建上安装后开箱即用，不做本机路径或特定会话适配。缺少能力或无法确认页面兼容性时保留宿主界面，不宣称任意 DSH 版本均兼容。

## 本地开发

使用已锁定的 pnpm 与 Node.js 24.21.0 验证，执行 pnpm install --frozen-lockfile 后通过 pnpm run check 运行类型检查、Biome、离线测试与构建。也可分别执行 typecheck、lint、test、build 脚本。Host 为 Node 环境，生产 Client 为 DOM 环境，Client 测试使用单独的 Node/DOM 程序，避免同名 Context 服务混入生产环境。构建顺序为 Host → 官方 Remote 生成 → 原生 lazy-CJS Client；React 由宿主模块表共享，不捆绑第二份。

测试使用离线 Session、消息与真实 SDK 注册表、明确的测试 Agent/Gateway/transport，以及小型 DOM fixture；脚本 click 不视为人类手势。不安装插件、不运行当前 GUI、不发送真实模型请求。候选兼容基线为 DSH 0.2.2-rc.1，另受具体页面结构、完整输入契约和能力检查限制；这不是该版本所有构建已经验收的支持声明。实际安装、当前 GUI 和真实续跑需单独授权。

Host 只接受可核实权限的正式调用上下文，不把来源或请求字段当授权。已接受、checkpoint 确认、模型已开始和任务完成是不同状态；未知结果只对账，不自动补投。

## 版本与发布管理

使用 Semifold 管理版本意图、版本、变更日志与发布编排。环境需提供 smif CLI，版本基线和验证结果见 EVIDENCE-003；流程与发布条件见 SPEC-001。

日常检查：

```sh
npm run release:check
npm run release:status
```

产品变更使用 npm run changeset 记录版本意图；纯上下文变更无需 changeset。release:version 和 release:publish 分别用于经授权的版本更新与发布，预览时追加 --dry-run。当前包保留 private 标记，完成产物及发布条件核验后再明确开放，不直接执行 npm publish 绕过 Semifold。
