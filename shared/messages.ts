import { extraLocales } from "./locales";

export const en = {
  panelTitle: "Sidechat",
  workspacePanelTitle: "Workspace Sidechat",
  pillLabel: "Sidechat",
  pillRunningLabel: "Sidechat · Running",
  openSidechat: "Open Sidechat",
  newSidechat: "New Sidechat",
  slashDescription: "Ask a side question in Claude Sidechat without interrupting the main chat",
  slashHint: "[question]",
  settingsTitle: "Better Sidechat",

  // Header & Thread switcher
  newThread: "New thread",
  threadsTitle: "Sidechat threads",
  noThreadsYet: "No threads yet",
  untitledThread: "New Sidechat",
  archiveThread: "Archive thread",
  openAsMainTab: "Open in main tab",
  outlineTitle: "Jump to prompt",
  openSettings: "Sidechat settings",
  collapseAll: "Reset folds",
  scrollToBottom: "Scroll to bottom",

  // Empty state & starters
  emptyTitle: "Ask Claude on the side",
  emptySubtitle:
    "Explore code, unpack errors, or compare approaches without polluting your main session.",
  starterExplainTitle: "Explain recent changes",
  starterExplainPrompt:
    "Based on the main session and current files, explain how the recent logic works and why it is structured this way.",
  starterEdgeCasesTitle: "Check edge cases",
  starterEdgeCasesPrompt:
    "Review the approach in the main session for subtle edge cases, race conditions, or error-handling gaps.",
  starterCompareTitle: "Compare alternatives",
  starterComparePrompt:
    "What are the cleaner or simpler alternative designs here, and what are their trade-offs?",
  starterTraceTitle: "Trace call flow",
  starterTracePrompt:
    "Trace the end-to-end data and call flow around the code currently being worked on.",

  // Context & Selection
  mainContextAuto: "Main context · Auto",
  mainContextAttached: "Main context · On",
  mainContextOff: "Main context · Off",
  mainContextBadge: "Main session context attached",
  quotedSelectionBadge: "Quoted snippet",
  quoteSelectionChip: "Quote selection",
  clearQuote: "Remove quote",
  previewMainContext: "Preview main session context",
  noMainAgent: "No active main session",
  mainContextTurns: "{{count}} recent turns",

  // Timeline: Thinking & Collapse
  thinkingStreaming: "Thinking…",
  thinkingDone: "Thought process",
  showMore: "Show more",
  showLess: "Show less",
  summaryThought_one: "Thought {{count}}x",
  summaryThought_other: "Thought {{count}}x",
  summaryRead_one: "Read {{count}} file",
  summaryRead_other: "Read {{count}} files",
  summaryEdited_one: "Edited {{count}} file",
  summaryEdited_other: "Edited {{count}} files",
  summaryCommand_one: "Ran {{count}} command",
  summaryCommand_other: "Ran {{count}} commands",
  summarySearch_one: "Searched {{count}}x",
  summarySearch_other: "Searched {{count}}x",
  summaryOther_one: "{{count}} tool",
  summaryOther_other: "{{count}} tools",
  turnWorkFallback: "Completed intermediate steps",
  runningWorkPrefix: "Working",
  compactingContext: "Compacting context…",
  compactedContext: "Context compacted",
  todosTitle: "Tasks",

  // Assistant actions & Main handoff
  copyAnswer: "Copy",
  copied: "Copied to clipboard",
  copyFailed: "Unable to copy",
  insertToMain: "Insert to main",
  insertedToMain: "Inserted into main composer",
  sendToMain: "Send to main",
  sentToMain: "Sent to main session",
  transferFailed: "Could not send to main session",
  transferHeaderWithQuestion: 'Context from Sidechat (re: "{{question}}"):',
  transferHeaderPlain: "Notes from Sidechat:",
  transferSendFooter: "Please incorporate these findings into the current task.",

  // Permissions
  permissionRequired: "Permission requested",
  allowPermission: "Allow",
  denyPermission: "Deny",

  // Composer & Controls
  composerPlaceholder: "Ask a side question… ({{shortcut}} to send)",
  sendButton: "Send",
  stopButton: "Stop",
  stoppingToast: "Interrupted sidechat turn",
  modelLabel: "Model",
  thinkingLabel: "Thinking",
  thinkingDefault: "Default",
  thinkingOff: "Off",
  modeLabel: "Mode",
  modeAuto: "Auto",
  modePlan: "Plan (Read-only)",
  modeDefault: "Always Ask",
  modeAcceptEdits: "Accept Edits",
  enterShortcut: "Enter",
  modEnterShortcut: "⌘/Ctrl+Enter",

  // Settings Screen
  settingsHostSyncSection: "Synced Paseo Host Settings",
  settingsHostSyncInfo:
    "Better Sidechat automatically follows Paseo's Language, Appearance, and Chat settings in real time.",
  hostLanguageLabel: "Active Paseo Language",
  hostThemeLabel: "Active Paseo Theme",
  darkMode: "Dark",
  lightMode: "Light",
  hostReasoningLabel: "Thinking Display (Always expand reasoning)",
  hostReasoningExpanded: "Always expanded",
  hostReasoningCollapsed: "Collapsed when finished",
  hostCollapseLabel: "Collapse Mode (Chat display)",
  hostCollapseTurns: "Collapse turns",
  hostCollapseTools: "Collapse tool calls",
  hostCollapseFull: "Full",
  hostTypographyLabel: "Typography & Shortcut",
  hostTypographyValue: "Prose {{content}}px · Code {{code}}px · Send {{shortcut}}",

  settingsBehaviorSection: "Sidechat Defaults",
  settingContextModeLabel: "Attach main session context",
  settingContextModeHint:
    "When to include a compact digest of your main Claude session in sidechat messages",
  contextModeFirstTurn: "First message of each thread",
  contextModeAlways: "Every message",
  contextModeManual: "Only when toggled manually",
  settingContextTurnsLabel: "Context window (recent turns)",
  settingContextTurnsHint: "Number of recent main-session turns summarized when attaching context",
  settingDefaultModeLabel: "Default Claude permission mode",
  settingDefaultModeHint: "Controls how Claude runs tools inside Sidechat threads",
  defaultModeAuto: "Auto mode",
  defaultModePlan: "Plan mode (strictly no tool execution)",
  defaultModeAsk: "Always Ask",
  defaultModeInherit: "Inherit from main session",
  settingReadOnlyGuardLabel: "Safe read-only guard prompt",
  settingReadOnlyGuardHint:
    "Instructs Sidechat Claude to inspect freely without modifying workspace files unless explicitly asked",
  settingPreferClaudeLabel: "Prefer Claude models",
  settingPreferClaudeHint:
    "Default new sidechat threads to Claude even when the main session uses another provider",
  settingComposerPillLabel: "Show Sidechat button in main composer",
  settingComposerPillHint: "Adds a one-click Sidechat pill to active main sessions",
  resetDefaultsLabel: "Reset defaults",
  resetDefaultsHint: "Restore Better Sidechat plugin preferences to their default values",
  resetAction: "Reset",
} as const;

