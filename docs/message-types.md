# Claude Web Console — 消息类型与渲染验证清单

## 一、SDK → 前端渲染的 ChatItem 类型

这些是最终在聊天区渲染的消息类型，来源于 SDK 实时流或历史加载。

### 1. `user` — 用户消息

| 字段 | 值 |
|------|-----|
| 来源 | 用户输入 / 历史加载 |
| content | `string` — 原始文本 |
| 渲染组件 | `MessageBubble (role="user")` |

**期望渲染：**
- 右对齐气泡，`bg-slate-100 border-slate-200` 底色
- 支持解析内嵌 XML：`<command-name>`（显示为 Command 标签 + 命令名）、`<local-command-stdout>`（mono 字体输出块）、`<task-notification>`（状态 badge，见 1b）
- 纯文本时显示 `whitespace-pre-wrap`
- 长文本（>300 字符）截断并显示 "Show more" 展开按钮

**1b. task-notification — 任务通知 badge**

| 字段 | 值 |
|------|-----|
| 来源 | SDK 后台任务完成/失败时注入的 XML 标记 |
| 格式 | `<task-notification><task-id>...</task-id><status>...</status><summary>...</summary></task-notification>` |
| 渲染组件 | `TaskNotificationBadge`（内嵌在 `MessageBubble` 中） |

**期望渲染：**
- 左对齐，`ml-10 my-2`（与 assistant 侧卡片对齐）
- 成功：`bg-[#f0faf0] border-[#c6e6c6]` + emerald CheckCircle 图标
- 失败：`bg-[#fef2f2] border-[#f5c6c6]` + red XCircle 图标
- `shadow-soft`、`rounded-lg`、`px-4 py-2.5`
- 显示 Bell 图标 + `task/{id前8位}` + 状态文字 + 可选摘要

**验证步骤：**
- [ ] 发送普通文本 → 右对齐气泡
- [ ] 发送 `/model` 等 CLI 命令 → 显示 Command 标签 + 命令名
- [ ] task-notification 成功消息 → 绿色 badge，ml-10 对齐，shadow-soft
- [ ] task-notification 失败消息 → 红色 badge，同上布局
- [ ] 包含命令 + 正文 + stdout 的混合消息 → 三部分都正确渲染
- [ ] 长文本 → 截断 + Show more 按钮

---

### 2. `assistant` — Claude 回复

| 字段 | 值 |
|------|-----|
| 来源 | SDK `assistant` 消息的 `text` block |
| content | `string` — Markdown 文本 |
| 渲染组件 | `MessageBubble (role="assistant")` |

**期望渲染：**
- 左对齐，带 Bot 头像（`bg-primary-container` 圆形底）
- "Claude" 标签（font-semibold）
- Markdown 渲染：ReactMarkdown + remarkGfm + remarkFrontmatter
- 代码块语法高亮（CodeBlock 组件）
- Mermaid 代码块 → MermaidDiagram 组件
- GFM 表格支持
- 右上角 Fork 按钮（hover 显示，GitBranch 图标）

**验证步骤：**
- [ ] 纯文本回复 → 正常渲染
- [ ] 包含 `# 标题`、`**粗体**`、`- 列表` → Markdown 渲染正确
- [ ] 包含 ` ```python ` 代码块 → 语法高亮
- [ ] 包含 ` ```mermaid ` → Mermaid 图表渲染
- [ ] 包含 `| col | col |` 表格 → 表格渲染
- [ ] hover 消息 → 右上角显示 Fork 按钮

---

### 3. `tool_use` — 工具调用事件

| 字段 | 值 |
|------|-----|
| 来源 | SDK `assistant` 消息的 `tool_use` block |
| content | `{ name: string, input: Record, result?: unknown }` |
| 渲染组件 | `EventCard`（通用）/ `QuestionCard`（AskUserQuestion）/ `SubAgentCard`（Agent） |

**3a. 通用 tool_use → EventCard**

