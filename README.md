# paseo-better-sidechat

专为 Paseo 打造的 **Claude 侧边聊天（Sidechat）** 插件：在右侧栏（Explorer）随时就当前代码、报错、架构权衡向 Claude 提问，不打断主线编码任务、不污染主会话上下文，并完整实时适配 Paseo 内置的主题、思考与折叠设置。

---

## 功能亮点

1. **多入口秒开侧边聊天**
   - **主输入框快捷按钮（Composer Pill）**：在主会话输入框底部点击「侧边聊天」一键展开右侧面板。
   - **斜杠命令 `/btw [问题]` 与 `/sidechat [问题]`**：直接在主会话输入框输入 `/btw`（仅打开侧边面板）或 `/btw 为什么这里用 WeakMap？`（打开右侧侧边聊天并立即发送提问），完全复刻 Claude Code 终端 `/btw` 的顺手体验且支持多轮追问、不污染主会话历史。
   - **命令面板（Command Center）**：支持 `打开侧边聊天`、`新建侧边聊天` 与 `工作区侧边聊天`（搜索 `btw` 亦可直达）。

2. **主会话上下文同步 & 划词引用 & 结论回传**
   - **主会话上下文摘要**：默认在新侧边对话首轮自动提取主会话最近若干轮问答、修改/读取的文件与报错信息（支持点击眼睛图标预览完整摘要，或随时手动开关）。
   - **跨面板划词引用**：在主聊天记录或代码 Diff 中选中文本后，侧边输入框上方会自动浮现「引用选中内容」快捷标签，一键附带代码/报错片段。
   - **只读安全保护**：内置非破坏性系统提示词约束，默认引导侧边 Claude 自由检索与阅读代码，避免擅自修改主会话正在编辑的文件；同时支持在底部栏随时切换 `Auto` / `Plan` / `Always Ask` 模式、切换模型与调整 Claude **思考强度（Thinking Effort）**。
   - **一键回传主会话**：支持将侧边讨论得出的结论一键「插入主输入框」二次编辑，或直接「发给主会话」。

3. **完全适配 Paseo 内置设置（实时响应、无需重载）**
   - **主题与字体设置**：完全跟随 Paseo 当前主题（`Light`、`Dark`、`Zinc`、`Midnight`、`Claude`、`Ghostty`、`Pure black`、系统自动及第三方主题），继承 UI 字体（`--paseo-ui-font`）、等宽代码字体（`monoFontFamily` + `data-pmono`）、正文字号（`contentFontSize`）与代码字号（`codeFontSize`）。
   - **思考设置**：
     - 实时同步 Paseo 设置中的 **「始终展开推理」(Always expand reasoning / `autoExpandReasoning`)**：开启时默认展开全部思考链，关闭时流式预览单行并在思考结束后自动收起为可点击展开的「思考过程」标签。
     - 自动继承主 Claude 会话的 **思考强度 (`thinkingOptionId`)**，并支持在侧边输入框底部独立调整。
   - **折叠设置**：
     - 1:1 还原 Paseo 设置中的 **「聊天显示」(Chat display / `chatDisplay`)** 三种模式：
       - `折叠轮次 (collapseTurns)`：对话轮次进行中实时展示进度，回答完成后自动将中间思考与工具调用折叠为单行摘要（如 `思考 1 次 · 读取 2 个文件`），点击可随时展开。
       - `折叠工具调用 (collapseToolCalls)`：将连续工具调用合并为可展开的工具组徽章（当开启「始终展开推理」时，思考块自动独立展开不被吞入工具组）。
       - `完整显示 (full)`：逐条展示每一步思考与工具调用，点击任意工具行可展开命令、文件路径、Diff 与输出详情。
     - 同步支持长消息自动折叠、**对话大纲跳转 (`chatOutlineEnabled`)** 以及 **发送快捷键 (`Enter` / `⌘+Enter`)**。

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
