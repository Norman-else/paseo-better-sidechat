# paseo-better-sidechat

专为 Paseo 打造的 **通用 AI 侧边聊天（Universal Sidechat）** 插件：在右侧栏（Explorer）随时就当前代码、报错、架构权衡向任意 Paseo 已启用的模型（Claude、Codex、GitHub Copilot、OpenCode、Kimi、Antigravity、MiniMax、Cursor 及自定义 ACP 服务商）提问，不打断主线编码任务、不污染主会话上下文，并完整复用 Paseo 底部输入栏设计与全局设置。

---

## 功能亮点

1. **全服务商通用模型支持（Universal Providers & Models）**
   - 自动发现 Paseo 主机上已启用的所有内置与自定义 ACP / 插件服务商及可选模型。
   - 默认自动继承当前主会话正在使用的服务商、模型、权限模式与思考强度；也可在侧边底部胶囊中随时跨服务商自由切换（如主会话跑 Claude，侧边切 Codex 或 Kimi 做交叉验证）。
   - 动态适配各服务商原生官方 SVG 图标、专属权限模式（Claude / Codex / Copilot / OpenCode / OMP 等）以及扩展控制项（如 Claude `⚡` Fast Mode 开关）。

2. **多入口秒开侧边聊天**
   - **主输入框快捷按钮（Composer Pill）**：在主会话输入框底部点击「侧边聊天」一键展开右侧面板。
   - **斜杠命令 `/btw [问题]` 与 `/sidechat [问题]`**：直接在主会话输入框输入 `/btw`（仅打开侧边面板）或 `/btw 为什么这里用 WeakMap？`（打开右侧侧边聊天并立即发送提问），支持多轮追问且不污染主会话历史。
   - **命令面板（Command Center）**：支持 `打开侧边聊天`、`新建侧边聊天` 与 `工作区侧边聊天`（搜索 `btw` 亦可直达）。

3. **主会话上下文同步 & 划词引用 & 结论回传**
   - **主会话上下文摘要**：默认在新侧边对话首轮自动提取主会话最近若干轮问答、修改/读取的文件与报错信息（支持预览完整摘要，或通过 `+` 菜单 / 顶部胶囊随时开关）。
   - **跨面板划词引用**：在主聊天记录或代码 Diff 中选中文本后，侧边输入框会自动浮现「引用选中内容」快捷胶囊，一键附带代码或报错片段。
   - **只读安全保护 & 一键回传**：内置非破坏性系统提示词约束，避免擅自修改主会话正在编辑的文件；讨论得出的结论支持一键「插入主输入框」或「发给主会话」。

4. **完全适配 Paseo 内置设置与底部 UI（实时响应、无需重载）**
   - **原生底部工具栏**：1:1 对齐 Paseo 主会话底部的圆角浮层卡片、`+` 附件上下文菜单、官方服务商图标模型胶囊、思考强度胶囊、盾牌模式胶囊、扩展开关、上下文窗口进度环与圆形发送/停止按钮。
   - **多语言与主题字体同步**：完整内置 Paseo 全部 9 种界面语言（简中、英、日、韩、西、法、葡、俄、阿），完全跟随当前主题、UI 字体、等宽代码字体与字号。
   - **思考与折叠同步**：实时跟随 **「始终展开推理」(`autoExpandReasoning`)**、**「聊天显示」(`collapseTurns` / `collapseToolCalls` / `full`)**、**对话大纲跳转 (`chatOutlineEnabled`)** 及 **发送快捷键 (`Enter` / `⌘+Enter`)**。

---

## 安装与开发

确保 Paseo 中已开启 **Settings → Plugins → Enable plugins**。

### 从 GitHub 直接安装

```bash
paseo plugin add git:Norman-else/paseo-better-sidechat

# 后续更新插件
paseo plugin update paseo-better-sidechat
```

### 本地开发与调试

```bash
# 安装依赖与运行校验
npm install
npm run typecheck
npm test

# 安装本地插件目录到 Paseo
paseo plugin install /Users/normanzuo/PersonalRepos/paseo-better-sidechat

# 查看运行状态与日志
paseo plugin ls
paseo plugin logs paseo-better-sidechat

# 修改代码后热重载插件（无需重启 Paseo daemon）
paseo plugin reload paseo-better-sidechat
```
