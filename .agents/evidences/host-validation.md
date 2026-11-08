# Host 操作与正式生成链验证

编号：EVIDENCE-006。日期：2026-11-08（Asia/Shanghai）。范围：本项目 Host 源码、官方生成器及离线组合；不代表运行安装版或真实人类点击验收。

## 正式契约落实

以 EVIDENCE-004 的运行构建复核为依据，实现普通 JSON 参数的直接 Remote 方法 submit 与 reconcile。调用入口检查真实调用 Context 的 invocation、服务/命名空间/方法、owner 身份及连接取消；没有 Agent lookup 参数，不在授权前 cold-resume。不注册模型工具，不读取来源字符串作为授权。

资格与接受证据使用正式 SessionProjectionRegistry 注册。两份状态持有继承前缀边界；父会话的已停止记录和接受证据不能成为 fork 当前候选。wire 只传候选位置与原因种类，错误正文、来源操作身份、授权或模型开始声明不进入 wire。完整原错误仍保留在原会话事件。

Host 每会话保留一个在途操作，跨 whenIdle 与持久化等待重新核对准确 Agent/Session、根级所有权、候选、inbox、待处理 Remote 交互和取消。runMaintenance 尝试真实空闲准入；最终同步检查后调用原生 followup，不清 inbox、不回放工具。终止日志先经过 checkpoint，再新增来源输入；新增输入 checkpoint 成功后再次对同一身份对账，等待期间变成冲突时仍返回未知结果，不自动补投。

confirmed 的精确定义是原生 SessionStore.flush 确认所有 durability listener 成功且至少一个参与；不是插件自行证明内核 fsync 或取得独立 writer 锁。准确 live Agent/Session 的所有权依赖已核对的宿主 Agent 生命周期，实际持久化 provider 的组合仍待验收。

## 实际构建兼容问题与处理

- tsdown 的 Node 构建最初输出 mjs，与声明的入口不符；通过正式 outputOptions 固定输出命名，未使用文件改名掩盖差异。
- 官方 dsh-typert-generator 0.2.2-rc.1 仅扫描约定包树，直接单包发现为空；使用构建期隔离 workspace，权威源码与单一产品包不迁移。staging 用后释放，不参与分发。
- 生成器的 isTypeMetaSymbol 只承认已注册项目或声明模块中的协议符号。最初直接使用外部 SDK 时报告“有 Remote 发布声明但没有 Remote 方法”，没有把该失败当成功。隔离 workspace 注册从已锁定官方协议包逐字节复制的声明，并保留原 manifest；没有编造或修改 SDK 类型、修改安装或关闭诊断。
- 公开整个框架实现类会触发 SDK 扩展接口跨 face 的分析限制。公开服务改为仅含两项业务方法的 ManualContinueOperations，框架实现类不导出；收窄产品 API 而不是补造 SDK 定义。
- 生成器仅将 TypeScript 标准库定义识别为取消参数 AbortSignal，Node 自身声明不能直接满足该判定。隔离抽取配置引入标准库声明以建立协议的跨端取消类型；正式 Host tsrs 项目仍只有 Node 环境、Client 项目仍单独使用 DOM，没有向 Host 检查加入浏览器全局或关闭诊断。公开方法使用正式 signal 终参，JSON 参数仍只有业务请求。
- Cordis 4.1.0 的 FiberState 是声明中擦除的 const enum，运行导出不含该值；实现采用已核对的 ACTIVE 数值契约，并保持 Fiber 状态类型约束。此耦合必须随支持构建重新核实，不能只凭版本字符串承诺兼容。

## 已完成的直接验证

- tsdown 构建了实际 Host ESM 入口，并由官方 WorkspaceTypertGenerator 生成一个非空 Host contribution 与 strict Remote 消费契约；包名、face 和 Remote 产物存在性均由构建断言检查。
- 生成参数只有一项普通 JSON 请求，没有会自动激活会话的 Agent lookup/RemoteScope；生成了 submit 与 reconcile 两个直接端点，语义边界由 Host 再校验。
- 同版正式 SDK 的真实 Cordis、SessionStore、SessionProjectionRegistry 离线组合完成投影验证，包括等待注册、快照隐私、模型更换不使候选失效、fork/nested fork、严格 checkpoint 校验、restore、引用计数与卸载释放。统一质量入口已复核通过。

- 统一入口的 tsrs Host/Client 严格检查、Biome、构建、生成与全部 123 项本项目测试通过。其中 Host 操作单元 26 项、真实投影注册组合 10 项、生成契约解析 8 项，其余为 EVIDENCE-005 的独立核心回归；没有借用其它工程的通过数。
- Host 操作单元明确使用手工实现正式 Agent 接口的测试对象、两项只读方法的 Gateway double 及模拟受信 invocation；验证了 owner-first 拒绝、无 cold-resume、准确会话、并发、各异步等待后的竞争复核、未知结果不补投、取消和卸载。它们不是实际 Gateway 认证、原生驱动或真实 writer 的证明。
- 正式消费契约测试确认 signal 不进入 JSON，并通过真实 SDK 的生成调用工厂传给类型完整的 Client 方法测试对象；Host 端补测单次请求取消不影响 Peer、Agent 或其它 inbox。该测试不代表实际浏览器 RPC 已验证。
- 独立只读审阅发现第二次 checkpoint 等待期间的身份冲突窗口，已增加等待后的再对账与回归测试，未知时保留已接受输入且不清 inbox、不追加新输入。
- 已核对运行安装版协议包的公开 remote-info 导出和实际工厂实现，与生成的直接 JSON 描述符/strict 输入策略对应；这是静态契约复核，不是向运行 Host 发请求。
- 本地 pack dry-run 的文件范围只包含声明的代码、协议、元数据和说明；未把 staging、依赖、测试、上下文或私人配置纳入分发。此检查不是发布，也不是完整插件可安装性验证。

## 尚未验收的边界

尚未完成真实 Loader 装载、实际 writer provider、浏览器调用、人类点击、原生通知展开/持久化和模型可见输入闭环。没有安装插件、操作运行 GUI、发送真实续跑或模型请求、执行版本更新、消费 changeset、推送或发布。

owner 身份证明的是当前 Remote ACL 权限，不是 Host 对不可伪造人类手势的证明。可信 Client 的实际点击约束、兼容页面失效恢复与分发支持构建仍须各自实现和验收；不得把这些限制藏在“开箱即用”的表述中。
