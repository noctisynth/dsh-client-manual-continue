# Client 原位适配与分发构建验证

编号：EVIDENCE-007。日期：2026-11-08（Asia/Shanghai）。范围：本项目 Client、只读 owner 探测、分发源码和离线组合；不是当前 GUI、人类点击或生产支持构建验收。

## 来源与观察边界

本次用户通过明确选择允许页面结构兼容代码开发，不扩大安装、操作运行 GUI 或真实请求授权。需求和方案分别由 RFC-001、SPEC-001 管理。

本轮早期只读 Client Inspect 返回 conversation.input.right 的正式 session Slot 与标准 props。后续独立复核时 Client Inspect 超时，未擅自刷新或重连页面。Host Config 正式目录成功解析目标包，实际部署 Client 产物与 README 可读；部分安装内声明文件不可读，改用精确版本公开 SDK 声明并与部署实现交叉核对。下述结构是静态来源观察，不是活 DOM 测量。

- 目标部署与所用公开 DSH SDK 基线为 0.2.2-rc.1；相同版本不等于所有构建一致。
- input.right 在主按钮之前，不是主按钮席位。原生主按钮是带 aria-busy 的 button[type=button]，不是 submit；独立 Stop 可能同类名但没有该属性。card、seat、conversation occurrence 和 Session 标记用于限定实例，不能全局取首个或从文案推身份。
- GRgSLq 的 standardControls、trailing、row、primary 是目标部署 CSS-module 结构签名，不是公共稳定 API。原生 Tooltip 的最终 wrapper 本轮未在浏览器确认；实现只接收已限定的直接父级结构，未知 wrapper 保留原界面。
- 正式 InputState 包括 draft、attachmentIds、draftRev、phase、claim、occurrences、queue。原生 trim 后 empty 不代表没有草稿；插件要求原始文字和结构化内容都为空。IME 不在该公共状态中，目标部署维护 data-composer-composing，兼容层只观察该标记和局部编辑事件，不增加 Enter 接管或猜测延时。
- 公开 ClientRemoteAccess 不暴露 principal/owner；ACL hook 对有 grant 的非 owner 也可能为真。正式 Connection generation 只在事件流 ready 后存在，断连即失效；只用 id，不读取 home 或以 loopback/interactions 代替权限。

## 已落实的契约与隔离

Host 增加无 JSON 参数的只读 availability，经真实 invocation/owner/lifetime/signal 检查后读取在线能力，不查 Agent/Session、不维护活动、不 flush、不生成输入、不唤醒。available 只证明该连接当前可用此入口，不承诺某会话能准入；submit 始终重做原有全部权威检查。

Client 按连接代际缓存该证明；从正式会话 binding、session/status/projection、input facade 和 composer block source 即时读取目标事实。Slot 仅放隐藏锚点，实际自有按钮在原按钮的准确父级席位；不移动或替换原节点，不复写原回调或提交草稿。精确 native 元素仲裁、私有 token 样式和条件恢复管理自有修改；断开、结构/代际/会话变化、编辑、卸载或外部移除自有节点时还原。

真实 click 的本地信任标志与当下结构再次检查；模型执行授权仍由 Host 判断。effects、observer、连接恢复仅更新显示或进行只读 owner 查询，绝不自动提交。未知提交只读对账；对账被拒绝不把原未知结果改为可再投。候选因本次已受理输入消失时不取消原生工作。

## 实际工程问题与处理

- Host 与 Client 的 Context.sessions 是不同面，生产环境分别检查；Client 测试另用 Node/DOM 程序，未让 Host 获得浏览器全局。
- 公开 Client 声明依赖部分未作为传递依赖安装的正式包；按真实 TS2307 引用链逐项补精确开发依赖，并载入正式 generated Remote namespace augmentation。未造 SDK 声明、修改依赖代码或关闭诊断。与当前声明路径无关的完整宿主 peer 未为消警告批量安装。
- SDK 的样式副作用导入使用标准浏览器 CSS 资产声明，不用空 SDK 模块代替实际能力。
- 未找到可用官方 Client tsdown preset，未发明该导出。按正式 ClientBundleRegistration 输出原生 lazy-CJS factory，全部模块正文在 materialization 内，React 由宿主共享；只捆绑 strict codec 必需的协议辅助代码和 Zod，保留 MIT 通知。
- tsdown 的 CJS 默认走 Node 平台；首构建警告已按实际工具契约设置显式 browser input 平台，未静默忽略。构建在 Host 与正式 Remote 生成之后执行 Client，避免清理或读取陈旧元数据。
- Biome 指出组件工厂及额外依赖问题，已改为模块级稳定组件和正式 Slot inject 业务面；controller 在 layout effect 新建与清理，避免 StrictMode 重用已 disposed 实例。每次 commit 更新命令式适配器，只有真正新 InputState 发布能清除编辑旧快照锁。

## 直接验证

统一质量入口已运行：Host、生产 Client、Client 测试三个严格类型程序、Biome、Host/Client 构建、官方非空 Remote 生成及本项目全部 202 项测试通过。测试使用实际 SDK 注册表/生成调用工厂与明确的 Agent、Gateway、transport double，以及 jsdom 的小 DOM fixture；没有实际模型驱动、HTTP 业务或 GUI 操作。

离线验证覆盖完整草稿/引用/附件/队列、连接代际和 owner 证明、旧响应与卸载、未知只对账、不复投、两会话/同会话多 occurrence、唯一主按钮与独立 Stop、未知 wrapper、焦点不抢夺、IME、外部节点移除、条件还原及 observer 不自循环。脚本 click 被拒绝，未伪造可信浏览器手势。

原生产物在小型 VM 中验证 script 阶段仅注册一个正式形状的 factory、不加载 React、不触碰 DOM/计时器/网络或新增全局；materialization 只 require 宿主共享 React，不自动 apply，允许的库全局变化仅为实际 Zod 的两个 metadata cache。该测试不等于真实 Client Loader 装载。双语言键/占位符与元数据、图标自包含结构/大小及第三方通知已检查；没有声称图标像素渲染已通过。

最终 pack dry-run 核对的范围为 32 个声明文件，包含 Host、Client、Remote、源码类型、bundle patch、locale、图标及许可通知；不含依赖、测试、上下文、缓存或本机配置。Semifold 配置同步检查通过，产品 changeset 已生成且未消费；没有实际打包发布、版本更新或安装。

## 未验收事项

真实 Loader 组合、安装资源显示、Tooltip 最终结构、几何原位/窄屏、真实键盘/IME/菜单/Portal/Esc-Esc、刷新/重连/禁用/卸载、实际 writer provider、原生通知持久化与模型可见输入闭环仍需单独授权和实际验收。离线通过数不替代这些结果；当前不声明任何构建已达到生产开箱即用，也未消费 changeset、改版本、解除 private、推送或发布。