export type MessageKey = keyof typeof en;
export type LocaleTable = Record<MessageKey, string>;

export const zh: LocaleTable = {
  panelTitle: "侧边聊天",
  workspacePanelTitle: "工作区侧边聊天",
  pillLabel: "侧边聊天",
  pillRunningLabel: "侧边聊天 · 思考中",
  openSidechat: "打开侧边聊天",
  newSidechat: "新建侧边聊天",
  slashDescription: "在 Claude 侧边聊天中提问，不打断或污染主会话上下文",
  slashHint: "[问题]",
  settingsTitle: "侧边聊天 (Better Sidechat)",

  // Header & Thread switcher
  newThread: "新建对话",
  threadsTitle: "侧边对话列表",
  noThreadsYet: "暂无历史侧边对话",
  untitledThread: "新建侧边对话",
  archiveThread: "归档此对话",
  openAsMainTab: "在主标签页打开",
  outlineTitle: "问题大纲跳转",
  openSettings: "侧边聊天设置",
  collapseAll: "重置展开项",
  scrollToBottom: "滚动到底部",

  // Empty state & starters
  emptyTitle: "随时在侧边向 Claude 提问",
  emptySubtitle: "不打断主线任务、不污染主上下文，顺畅探索代码细节、报错原因与设计权衡。",
  starterExplainTitle: "解释当前改动逻辑",
  starterExplainPrompt: "结合主会话进度与当前代码，帮我清晰梳理一下这部分逻辑是怎么工作的，以及为什么这样设计。",
  starterEdgeCasesTitle: "排查边界与竞态问题",
  starterEdgeCasesPrompt: "帮我检查一下主会话当前实现里是否有潜在的边界条件遗漏、异步竞态或异常处理问题。",
  starterCompareTitle: "对比替代实现方案",
  starterComparePrompt: "针对当前需求，有没有更简洁或更稳健的替代方案？各自有什么优缺点？",
  starterTraceTitle: "梳理完整调用链",
  starterTracePrompt: "帮我梳理当前涉及模块从入口到核心逻辑的完整数据流与调用链。",

  // Context & Selection
  mainContextAuto: "主会话上下文 · 首轮自动",
  mainContextAttached: "主会话上下文 · 已开启",
  mainContextOff: "主会话上下文 · 关闭",
  mainContextBadge: "已附带主会话上下文",
  quotedSelectionBadge: "引用片段",
  quoteSelectionChip: "引用选中内容",
  clearQuote: "移除引用",
  previewMainContext: "查看主会话上下文摘要",
  noMainAgent: "当前无活跃主会话",
  mainContextTurns: "最近 {{count}} 轮对话",

  // Timeline: Thinking & Collapse
  thinkingStreaming: "思考中…",
  thinkingDone: "思考过程",
  showMore: "展开全文",
  showLess: "收起",
  summaryThought_one: "思考 {{count}} 次",
  summaryThought_other: "思考 {{count}} 次",
  summaryRead_one: "读取 {{count}} 个文件",
  summaryRead_other: "读取 {{count}} 个文件",
  summaryEdited_one: "编辑 {{count}} 个文件",
  summaryEdited_other: "编辑 {{count}} 个文件",
  summaryCommand_one: "执行 {{count}} 条命令",
  summaryCommand_other: "执行 {{count}} 条命令",
  summarySearch_one: "搜索 {{count}} 次",
  summarySearch_other: "搜索 {{count}} 次",
  summaryOther_one: "调用 {{count}} 个工具",
  summaryOther_other: "调用 {{count}} 个工具",
  turnWorkFallback: "已完成中间步骤",
  runningWorkPrefix: "执行中",
  compactingContext: "正在压缩上下文…",
  compactedContext: "上下文已压缩",
  todosTitle: "任务清单",

  // Assistant actions & Main handoff
  copyAnswer: "复制",
  copied: "已复制到剪贴板",
  copyFailed: "复制失败",
  insertToMain: "插入主输入框",
  insertedToMain: "已插入主会话输入框",
  sendToMain: "发给主会话",
  sentToMain: "已发送到主会话",
  transferFailed: "发送到主会话失败",
  transferHeaderWithQuestion: "来自侧边聊天（关于「{{question}}」）的结论：",
  transferHeaderPlain: "来自侧边聊天的参考结论：",
  transferSendFooter: "请结合以上结论继续推进当前任务。",

  // Permissions
  permissionRequired: "需要工具权限确认",
  allowPermission: "允许",
  denyPermission: "拒绝",

  // Composer & Controls
  composerPlaceholder: "输入侧边问题…（{{shortcut}} 发送）",
  sendButton: "发送",
  stopButton: "停止",
  stoppingToast: "已中断当前侧边回复",
  modelLabel: "模型",
  thinkingLabel: "思考强度",
  thinkingDefault: "默认",
  thinkingOff: "关闭",
  modeLabel: "模式",
  modeAuto: "自动 (Auto)",
  modePlan: "规划只读 (Plan)",
  modeDefault: "每次询问",
  modeAcceptEdits: "允许编辑",
  enterShortcut: "Enter",
  modEnterShortcut: "⌘/Ctrl+Enter",

  // Settings Screen
  settingsHostSyncSection: "已自动同步的 Paseo 设置",
  settingsHostSyncInfo: "侧边聊天实时跟随 Paseo「设置 → 通用 / 外观」中的语言、主题、思考展开与折叠策略，无需手动重复配置。",
  hostLanguageLabel: "当前 Paseo 语言",
  hostThemeLabel: "当前 Paseo 主题",
  darkMode: "深色",
  lightMode: "浅色",
  hostReasoningLabel: "思考显示（始终展开推理）",
  hostReasoningExpanded: "默认展开全部思考块",
  hostReasoningCollapsed: "思考完成后自动折叠",
  hostCollapseLabel: "折叠策略（聊天显示）",
  hostCollapseTurns: "折叠轮次（仅保留结论与步骤摘要）",
  hostCollapseTools: "折叠工具调用（连续工具合并折叠）",
  hostCollapseFull: "完整显示（逐条展示）",
  hostTypographyLabel: "字号与发送快捷键",
  hostTypographyValue: "正文 {{content}}px · 代码 {{code}}px · {{shortcut}} 发送",

  settingsBehaviorSection: "侧边聊天默认行为",
  settingContextModeLabel: "自动携带主会话上下文",
  settingContextModeHint: "向侧边 Claude 提问时，如何附带主会话最近的对话摘要与涉及文件",
  contextModeFirstTurn: "每个侧边对话首轮自动附带",
  contextModeAlways: "每条消息均附带最新上下文",
  contextModeManual: "仅手动点击开启时附带",
  settingContextTurnsLabel: "主会话摘要轮数",
  settingContextTurnsHint: "提取主会话最近多少轮问答与文件变更作为背景上下文",
  settingDefaultModeLabel: "默认 Claude 运行模式",
  settingDefaultModeHint: "控制侧边对话中 Claude 调用工具时的权限模式",
  defaultModeAuto: "自动模式 (Auto)",
  defaultModePlan: "规划模式 (Plan · 纯分析)",
  defaultModeAsk: "每次询问 (Always Ask)",
  defaultModeInherit: "跟随主会话模式",
  settingReadOnlyGuardLabel: "只读安全保护提示词",
  settingReadOnlyGuardHint: "默认约束侧边 Claude 只读取和检索代码、不擅自修改工作区文件，避免与主会话冲突",
  settingPreferClaudeLabel: "优先使用 Claude 模型",
  settingPreferClaudeHint: "新建侧边对话时优先选择 Claude 模型并继承主会话的思考强度设置",
  settingComposerPillLabel: "在主输入框显示「侧边聊天」快捷按钮",
  settingComposerPillHint: "在活跃的主会话底部输入栏显示一键打开侧边聊天入口",
  resetDefaultsLabel: "恢复默认设置",
  resetDefaultsHint: "将侧边聊天插件的偏好设置恢复为初始默认值",
  resetAction: "重置",
};