**期望渲染：**
- 左侧缩进 `ml-10 my-2`
- 每种工具有独立配色（`toolMeta` 映射 headerBg/bodyBg/borderColor/textColor）：
  - Bash：`bg-[#ebd2c1]` / `bg-[#f9eae0]`（暖棕）
  - Read：`bg-blue-100` / `bg-blue-50`（蓝）
  - Write：`bg-emerald-100` / `bg-emerald-50`（绿）
  - Edit：`bg-violet-100` / `bg-violet-50`（紫）
  - Grep：`bg-cyan-100` / `bg-cyan-50`（青）
  - Glob：`bg-teal-100` / `bg-teal-50`（蓝绿）
  - WebFetch：`bg-indigo-100` / `bg-indigo-50`（靛）
  - 其他：`bg-slate-200` / `bg-slate-50`（灰）
- `rounded-lg`、`shadow-soft`、`border`
- 未完成时显示 Loader2 旋转动画
- 工具名（font-semibold）+ 摘要（file_path / command / pattern 等，截断 80 字符）
- ChevronRight 箭头，展开时旋转 90°
- 展开区域：input JSON + result 内容
- 支持内嵌权限审批（`permission` prop）：pending 时切换为警告色 `bg-[#fcf1ce]`，显示 Allow / Always allow / Deny 按钮

**验证步骤：**
- [ ] Read 工具 → 蓝色配色 + 文件路径摘要
- [ ] Bash 工具 → 暖棕配色 + 命令摘要（截断 80 字符）
- [ ] Edit 工具 → 紫色配色 + 文件路径
- [ ] 未知工具 → 灰色配色
- [ ] 工具执行中 → 旋转 Loader 图标
- [ ] 工具完成后 → Loader 消失
- [ ] 展开 → 显示 input JSON + result 内容
- [ ] 权限 pending → 警告色 + Allow/Deny 按钮
- [ ] 允许后 → header 显示 CheckCircle

**3b. AskUserQuestion → QuestionCard**

| input 格式 | 说明 |
|------------|------|
| `{ questions: [{ question, header?, options?: [{ label, description? }] }] }` | 标准格式 |
| `{ question: "..." }` 或 `{ text: "..." }` | 简化格式 |

**期望渲染：**
- `ml-10 my-2`
- `bg-[#f0f5ff] border-[#c5d9ff]`（蓝色调）、`rounded-lg`、`shadow-soft`
- header/body 分区，`border-b border-[#c5d9ff]/50` 分隔
- 有 `header` → 显示大写小字标签
- 有 `options` → 渲染为可点击按钮列表（首选项 `bg-[#c5d9ff]`，其他 `bg-white`）
- 无 `options` → 显示文本输入框 + Submit 按钮
- 已回答 → 显示 Check 图标 + 答案文本
- 多问题时显示进度 "N / M answered"

**验证步骤：**
- [ ] 带 options 的问题 → 显示可点击选项按钮
- [ ] 点击选项 → 发送 label 文本作为回复
- [ ] 无 options 的问题 → 显示文本输入框
- [ ] 输入回答按 Enter → 发送
- [ ] 已有 result 的历史问题 → 显示 Check + 答案

**3c. Agent → SubAgentCard**

| 字段 | 值 |
|------|-----|
| 来源 | `tool_use` block 且 `name === "Agent"` 且有 `agentId` |
| content | `{ name: "Agent", input: { subagent_type?, description?, prompt? }, result? }` |
| 渲染组件 | `SubAgentCard`（支持递归嵌套） |

**期望渲染：**
- `ml-10 my-2`
- `bg-[#f5f0ff] border-[#d4c5f9]`（紫色调）、`rounded-lg`、`shadow-soft`、`overflow-hidden`
- header 区域 `px-4 py-2.5 border-b border-[#d4c5f9]/50`：ChevronDown/Right + agent 类型标签（`bg-[#e4d8f9]`）+ description 文本 + 状态 badge
- 状态 badge 配色：running `bg-[#fcf1ce]`、done `bg-[#e8f5e8]`、error `bg-[#fef2f2]`
- 展开后显示子 agent 的内部消息（MessageBubble + EventCard，支持嵌套 SubAgentCard）
- 内部消息区域 `border-l-2 border-[#d4c5f9]` 左侧竖线
- running 状态时自动展开
- 完成后显示 resultText

