# dsh-hide-time · 给侧栏减少一项低优先级信息

隐藏 DeepSeek Harness（DSH）侧栏会话行右侧的相对时间戳，让侧栏保留更简洁的信息展示。

**作者：Jolyon · 当前公开版本：1.0 · macOS 自用项目 · AI 辅助开发**

[下载公开版本](https://github.com/joesl3epy-cloud/dsh-hide-time/releases/tag/v1.0.0) · [反馈问题](https://github.com/joesl3epy-cloud/dsh-hide-time/issues) · [配套工具：桌宠审批](https://github.com/joesl3epy-cloud/dsh-pet-approval)

## 开关方式

安装后沿用DSH插件列表的启用／停用入口，不额外增加插件内开关。需要重启才能应用的宿主版本，按宿主提示操作。

## 为什么隐藏时间

我希望把侧栏每一行有限的空间，留给更有用的内容。对我而言，标记一个会话「待回看」比看到它是「7 小时前」更有帮助；相对时间并不是我选择会话时最关心的信息，所以先把它隐藏。

本插件只完成隐藏时间这一件事，**不提供待回看标志，也不新增其他标签**。为其他信息留出展示空间，是我的使用动机，不代表这些能力已经实现。

## 使用前后

| 状态 | 侧栏显示 |
|---|---|
| 启用前 | 会话标题旁保留 DSH 原有的相对时间 |
| 启用后 | 满足识别条件的会话时间被隐藏，标题保留 |
| 停用后 | 恢复原有显示 |

它面向与我有类似信息偏好的使用者；需要按时间查找会话的人，可以保留 DSH 原有界面。

## AI 协作过程

我负责提出侧栏信息取舍的需求，与 ChatGPT / Codex 讨论方案，让 DeepSeek 完成主要实现，再根据实际使用和检查结果迭代。ChatGPT / Codex 也参与了后续代码审查、修复与验证。

这是 AI 辅助的 Vibe Coding 项目，代码并非由我逐行独立编写。它展示的是一次范围明确的改进过程：选择一个真实问题，保持功能克制，并检查误隐藏、节点复用和停用恢复等边界。

我已在 macOS 中持续自用一段时间，尚未对效率变化做量化测量。

## 项目说明

这是非官方 DSH 插件，与 DeepSeek 或 DSH 维护者没有隶属关系。插件通过前端脚本调整符合条件的侧栏节点显示，不修改 DSH 官方应用文件。DSH 的 DOM 结构与类名属于兼容依赖，并非保证不变的公开接口。

## 安装（macOS，本地依赖）

需要 Node ≥ 20、DSH。此插件不依赖 dsh-pet 或 Session Manager。仅在 macOS 环境使用验证，Windows/Linux 未验证。当前从 GitHub 获取源码，不使用 `npm install dsh-hide-time` 安装未发布的 npm 包。

1. 下载上方公开版本并解压到稳定目录，或克隆仓库：

```bash
git clone https://github.com/joesl3epy-cloud/dsh-hide-time.git
```

2. 打开实际使用的 `<DSH_HOME>/profiles/<profile>/package.json`，将以下依赖**合并进现有 dependencies**；路径改成插件的真实绝对路径：

```json
{
  "dsh-hide-time": "file:/绝对路径/dsh-hide-time"
}
```

3. 在同一个文件的 `dsh.profile.bundles` 数组中加入 `"dsh-hide-time"`。保留其他依赖、bundles 和配置，上面的片段不能整份覆盖 profile 文件。
4. 在 profile 目录中使用 DSH 自带的 pnpm 安装：

```bash
node "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs" install --dir "/实际DSH_HOME/profiles/实际profile"
```

应用安装位置不同时，按实际位置调整。首次安装前保留原 profile 配置；安装后重启 DSH，不能只刷新页面。

首次验证时，检查会话时间被隐藏、名为「昨天」的标题仍保留。日常通过宿主插件列表启停。手工配置安装的环境也可从 bundles 移除并重启；彻底卸载再移除依赖并更新安装。不会删除会话内容。

本地开发中若 file: 依赖的安装副本未更新，应核对安装文件与源码，再由测试环境重新安装验证，不能仅凭源码已修改就认定运行进程已更新。

## 如何识别时间戳

插件同时检查侧栏范围、会话行结构、以 `_time` 结尾的类名，以及完整匹配相对时间格式的文本。找不到侧栏或识别条件不足时跳过，不退回全页扫描。

会话标题即使叫「昨天」，也不会仅因文字像时间就被隐藏。类名与会话行结构依赖当前 DSH 实现，上游改动后可能需要适配。

被认出来的写法：

```
刚刚 | 今天 | 昨天 | 前天
N秒 N分钟 N小时 N天 N日 N周 N星期 N个月 N年
（可带「前」「后」「以前」「之前」后缀）
```

## 节点复用与卸载

React 会复用 DOM 节点：一个被隐藏的时间 span 可能被拿去渲染别的文字。插件每次扫描先
检查已标记的节点——一旦它不再满足上面三条，立刻恢复原来的 `display` 并去掉标记。

停用插件（从 `bundles` 移除后重启）时，`stop()` 会断开 `MutationObserver`、清掉定时器、
把所有被隐藏的节点恢复原状。插件不在时不应留下任何痕迹。

## 更新与扫描范围

- 只观察侧栏子树（`childList` / `subtree` / `characterData`），不观察整个页面
- 侧栏还没出现时只观察 `documentElement` 等它出现，出现后立刻收窄
- 变更做 120ms 防抖；另有 3s 一次的轻量检查，应对侧栏被整体重建

## 已知限制

- 依赖 DSH 保留 `_time` 这个语义类名后缀。上游若重命名，插件会**停止隐藏**（不是乱隐藏）。
- 只处理侧栏会话行；对话正文与设置页不碰。
- 只在 macOS 上实测（见下）。Windows/Linux 未测试。

## 测试

```bash
npm test             # 8 项行为测试
node check.mjs        # 静态契约 + 加载器判定重放
```

测试自带极简 DOM 桩（含 `MutationObserver` 与节点复用场景），在 `vm` 里加载真实 `client.js`，
不需要浏览器，也不接触你正在用的 DSH。

涵盖：会话行内时间被隐藏、同名的标题不被隐藏、class 不含 `_time` 不动、不在会话行内不动、
没有侧栏时不做全页扫描、节点复用后恢复原状、停用后全部恢复、factory 本身无副作用。

## 已记录的使用与测试环境

| 项 | 版本 |
|---|---|
| DSH | 0.2.1-rc.5（Electron 44.7.0，内嵌 Node 24.21.0） |
| Node（跑测试用） | 24.21.0 / 26.11.1 |
| 系统 | macOS（Apple Silicon） |

## 版本记录

见 [CHANGELOG](./CHANGELOG.md)。1.0 确认已有单一功能范围，保留0.2.1历史版本。

## License

MIT —— 见 [LICENSE](./LICENSE)。

自检脚本支持中文、空格等本地目录名。页面尚未加载完成时停用插件，也会取消待启动监听。
