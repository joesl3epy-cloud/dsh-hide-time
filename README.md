# dsh-hide-time

> 隐藏 DSH 侧栏里会话行右侧的相对时间戳（「刚刚」/「7小时」/「1天」）。

只做一件事的小插件。装上前时间戳还在，装上后那一片空白。

> **非官方插件**。与 DeepSeek、DSH 的维护者没有隶属关系。DSH 是 DeepSeek 官方桌面应用，
> 闭源分发；本插件**不包含**它的任何代码，只在前端按它的 DOM 结构做最小的显隐处理。

## 为什么

侧栏每个会话右边都挂着「刚刚」「7小时」「1天」。对一天开几十个会话的人来说，这个信息
既不准（不会自动刷新）、又占地方、还容易和标题抢注意力。

如果你也是「不看时间、只看标题」的人，这个插件就是给你准备的。

## 装法（本地路径，未发布到 npm）

```bash
# 1. profile 的 package.json 里加一条本地依赖（绝对路径）
cd ~/.dsh/profiles/<profile>
#      "dsh-hide-time": "file:/绝对路径/dsh-plugins/sidebar-hide-time"

# 2. 用 DSH 自带的 pnpm 装
node "/Applications/DeepSeek Harness.app/Contents/Resources/runtime/primary-runtime/dependencies/pnpm/bin/pnpm.mjs" install --dir .

# 3. 在同一个 package.json 的 dsh.profile.bundles 里登记 "dsh-hide-time"
# 4. 重启 DSH
```

改完源码后如果 `node_modules` 里的副本没跟着变，这是 pnpm 对 `file:` 目录依赖的正常行为：
把 `node_modules/dsh-hide-time` 挪走再 `pnpm install --force`。

前端插件是**启动时一次性组装**的，改代码后刷新页面无效，必须重启 DSH。

## 怎么识别时间戳（三条同时成立才动手）

1. **在侧栏内** —— `aside` 或 `[class*="sidebar"]`。找不到侧栏就什么都不做，
   **绝不回退到 `document.body` 全页扫描**。
2. **class 里有一段以 `_time` 结尾** —— 如 `JoiKIa_time`。DSH 用 CSS Modules，类名带哈希
   （`_item_u7vgf_24`），每次升级都变，但语义后缀稳定。`x_timeout` 这类不会被误认。
3. **整个元素的文字符合时间格式** —— 且它自己不是别的 `_time` 节点的祖先。

只看文本是不够的：会话标题叫「昨天」、分组叫「3天前整理」都会中招。加上第 1、2 条之后，
误伤的窗口被压到很小。**认不出就不隐藏**——这是刻意的取舍。

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

## 性能

- 只观察侧栏子树（`childList` / `subtree` / `characterData`），不观察整个页面
- 侧栏还没出现时只观察 `documentElement` 等它出现，出现后立刻收窄
- 变更做 120ms 防抖；另有 3s 一次的轻量检查，应对侧栏被整体重建

## 已知限制

- 依赖 DSH 保留 `_time` 这个语义类名后缀。上游若重命名，插件会**停止隐藏**（不是乱隐藏）。
- 只处理侧栏会话行；对话正文与设置页不碰。
- 只在 macOS 上实测（见下）。Windows/Linux 未测试。

## 测试

```bash
node --test test/     # 8 项行为测试
node check.mjs        # 静态契约 + 加载器判定重放
```

测试自带极简 DOM 桩（含 `MutationObserver` 与节点复用场景），在 `vm` 里加载真实 `client.js`，
不需要浏览器，也不接触你正在用的 DSH。

涵盖：会话行内时间被隐藏、同名的标题不被隐藏、class 不含 `_time` 不动、不在会话行内不动、
没有侧栏时不做全页扫描、节点复用后恢复原状、停用后全部恢复、factory 本身无副作用。

## 实测环境

| 项 | 版本 |
|---|---|
| DSH | 0.2.1-rc.5（Electron 44.7.0，内嵌 Node 24.21.0） |
| Node（跑测试用） | 24.21.0 / 26.11.1 |
| 系统 | macOS（Apple Silicon） |

## License

MIT —— 见 [LICENSE](./LICENSE)。

自检脚本支持中文、空格等本地目录名。页面尚未加载完成时停用插件，也会取消待启动监听。
