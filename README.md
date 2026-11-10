# DSH Manual Continue

面向 DSH 的独立手动续跑插件工程。目标是在准确的中断状态下，以原位 ▶ 接受真实人类点击，通过 Host 校验投递插件来源输入，并复用原生 Chat 通知回执。

通知式续跑仍会增加模型输入与会话历史；它不是恢复原模型流或 JavaScript 执行栈。

工程导航为 DESIGN-001《工程上下文导航》，任务状态以 TODO-001《实施待办》为准，全局规则由 AGENTS《项目协作规范》维护。需求、技术决策、事实与证据按编号查阅。

当前已实现资格与对账逻辑、受信 Host 操作、strict Remote 契约，以及页面结构兼容 Client。通过正式会话 Slot 锚定当前实例，在精确原位显示续跑控件；结构、输入、权限、连接或生命周期不满足时保留/还原原界面。已在实际 DSH 0.2.2-rc.1 环境安装，修复动态 Remote 命名空间与输入栏构建差异。成功继续不添加受理横幅。用户于 2026-11-10 明确确认验收完成；此为用户验收结论，不扩大其它构建的兼容范围，也不虚构 Agent 直接执行的逐项结果。历史验证范围与限制见 EVIDENCE-004 至 EVIDENCE-010。

分发目标是在声明且实际验证过的未修改 DSH 构建上安装后开箱即用，不做本机路径或特定会话适配。当前工作区 Client 已改为从准确输入栏实例动态识别 CSS-module 前缀，要求 controls、trailing、row、primary 的语义 token 唯一且同前缀，不按平台或固定哈希判断；混合/歧义类名、未知结构仍保留宿主界面。此改动的离线验证与真实安装验收分开，详见 EVIDENCE-010；不宣称任意 DSH 版本或平台均兼容。

## 本地开发

使用已锁定的 pnpm 与 Node.js 24.21.0 验证，执行 pnpm install --frozen-lockfile 后通过 pnpm run check 运行类型检查、Biome、离线测试与构建。也可分别执行 typecheck、lint、test、build 脚本。Host 为 Node 环境，生产 Client 为 DOM 环境，Client 测试使用单独的 Node/DOM 程序，避免同名 Context 服务混入生产环境。构建顺序为 Host → 官方 Remote 生成 → 原生 lazy-CJS Client；React 由宿主模块表共享，不捆绑第二份。

测试使用离线 Session、消息与真实 SDK 注册表、明确的测试 Agent/Gateway/transport，以及小型 DOM fixture；脚本 click 不视为人类手势。不安装插件、不运行当前 GUI、不发送真实模型请求。候选兼容基线为 DSH 0.2.2-rc.1，另受具体页面结构、完整输入契约和能力检查限制；这不是该版本所有构建已经验收的支持声明。实际安装、当前 GUI 和真实续跑需单独授权。

Host 只接受可核实权限的正式调用上下文，不把来源或请求字段当授权。已接受、checkpoint 确认、模型已开始和任务完成是不同状态；未知结果只对账，不自动补投。

## 版本与发布管理

采用 MIT 公开 npm 分发，使用 Semifold 统一管理 changeset、版本、变更日志与发布。当前本地基础版本保持 0.0.0，已有 minor 变更集规划首次发布为 0.1.0；不在本地提前升级或消费变更集。后续版本按新增 changeset 演进。

Quality and Release 工作流在 PR 与 main 执行冻结依赖安装、构建、三个环境的严格类型检查、Biome、离线测试、实际打包清单及 Semifold 配置/版本模拟。只有 main 质量检查成功后才调用 smif ci：有 changeset 时创建或更新 release 发布 PR；维护者审阅并合并发布 PR 后，下一次 main 运行发布 npm 和 GitHub Release。不自动合并发布 PR。

日常检查：

```sh
pnpm run check
pnpm run check:package
pnpm run release:check
pnpm run release:status
pnpm run release:version --dry-run
```

首次启用须配置 GitHub Actions 的 PR 创建权限及 NPM_TOKEN secret，并确认 npm 包名和发布权限。机器人发布 PR 的质量工作流可能需要维护者先批准。源码仓库已按授权公开；发布使用 --provenance、匹配的 repository 元数据及发布作业 id-token 权限。NPM_TOKEN 负责 npm 认证，provenance 的 OIDC 身份不等于已配置 npm trusted publishing。远端准备、权限、发布与失败重试详见 GUIDE-001《质量检查与自动发布操作说明》，本轮配置与未运行检查见 EVIDENCE-011。

产品变更使用 pnpm run changeset；纯上下文变更无需 changeset。自动化流程启用后，不再对同一批 changeset 本地运行真实 release:version 或 release:publish，也不直接执行 npm publish 绕过 Semifold。