**验证步骤：**
- [ ] Agent 工具调用 → 紫色子 agent 卡片
- [ ] running 状态 → 自动展开 + 黄色 badge
- [ ] done 状态 → 绿色 badge + 收起时显示 resultPreview
- [ ] error 状态 → 红色 badge
- [ ] 点击展开 → 加载并显示内部消息
- [ ] 嵌套 Agent → 递归显示 SubAgentCard

---

### 4. `elicitation` — MCP 服务端输入请求

| 字段 | 值 |
|------|-----|
| 来源 | MCP 服务端发起的 elicitation 请求 |
| content | `{}` + 额外字段 `serverName, elicitationMessage, mode?, requestedSchema?, url?` |
| 渲染组件 | `ElicitationCard` |

**期望渲染：**
- `ml-10 my-2`
- `bg-[#f0f5ff] border-[#c5d9ff]`（与 QuestionCard 同色系）、`rounded-lg`、`shadow-soft`、`overflow-hidden`
- header/body 分区：FileText 图标 + "Input Required — {serverName}"
- `mode === 'url'` → 显示链接
- 有 `requestedSchema.properties` → 渲染表单（text/number/boolean/enum）
- 按钮：Submit（`bg-[#c5d9ff]`）、Decline（`bg-white`）、Cancel（ghost）
- 已决策（`resolved === true`）→ 半透明卡片 + 决策结果（accept 绿 / decline 琥珀 / cancel 灰）

**验证步骤：**
- [ ] 表单模式 → 显示表单字段 + Submit/Decline/Cancel 按钮
- [ ] URL 模式 → 显示链接
- [ ] 点击 Submit → 标记为 resolved
- [ ] 已 resolved → 半透明卡片 + 决策文字

---

### 5. `system` — 系统消息

| 字段 | 值 |
|------|-----|
| 来源 | CLI 命令反馈 |
| content | `{ command?: string }` |
| 渲染组件 | 内联分隔线 |

**期望渲染：**
- 居中分隔线 + mono 字体 "{command} sent"
- 淡灰色（`text-slate-400`），不抢视觉焦点

**验证步骤：**
- [ ] 发送 `/model` → 显示 "/model sent" 分隔线
- [ ] 无 command 字段 → 不渲染

---

## 二、内部类型（不直接渲染为独立 ChatItem）

| ChatItemType | 用途 | 说明 |
|--------------|------|------|
| `tool_result` | 工具执行结果 | 通过 `tool_use_id` 关联到对应 `tool_use` item 的 `result` 字段，不独立渲染 |
| `permission_request` | 权限审批 | WS 协议消息类型，映射为 EventCard 的 `permission` prop；独立 `PermissionCard` 组件仍存在但仅在 EventCard 外部权限流程中使用 |

---

## 三、历史消息加载

| 来源 | 处理 |
|------|------|
| `session_history` 事件 | 解析 SDK 消息为 `ChatItem[]`，支持 text / tool_use / tool_result |
| tool_result | 通过 `tool_use_id` 关联到对应 `tool_use` item 的 `result` 字段 |
| 渲染 | 和实时消息共用 `renderChatItem()`，无视觉区分 |
| 分隔线 | 历史消息和新消息之间显示 "PREVIOUS MESSAGES" 分隔线 |

**验证步骤：**
- [ ] 切换到有历史的 session → 加载并显示所有消息类型
- [ ] 历史中的 tool_use → 显示 EventCard（含 result）
- [ ] 历史中的 assistant → Markdown 渲染 + 代码高亮
- [ ] 发送新消息后 → 历史和新消息之间有分隔线

---

## 四、右侧 ArtifactPanel 预览

### 智能内容渲染（SmartContent）

| 内容类型 | 检测方式 | 渲染方式 |
|----------|----------|----------|
| HTML | `<!doctype html>` / `<html>` / `<div>` 等标签开头 | sandboxed iframe + 全屏按钮 |
| Markdown | `.md` 文件扩展名 或 检测到 `#` / `- ` / `[]()` 等模式 | ReactMarkdown + remarkGfm + 代码高亮 |
| 图片 | `.png/.jpg/.svg/.webp` 等扩展名 | `<img>` 直接显示 |
| 代码文件 | 根据文件扩展名匹配语言 | react-syntax-highlighter + Prism |
| 其他 | 默认 | CodeBlock 组件 |

