# 纯 TypeScript 插件技术方案

编号：SPEC-001。更新：2026-11-09。依据：RFC-001、FACT-001。状态：工程方案，非已实现能力。

## 架构决策：TypeScript 适配与宿主能力复用

当前目标是通知式新轮次续跑，复用 DSH 的消息创建、inbox 与 followup 驱动，以及现有 Chat 通知分类。项目职责限定为 TypeScript Host/Client 适配和纯状态逻辑，不重写宿主执行驱动或模型协议。

这一边界仅覆盖当前目标，不代表“零新增输入恢复”或全局原子续跑已受支持。若未来需求超出现有宿主公共能力，先记录契约缺口并重新决策，不以未经核实的内部接口替代。

## 数据流与职责

已提交会话事件 → Host 资格投影 → Client 状态 → 真实人类点击 → 受信 Remote 操作入口 → Host 复核与去重 → 插件来源消息 + followup → 原生 inbox/执行流程 → Chat 通知回执。

| 职责 | 范围 |
|---|---|
| 纯资格投影 | 折叠已提交事件，记录候选轮次、终止序列、原因及 asOfSeq；不操作 DOM 或模型 |
| Host 续跑操作 | 验证调用者、准确会话、权限、所有权、候选、竞争、收尾与重复操作；创建来源输入 |
| Client 原位适配 | 展示 Host 状态、识别完整草稿及输入栏实例；显式点击桥接；失效和卸载恢复 |
| 通知展示 | 默认复用原生 Chat turn-trigger，不替换全部用户消息渲染器 |

模块按实际职责形成，不预建空目录或通用框架。使用当前目标构建的正式类型、命令和投影接口；实现前核对具体签名与权限，不发明新的远程端点。

## Host 操作约束

- 以持久化终止事件为候选依据，正常完成或只有开始没有结束记录不得推断可恢复。具体错误策略由 RFC-001 确认。
- 必须经正式受信调用上下文取得真实调用者、准确 Agent 和取消信号，校验请求结构、大小、requestId、期望终止序列及会话范围；客户端字段不能证明人类授权。EVIDENCE-004 已观察到现有命令 invocation 不携带 peer，不使用 commands → followup。后续正式 Remote 方法使用普通 JSON 会话身份参数，先检查真实 invocation 与 owner 权限，再 live-only 查准确 Agent/Session；不使用会在 guard 前 cold-resume 的 Agent lookup，不注册模型工具。权限无法证明的非 owner 调用拒绝，来源元数据不参与授权。
- 命令授权不自动等于模型请求授权；必须验证调用者可触发模型执行，尤其是仅有命令权限的访问者。
- 每会话串行化本插件操作；跨异步等待复核候选、Agent 身份、writer 所有权、inbox、待处理交互及旧活动是否排空。
- status 为 idle 不足以证明全部收尾完成；当前 whenIdle 等待已观察到的驱动/维护活动，但不是 inbox 空或独占准入证明；runMaintenance 是可尝试仅空闲进入的正式原语，待 Host 路线确认后复核实际组合。不能编造 isQuiescent 或凭延迟猜测收尾。插件锁不能阻止其他生产者，不承诺跨生产者比较并交换。
- 由 Host 创建稳定消息身份与自有来源，拟用 kind 为 plugin:manual-continue，经 createUserMessage 与 followup 投递，不手工 append 冒充准入；不冒用 user、goal、retry 或旧通用 plugin 包装。
- 元数据仅保留可持久化的操作关联与候选信息；正文说明继续未完成工作、复用已有结果、先核实未知外部副作用。来源不是模型高权限指令。
- 结果用可辨别联合区分 accepted、already-accepted、stale、busy/draining、pending-input/pending-interaction、forbidden/unavailable、outcome-unknown；这些是插件拟议结果，不是现有宿主枚举。
- 已接受不等于模型开始，更不等于任务完成，命令回执不作为持久化证明。回执丢失或崩溃结果未知时不盲目补投，先通过已持久来源与消息身份对账；不保证跨崩溃全局 exactly-once。
- 不重放历史工具或清空他人 inbox；模型后续工具仍走原沙箱和审批。

## Host 实施细化