export const allLocaleResources = {
  en,
  zh,
  "zh-CN": zh,
  "zh-Hans": zh,
  "zh-TW": zh,
  ...extraLocales,
} as const;

export function resolveLocaleTable(locale: string | undefined): LocaleTable {
  if (!locale) return en;
  const trimmed = locale.trim();
  if (trimmed in allLocaleResources) {
    return allLocaleResources[trimmed as keyof typeof allLocaleResources];
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("zh")) return zh;
  if (lower.startsWith("ja")) return extraLocales.ja;
  if (lower.startsWith("ko")) return extraLocales.ko;
  if (lower.startsWith("es")) return extraLocales.es;
  if (lower.startsWith("fr")) return extraLocales.fr;
  if (lower.startsWith("pt")) return extraLocales["pt-BR"];
  if (lower.startsWith("ru")) return extraLocales.ru;
  if (lower.startsWith("ar")) return extraLocales.ar;
  return en;
}

export function formatWorkSummaryLabel(
  counts: {
    thoughtCount: number;
    readFileCount: number;
    editedFileCount: number;
    commandCount: number;
    searchCount: number;
    otherToolCount: number;
  },
  locale: string,
  isLoading = false,
): string {
  const table = resolveLocaleTable(locale);
  const fill = (template: string, count: number) =>
    template.replace("{{count}}", String(count));
  const parts: string[] = [];
  if (counts.thoughtCount > 0) {
    parts.push(
      fill(
        counts.thoughtCount === 1 ? table.summaryThought_one : table.summaryThought_other,
        counts.thoughtCount,
      ),
    );
  }
  if (counts.readFileCount > 0) {
    parts.push(
      fill(
        counts.readFileCount === 1 ? table.summaryRead_one : table.summaryRead_other,
        counts.readFileCount,
      ),
    );
  }
  if (counts.searchCount > 0) {
    parts.push(
      fill(
        counts.searchCount === 1 ? table.summarySearch_one : table.summarySearch_other,
        counts.searchCount,
      ),
    );
  }
  if (counts.commandCount > 0) {
    parts.push(
      fill(
        counts.commandCount === 1 ? table.summaryCommand_one : table.summaryCommand_other,
        counts.commandCount,
      ),
    );
  }
  if (counts.editedFileCount > 0) {
    parts.push(
      fill(
        counts.editedFileCount === 1 ? table.summaryEdited_one : table.summaryEdited_other,
        counts.editedFileCount,
      ),
    );
  }
  if (counts.otherToolCount > 0) {
    parts.push(
      fill(
        counts.otherToolCount === 1 ? table.summaryOther_one : table.summaryOther_other,
        counts.otherToolCount,
      ),
    );
  }
  const joined = parts.length > 0 ? parts.join(" · ") : table.turnWorkFallback;
  return isLoading ? `${table.runningWorkPrefix} · ${joined}` : joined;
}
