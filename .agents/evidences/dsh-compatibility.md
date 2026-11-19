# DSH 依赖升级与系列兼容验证

编号：EVIDENCE-012。日期：2026-11-19（Asia/Shanghai）。范围：公开 registry 与 SDK 实查、工作区依赖升级和离线检查；不包含当前宿主安装、GUI 操作或真实模型请求。

## 发布基线与来源

直接读取官方 npm registry：DSH 主包的 latest 与 next 均为 0.2.2-rc.5，发布时间为 2026-11-18T13:17:23.604Z。原有全部 DSH 开发依赖均存在同系列精确版本。子包的 latest 标签并不统一指向该系列，例如 agent 的 latest 仍为 0.1.0-rc.6；因此此次按主包系列统一升级，而非逐子包使用 latest。

协议包 0.2.2-rc.5 精确依赖 Zod 4.6.6，项目直接依赖与第三方许可版本一并对齐，避免保留两个 Zod 基线。DSH 新增 peer 与聚合 Remote 声明依赖需要补入开发依赖，不改变分发时宿主服务的归属。

公开来源：

- https://registry.npmjs.org/@deepseek-ai%2Fdsh
- https://registry.npmjs.org/@deepseek-ai/dsh-agent
- https://registry.npmjs.org/@deepseek-ai/dsh-typert-protocol/0.2.2-rc.5
- https://unpkg.com/@deepseek-ai/dsh-app-boot@0.2.2-rc.5/src/plugin-compatibility.ts
- https://unpkg.com/@deepseek-ai/dsh-agent@0.2.2-rc.5/src/index.ts
- https://unpkg.com/@deepseek-ai/dsh-subagent@0.2.2-rc.5/src/manager.ts

## 直接观察的兼容差异

- 旧 Client 只接受 release 精确等于 0.2.2-rc.1，生成脚本也把协议版本写死。前者会在结构适配有能力工作时仍拒绝加载；后者使升级到新协议后无法生成。
- 官方 app-boot 0.2.2-rc.5 的兼容判定对 engine 与 peer fallback 均使用 node-semver 的 includePrerelease。存在自有 engine 时由它单独决定；缺少 engine 时才遍历 DSH peers。范围 `>=0.2.0-0 <0.3.0-0` 在该正式判定下覆盖 0.2.x 预发布与正式版本，并排除 0.3.0 预发布。
- 标准 node-semver 默认的预发布规则与上述宿主判定不同，不能把默认 satisfies 的结果直接当成宿主或 pnpm peer 结果。本轮实际 pnpm peer 检查无问题，无需添加某个 rc 的特例范围。
- 新 SDK 的 AgentRegistry 已移除 roots/owner API；直接保留旧调用会使官方生成器以 TS2339 失败。正式 SubagentRuntime.rootOf 根据当前运行所有权及已提交身份判断根，不把普通 Session fork 当作子代理。适配决策见 SPEC-001，不使用会话父 ID 推测授权。
- 实查新版公开 InputBar 源码仍使用 row/trailing/standardControls/primary 语义结构及 conversation.input.right Slot，原位适配无需按新哈希增加名单。此源码观察不是实际浏览器验收。

## 工具链与已执行检查

使用项目固定 pnpm 11.28.5、tsdown 0.23.7、tsrs 0.23.0-ts7.1.0-beta 与 Biome 2.6.6，没有随本次 SDK 升级刷新工程工具版本。Semifold 实际可用版本为 0.3.4。

初始 pnpm 启动器尝试在工作区外初始化工具目录，沙箱拒绝且提权请求未获批准；随后用户明确授权无害工具链使用。后续使用现有工具，项目依赖、store 和 cache 位于工作区，不修改全局包管理器设置。

Bundled Node 24.21.0 加载 Rolldown 的原生模块时因 macOS Team ID 不匹配失败，不能误报为缺失 optional dependency。已确认现有独立 Node 24.11.0 可加载相同模块；后续构建采用它，不改系统签名、安全设置或更换构建工具。

依赖安装发现新增必需 peers，按公开契约补齐；聚合 Remote 对 MCP 类型的直接重导出也须补声明包。最后一次 pnpm peers check 退出 0，输出无 peer 问题。安装有上游 tldts-core 弃用提醒，不属于 peer 或安装失败。pnpm 按已授权的最新系列升级自动记录精确发布版本的 minimumReleaseAgeExclude，没有全局禁用供应链检查或放宽至未来版本。

实际执行官方兼容 evaluator 与版本范围回归，3 项通过，覆盖 engine、peer fallback、系列边界与开发依赖的一致性。该结果不代表每个历史运行构建均已集成验收。

## 最终离线验证结果

在独立 Node 24.11.0 下，按项目 check 脚本的同一命令链完整执行，退出 0：Host/shared 构建、官方非空 Host 与 strict Remote 生成、Client 构建、Host/Client/Client 测试三个 tsrs 严格类型程序、Biome（50 个自有文件）及全部 275 项测试通过。直接执行配置命令链避免 pnpm run 重复联网核验已安装锁文件，不变更任何检查步骤或诊断。

新增回归覆盖：官方 engine/peer fallback 的系列范围、Client 不依赖 release manifest 即到达正式 Remote mount、必要服务缺失仍失败、旧 roots 的准确身份与动态复核、新 rootOf 的子所有权拒绝、异常与缺失、依赖释放取消等待和旧引用失权，以及异步持久化屏障后的根身份重查。Host 的新所有权测试使用结构服务 double，旧路径使用纯 helper；不将这些测试说成旧版完整运行库或真实子代理的集成验收。

冻结锁文件的离线严格 peer 安装退出 0；随后 pnpm peers check 再次无问题。实际 npm pack dry-run 清单校验通过，导出、分发物、资源与许可均存在。Semifold 通过正式 commit 命令创建 patch:fix 版本意图，config sync 检查通过；version dry-run 在允许未提交工作树后成功，计划仍为 0.0.0 → 0.1.0，未消费 changeset 或改产品版本。

Git 空白差异检查通过。依赖阶段出现的网络重试、初次原生构建失败、SDK roots 类型失败及新增测试的收窄错误均已分别定位并通过最终完整检查复核；不将失败尝试计为通过。

## 授权边界

未安装到当前 DSH、修改 profile、刷新或操作 GUI、发送真实续跑或模型请求、执行产品版本更新、推送或发布。较宽的兼容声明与实际逐构建验证分开记录；未知能力或页面结构仍保留原有拒绝/还原行为。