- 两份正式投影分别管理资格与最近候选的接受证据，注册必须 await；fork 继承前缀只推进日志位置，不成为当前会话的新候选。投影 wire 只暴露候选坐标与原因种类，不声称授权或模型开始。
- 正式服务采用普通 JSON 参数的直接 Remote 方法；首部检查调用上下文、owner、取消和插件存活，再 live-only 查准确 Agent 与 Session。当前仅接入已验证的根 Agent 生命周期，不借此越过子代理的父级所有权；不自动创建或恢复 Agent。
- 提交与对账方法均声明 SDK 的标准 signal 终参，使生成 Client 调用可以取消传输；它不进入 JSON，不替代受信 invocation/peer 的授权与取消信号。
- Client 的公开 ACL hook 不证明 owner，公开连接面也不暴露 principal。新增最小只读 availability：真实 caller guard 后仅核对自有存活、取消与 owner Client 在线；不查会话、不维护准入、不写入或唤醒。Client 只按正式 ready generation 缓存当前调用者可用性，断开/代际变化即失效，绝不将此当 submit 的授权票据或会话可执行承诺。
- 本插件每会话只允许一个在途操作。先对账已有接受，再核对候选、inbox 与待处理 Remote 交互；whenIdle 后重新核对原对象和候选，再尝试 runMaintenance 的真实空闲准入。维护任务内的最后复核与 followup 之间不引入 await，仍不承诺所有生产者之间的事务。
- 请求身份与 Host 创建的 MessageId 在调用 followup 前保留；抛错、取消或回执不明时只对账，不补投。已观察插入与磁盘确认分开表达；sessions.flush 返回已参与的成功 durability barrier 才报告 confirmed，失败或无持久化监听不得当作确认。
- 卸载中止自有等待和新操作，不取消 Agent 工作、不移除他人 inbox、不回滚已接受输入；释放投影、服务与自有注册。
- 官方生成器当前仅扫描约定包树。保持单一产品包与权威源码，采用构建期隔离 staging workspace 调用官方 WorkspaceTypertGenerator，检查非零产物、精确包名与完整 strict Remote codec；staging、生成物不纳入源码治理。不修改宿主或官方生成器，不以空列表冒充成功。

## Client 与生命周期

- 优先使用目标构建实际声明并已确认发布的主按钮 Slot，不把尚未发布的扩展点当作可用公共能力。
- 用户已确认页面结构兼容路线：通过正式 session Slot 的准确实例及正式状态建立锚定，仅在已支持的原生主按钮结构唯一匹配时接管同一位置。新增自有按钮并隐藏原按钮，不整体替换输入栏、不使用旁置入口、不改写原发送/停止回调；结构不匹配即保留或还原原界面。
- 兼容层只拥有自有节点、监听及明确修改的原按钮属性；焦点、键盘、IME、Portal 边界与组件/会话切换必须测试，不能用固定延迟猜状态。Client 调用走生成的 Remote 与标准取消信号，不使用包私有 host.call 代替受信调用。
- 支持声明由实际组合验证建立，不能由同名版本、源码观察或离线 DOM 片段测试代替。页面兼容路线本身不扩大安装或运行授权；后续安装及无模型请求 GUI 核验按 RFC-001 单独确认的范围执行，仍不包含真实模型请求或发布。
- 安装与启用/禁用只通过正式插件管理器，不手写 profile；以 application、实际 fiber 与 Client 注册分别核验，不将任一层当作完整按钮或 Remote 成功。只读 Inspect 的构建期静态目录不必包含第三方新增服务，目录缺失不能直接判定其运行失败。
- 输入不只包含 trim 后文字，还包括附件、上传、结构化引用及命令；无法确认时不隐藏原按钮。等待审批、竞争输入或旧活动收尾时不启动续跑。
- Host、授权、状态或适配失效均保留原 UI。焦点和无障碍树不能同时暴露两个主动作；释放单组件替换注册才恢复默认，返回 null 不等于恢复。
- 等待投影注册完成并保留释放句柄；命令、监听、样式与适配资源由插件生命周期释放。禁用停止新操作，保留已接受的历史输入。
- Client 先通过根 Remote $mount 正式描述符，再对子 Context 注入动态 remote.manualContinue；重新取得该子上下文的 traced Remote，供所有生成调用使用。根 remote 注入不授予关联命名空间；自供命名空间不能放到顶层注入造成启动互等。authority 与 Slot 随子生命周期释放。
- 实际页面缺陷排查使用可选的正式 Client Inspect provider，只读当前匿名 occurrence 的门槛状态，不输出会话标识、文本、路径、主机或账号信息。查询不能 refresh、activate、重新 probe、修改 DOM 或调用业务 RPC；不注册供模型操作续跑的工具。缺少 Inspect 服务不影响正常适配。