### 工具特定渲染

| 工具 | 预览内容 |
|------|----------|
| Edit | 文件路径 + "- removed"（红底）+ "+ added"（绿底）diff 视图 |
| Write | 文件路径 + SmartContent 渲染（根据文件类型） |
| Bash | "$ command" + "output"（SmartContent 渲染） |
| Read | 文件路径 + SmartContent 渲染（自动去除行号前缀） |
| Glob/Grep | pattern + SmartContent 渲染结果 |

**验证步骤：**
- [ ] Read `.md` 文件 → Markdown 渲染（标题、列表、表格、代码高亮）
- [ ] Read `.ts` 文件 → TypeScript 语法高亮
- [ ] Write HTML 文件 → iframe 预览 + 全屏按钮
- [ ] Edit 工具 → 红绿 diff 视图
- [ ] Bash 工具 → 命令 + 输出分区显示
- [ ] HTML 全屏 → 点击 Maximize → 遮罩层 + 90vw/90vh 预览 → 点击 Minimize 退出
- [ ] 拖拽中间分隔条 → ArtifactPanel 宽度变化（280px ~ 800px）

---

## 五、WS 协议消息（非渲染）

这些消息用于客户端-服务端通信，不直接渲染为聊天内容。

### Client → Server

| type | 用途 | 关键字段 |
|------|------|----------|
| `create_session` | 创建新会话 | `options?: { model, cwd }` |
| `send_message` | 发送用户消息 | `sessionId, content` |
| `switch_session` | 切换活跃会话 | `sessionId` |
| `permission_decision` | 审批权限请求 | `toolUseId, approved, reason?` |
| `list_sessions` | 获取会话列表 | — |
| `list_files` | 获取文件列表（@提及） | `prefix, sessionId?` |
| `get_subagent_messages` | 获取子 agent 内部消息 | `sessionId, agentId` |
| `elicitation_response` | 回复 MCP elicitation | `id, action, content?` |
| `get_session_settings` | 获取会话设置 | `sessionId` |
| `set_effort_level` | 设置推理强度 | `sessionId, level` |

### Server → Client

| type | 用途 | 触发时机 |
|------|------|----------|
| `session_list` | 会话列表 | 连接时 / 请求时 |
| `session_created` | 新会话创建 | create_session 响应 |
| `sdk_message` | SDK 消息转发 | 实时流（assistant / user / result） |
| `permission_request` | 权限审批请求 | canUseTool 回调触发 |
| `session_history` | 历史消息 | switch_session 响应 |
| `session_id_resolved` | 临时 ID 映射 | SDK 返回真实 sessionId |
| `session_end` | 会话结束 | stream 循环退出 |
| `file_list` | 文件列表 | list_files 响应 |
| `error` | 错误 | 任意异常 |

---

## 六、样式设计系统一致性

所有 assistant 侧卡片遵循统一设计语言：

| 属性 | 规范 |
|------|------|
| 布局 | `ml-10 my-2`（与 assistant 头像对齐） |
| 圆角 | `rounded-lg` |
| 阴影 | `shadow-soft`（`box-shadow: 0 2px 10px rgba(0,0,0,0.05)`） |
| 边框 | `border` + 每种卡片自定义色 |
| 颜色 | 使用精确 hex 值（非 Tailwind 默认调色板），保持整体色调一致 |
| 分区 | header（px-4 py-2.5~3, border-b）+ body（px-4 py-3） |

各卡片色系：

| 卡片 | 背景 | 边框 | 语义 |
|------|------|------|------|
| EventCard | 按工具类型变化 | 同上 | 工具操作 |
| EventCard (permission pending) | `#fcf1ce` | `#f3e4b0` | 警告/需要决策 |
| QuestionCard | `#f0f5ff` | `#c5d9ff` | 交互/提问 |
| ElicitationCard | `#f0f5ff` | `#c5d9ff` | 交互/提问（同 QuestionCard） |
| SubAgentCard | `#f5f0ff` | `#d4c5f9` | 子 agent |
| TaskNotification (success) | `#f0faf0` | `#c6e6c6` | 成功 |
| TaskNotification (failed) | `#fef2f2` | `#f5c6c6` | 失败 |
