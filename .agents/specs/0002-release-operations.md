# 质量检查与自动发布操作说明

编号：GUIDE-001。更新：2026-11-11。依据：RFC-001、SPEC-001。验证范围见 EVIDENCE-011。

## 发布模型

Semifold 是唯一版本和发布编排入口。代码变更连同 smif commit 创建的 changeset 合入 main 后，Quality and Release 工作流先执行完整工程检查和打包清单验证，再调用 smif ci 创建或更新 release 发布 PR。维护者审阅目标版本和变更日志、批准机器人 PR 的质量工作流并等待通过，然后合并该发布 PR。下一次 main 工作流没有待消费 changeset 时，smif ci 发布 npm 包并创建 GitHub Release。

本次基础版本为 0.0.0，minor 计划的首次目标为 0.1.0。不要为了首次发布在本地运行真实 smif version 或 smif publish，也不要手工删除 changeset。自动化合并发布 PR 后主分支才持有 0.1.0；后续版本继续按新 changeset 规划。

## 一次性远端准备

1. 将已审阅配置正常提交并合入 main；提交与推送须有明确授权。本次后续推送已由用户单独授权，main 推送按工作流触发质量检查与发布 PR 流程，不自动合并发布 PR。
2. 在 GitHub 仓库 Settings → Actions → General 确保允许所使用的 Actions，启用 Allow GitHub Actions to create and approve pull requests。发布作业声明 contents 与 pull-requests 写权限；组织策略也须允许。当前只读核对显示该仓库允许工作流写入与创建 PR，不代表策略永不变化。
3. 在 Settings → Secrets and variables → Actions 配置名为 NPM_TOKEN 的 secret。使用有权首次创建并发布 dsh-client-manual-continue 的 npm 凭据，并按 npm 当前规则允许非交互发布；不能将令牌写入源码、日志或上下文。
4. npm 账号须有目标包名的发布权限。若名称已被其它主体占用，应先解决命名或授权，不能靠重跑绕过。
5. 将 Quality 设为 main 的必需检查，并要求审阅发布 PR。本轮未修改保护规则，不能声称已经强制禁止未检查的合并。

包采用 MIT 公开 npm 分发。源码仓库已按用户额外授权改为 public；发布明确使用 --provenance，包 repository 与实际来源匹配，使用 GitHub 托管 runner，并仅给发布作业 id-token 写权限。NPM_TOKEN 仍负责 npm 认证，provenance 使用的 OIDC 身份不等于已经配置 npm trusted publishing；若未来要去掉令牌，须先完成 npm trusted publisher 的独立绑定与验证。

## 质量门禁

- PR 目标 main、main 推送及手动工作流运行质量作业；没有路径过滤，不跳过纯配置改动。
- 使用 Ubuntu 24.04、Node.js 24.21.0、包声明的 pnpm 11.28.5、Semifold 0.3.5；Action 实现按提交固定。完整工程脚本保留 tsdown、官方 Remote 生成、三个 tsrs 程序、Biome 与全部离线测试。
- check:package 使用 npm pack 的 dry-run 清单，不写发布包、不运行生命周期脚本。检查包身份、MIT/public 元数据、必要资源、声明文件和全部导出目标，拒绝工程上下文、测试、依赖或隐藏文件混入。它验证打包完整性，不代替真实安装验收。
- 质量作业无发布 secret，只有 contents 只读权限。发布作业依赖质量成功，只允许 main，重新构建同一提交并复查包；不缓存发布产物。
- 发布串行且不取消在途操作。旧 main 提交若已被新提交取代则跳过；检查和推送之间仍可能出现新提交，最终由后续 main 运行刷新 release PR，不宣称跨远端变更原子发布。

本地已有依赖时可运行：

```sh
pnpm run check
pnpm run check:package
pnpm run release:check
pnpm run release:status
pnpm run release:version --dry-run
```

## 发布 PR 与重试

- GITHUB_TOKEN 负责分支、PR 和 Release，不要求额外 PAT。GitHub 可能要求对其创建或更新的 PR 工作流先由有写权限的维护者点击 Approve workflows to run；应完成检查后再合并，不为规避批准改用 pull_request_target 执行 PR 代码。
- NPM_TOKEN 只交给最终 Semifold 步骤；缺少它不影响有 changeset 时创建版本 PR，但进入 npm 发布时会失败，需先补齐再重跑。
- 已有 npm 版本由 Semifold 注册表预检查跳过；npm 已成功而 GitHub Release 失败时，可在修复 GitHub 权限后重跑以补建 Release。不要手动重发同版本或另建绕过 Semifold 的 npm 发布任务。
- 使用 GitHub 的 Re-run failed jobs，或在 main 运行 workflow_dispatch 进行修复后的重试；其它分支手动触发只做质量检查。没有自动合并发布 PR，也没有发布后自动发送模型请求。

## 官方依据

- Semifold 首次发布：https://semifold.noctisynth.org/docs/getting-started/first-release/
- Semifold CI 契约：https://semifold.noctisynth.org/docs/commands/ci/
- Semifold 0.3.5 工作流模板：https://github.com/noctisynth/semifold/blob/semifold-v0.3.5/crates/semifold/assets/semifold-ci.yaml.jinja
- GitHub 工作流触发与令牌行为：https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow
- npm provenance：https://docs.npmjs.com/generating-provenance-statements/
- npm trusted publishing：https://docs.npmjs.com/trusted-publishers/
