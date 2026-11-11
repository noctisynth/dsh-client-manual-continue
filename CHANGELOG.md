# Changelog

<!-- semifold:release version=0.1.0 -->
## v0.1.0

### Bug Fixes

- [`d5331b2`](https://github.com/noctisynth/dsh-client-manual-continue/commit/d5331b220c64b4e019cbe3f90add660628d0b9ab): 查找原位主按钮时排除模型选择辅助控件子树，修复 aria-busy 模型按钮被误判为重复主动作导致续跑按钮隐藏。
- [`d5331b2`](https://github.com/noctisynth/dsh-client-manual-continue/commit/d5331b220c64b4e019cbe3f90add660628d0b9ab): 动态识别输入栏 CSS-module 前缀，修复不同构建哈希导致原位续跑按钮无法显示；保留局部结构、唯一性、完整草稿和授权检查。
- [`5067144`](https://github.com/noctisynth/dsh-client-manual-continue/commit/5067144db8ca9a6a365323ebd49054cfb54911dc): 修复手动停止后按钮不出现：挂载描述符后注入动态 Remote 命名空间，并使用子上下文的受信调用面。

    移除继续成功后的额外受理横幅和对应文案，保持原位继续按钮及原生发送/停止；补充真实 Cordis 关联服务回归与只读匿名状态核验。

- [`5cebafa`](https://github.com/noctisynth/dsh-client-manual-continue/commit/5cebafa63033a56c10be1e483260e5a1d03cfbd8): 修复 GitHub CI 使用未由预构建安装提供的 smif 命令导致检查失败；发布脚本统一使用 semifold 并在安装后检查可执行入口。

### Chores

- [`7350d87`](https://github.com/noctisynth/dsh-client-manual-continue/commit/7350d87699d1f0d9ec4a85cf583e31badfc6b328): 采用 MIT 公开分发，增加质量门禁、打包完整性检查和 Semifold 发布 PR / 自动发布流程。
- [`e2c3713`](https://github.com/noctisynth/dsh-client-manual-continue/commit/e2c3713f610528d3cfb1e3b7ab0e83c215392d26): 整理用户指南，补充安装、继续按钮操作与会话记录说明。

### New Features

- [`b9ee877`](https://github.com/noctisynth/dsh-client-manual-continue/commit/b9ee877556a749354c549c65f56bc74f758f0830): 增加版本与结构限定的原位手动续跑 Client、只读 owner 能力探测和完整草稿检查；连接代际、IME、失配及卸载时还原宿主主按钮，未知结果只对账不补投。

    提供共享 React 的原生惰性 Client 入口、双语言元数据和图标，完善 Host/Client 类型隔离与分发构建。

- [`fb8c77e`](https://github.com/noctisynth/dsh-client-manual-continue/commit/fb8c77e7808bd6fef8561f39d1e847dc39c73455): 实现受信 Remote 手动续跑操作、fork 隔离的资格与接受证据投影，以及原生活动收尾和 checkpoint 核对；未知结果只对账，取消或卸载不清除已接受输入。
- [`419249a`](https://github.com/noctisynth/dsh-client-manual-continue/commit/419249ae8d2fe19437ca45fc0a5b4f285b23433e): Add strict TypeScript tooling, committed-event continuation qualification, and offline plugin-source message construction; live continuation remains unavailable pending trusted Host and primary-action contracts.
- [`419249a`](https://github.com/noctisynth/dsh-client-manual-continue/commit/419249ae8d2fe19437ca45fc0a5b4f285b23433e): Add bounded committed-log reconciliation for plugin continuation inputs, preserving unknown outcomes and detecting conflicting operation identities without inferring model execution or durability.
<!-- semifold:release:end -->