## TypeScript 工程基线

- 自有代码及测试全部 TypeScript/TSX；采用 ESM。Host 与 Client 分开 tsconfig 环境，strict 和 noEmit 开启，使用宿主真实类型；不让浏览器模块依赖 Node 或宿主内部实现。
- 构建使用 tsdown/Rolldown/Oxc，tsrs 负责类型检查，Biome 负责格式与推荐 lint。本次建立实际源码、测试及工程入口，精确锁定实际使用版本；tsrs 实验兼容问题单列证据，不静默替换检查器或关闭诊断。
- 已读取的目标 Client Slot 树不含独立主按钮扩展点；当前按已确认的兼容路线开发，不提供旁置入口。实现基于真实 SessionEvent 的纯资格事实折叠，按 RFC-001 最新确认对所有 error、明确 user 停止、max-tokens 和 interrupted 生成终止候选；候选不证明当前可安全执行。其它原因保留历史但不生成候选。
- 新轮次、已提交用户消息或任意生产者的 inbox 插入使旧候选失效；后续移除竞争消息不复活旧候选。候选仅表示终止原因符合规则，绝不代表当前调用者授权、无竞争或可直接触发模型。
- 工程中使用已锁定公开包的正式类型时，须与目标运行构建的反射/实现比对；类型包相同版本不等于实际 Loader 兼容。未核实的 Host 授权及收尾能力不以项目自建接口伪装可用适配。
- Biome 使用单引号及 JSX 单引号、2 空格、100 列、按需分号。覆盖所有自有源文件、测试和配置，排除生成物；若使用 Tailwind 4，再配置实际样式入口、指令解析与类名排序，不预设不存在的入口。
- 外部输入运行时校验后收窄，协议结果与错误采用明确类型；移除无用导入、参数与可避免断言，不用全局禁用 lint、ts-ignore 或类型逃逸掩盖契约缺口。
- React 保持宿主运行时共享、Hook 依赖、取消及会话切换安全；按实际 UI 需求使用 Base UI、shadcn 派生组件和隔离 Tailwind 样式，保留许可。
- 实际实现后提供可复现的类型、lint、关键测试与构建入口；类型成功或独立组件成功不能替代正式 Loader 组合和人类点击闭环。检查深度与变更风险相称。

## 版本与发布

Semifold 是版本意图、版本更新、变更日志及发布编排的唯一工具。工程按单一 Node.js 包管理，稳定 PackageId 与包名为 dsh-client-manual-continue，基础分支为 main，发布准备分支为 release。

- 通过 smif commit 记录面向用户的产品变更，选择语义版本级别及已配置分类；纯 Agent 上下文变更不创建 changeset，不手工消费已记录的 changeset。
- 使用 smif config sync --check 核对包发现与配置，smif status 审阅发布计划；执行变更前可使用 smif version --dry-run 预览。
- 实际版本、变更日志及 changeset 消费只由经授权的 smif version 执行；不手动修改版本以绕过计划，也不把发布成功等同功能验收。
- npm 注册表存在性检查和 npm 发布命令由 Semifold 的 Node.js resolver 配置。发布参数使用 provenance 与 public access；需要适用的发布环境及授权，不能据此认为本轮执行了发布。
- Host 与 Client 源码和本地分发构建仍不能代替实际运行验收；包保留 private，保留版本管理与计划能力。首次公开发布前须完成构建/验证入口、产物范围及许可核对、支持范围与真实组合验收，并经明确授权移除 private 标记。
- 不生成自动推送、版本更新或发布的 CI 工作流。工具安装依据官方说明；当前配置验证所用版本和实际结果由 EVIDENCE-003 记录，不把工具实现细节加入项目上下文。

## 分发边界

后续沿用 DSH 插件管理器及其 Host/Client、bundle patch 和元数据契约，不编辑 profile 或安装源码。支持范围由能力与实际行为验证决定，不用同名版本代替构建身份。配置版本与发布管理不构成安装、推送或公开发布授权。
