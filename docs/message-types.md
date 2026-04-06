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
- 右对齐气泡，`bg-surface-high` 底色
- 支持解析内嵌 XML：`<command-name>`（显示为终端图标 + 命令名）、`<local-command-stdout>`（mono 字体输出）、`<task-notification>`（状态 badge）
- 纯文本时显示 `whitespace-pre-wrap`

**验证步骤：**
- [ ] 发送普通文本 → 右对齐气泡
- [ ] 发送 `/model` 等 CLI 命令 → 显示终端图标 + 命令名
- [ ] task-notification 消息 → 显示 ✓/✗ 状态 badge
- [ ] 包含命令 + 正文 + stdout 的混合消息 → 三部分都正确渲染

---

### 2. `assistant` — Claude 回复

| 字段 | 值 |
|------|-----|
| 来源 | SDK `assistant` 消息的 `text` block |
| content | `string` — Markdown 文本 |
| 渲染组件 | `MessageBubble (role="assistant")` |

**期望渲染：**
- 左对齐，带 Bot 头像（lavender 圆形底）
- "CLAUDE" 标签（大写小字）
- Markdown 渲染：ReactMarkdown + remarkGfm
- 代码块语法高亮（react-syntax-highlighter / Prism / oneLight）
- GFM 表格支持（交替行色、`th` 加深底色）

**验证步骤：**
- [ ] 纯文本回复 → 正常渲染
- [ ] 包含 `# 标题`、`**粗体**`、`- 列表` → Markdown 渲染正确
- [ ] 包含 `` ```python `` 代码块 → 语法高亮
- [ ] 包含 `| col | col |` 表格 → 交替行色，表头加深
- [ ] 包含内联 `` `code` `` → 小圆角背景，不触发语法高亮
- [ ] 包含 `> 引用` → 左侧 lavender 竖线
- [ ] 包含链接 `[text](url)` → 紫色下划线

---

### 3. `tool_use` — 工具调用事件

| 字段 | 值 |
|------|-----|
| 来源 | SDK `assistant` 消息的 `tool_use` block |
| content | `{ name: string, input: Record, result?: unknown }` |
| 渲染组件 | `EventCard`（通用）/ `QuestionCard`（AskUserQuestion） |

**3a. 通用 tool_use → EventCard**

**期望渲染：**
- 左侧缩进 `ml-9`
- `bg-secondary` 底色卡片，和聊天区白色背景区分
- 工具图标（Read=蓝文件、Write/Edit=紫铅笔、Bash=黄终端、Grep=青搜索、Glob=绿文件夹、WebFetch=靛地球、其他=灰扳手）
- 未完成时图标显示旋转 Loader
- 工具名（mono 粗体）+ 摘要（file_path / command / pattern 等，截断 80 字符）
- ChevronDown 始终可见，点击展开/收起
- 展开区域：`bg-secondary/60` 连续底色，内含 `bg-card` 白色代码块
- 点击展开同时触发右侧 ArtifactPanel 预览

**验证步骤：**
- [ ] Read 工具 → 蓝色文件图标 + 文件路径摘要
- [ ] Bash 工具 → 黄色终端图标 + 命令摘要（截断 80 字符）
- [ ] Edit 工具 → 紫色铅笔图标 + 文件路径
- [ ] 未知工具 → 灰色扳手图标
- [ ] 工具执行中 → 旋转 Loader 图标
- [ ] 工具完成后 → 静态图标
- [ ] 展开 → 显示 input JSON + result 内容
- [ ] 点击展开 → 右侧 ArtifactPanel 打开对应预览

**3b. AskUserQuestion → QuestionCard**

| input 格式 | 说明 |
|------------|------|
| `{ questions: [{ question, header?, options?: [{ label, description? }] }] }` | 标准格式 |
| `{ question: "..." }` 或 `{ text: "..." }` | 简化格式 |

**期望渲染：**
- lavender 浅底卡片 `bg-primary-container/10`
- 问号图标 + 问题文本
- 有 `header` → 显示紫色大写标签
- 有 `options` → 渲染为可点击按钮列表（每个显示 label + description）
- 无 `options` → 显示文本输入框 + Reply 按钮
- 已回答 → 显示 "Answered" 灰色斜体
- 回答通过 `onSend()` 发送

**验证步骤：**
- [ ] 带 options 的问题 → 显示可点击选项按钮
- [ ] 点击选项 → 发送 label 文本作为回复
- [ ] 无 options 的问题 → 显示文本输入框
- [ ] 输入回答按 Enter → 发送
- [ ] 已有 result 的历史问题 → 显示 "Answered"

---

### 4. `permission_request` — 权限审批请求

| 字段 | 值 |
|------|-----|
| 来源 | 服务端 `permission_request` 事件（canUseTool 回调） |
| content | `{ toolName: string, input: Record, agentId?: string }` |
| 渲染组件 | `PermissionCard` |

**期望渲染：**
- 左侧缩进 `ml-9`
- `bg-warning/[0.06]` 浅黄底色
- 盾牌警告图标 + "Permission Required" 标题
- 工具名（粗体）+ 摘要（file_path / command / JSON 截断 120 字符）
- Allow 按钮（`bg-primary` 紫色实心）+ Deny 按钮（ghost）
- 决策后替换为 ✓ allowed / ✗ denied 状态行（`bg-secondary` 底色）

**验证步骤：**
- [ ] 权限请求 → 显示黄底卡片 + Allow/Deny 按钮
- [ ] 点击 Allow → 替换为 ✓ allowed 灰底行
- [ ] 点击 Deny → 替换为 ✗ denied 灰底行
- [ ] 允许后 SDK 恢复执行工具

---

### 5. `system` — 系统消息

| 字段 | 值 |
|------|-----|
| 来源 | SDK `result` 消息（含 cost/duration）或 CLI 命令反馈 |
| content | `{ cost?: number, duration?: number, command?: string }` |
| 渲染组件 | 内联分隔线 |

**5a. CLI 命令反馈** (`command` 存在)

**期望渲染：**
- 居中分隔线 + mono 字体 "{command} sent"
- 淡灰色，不抢视觉焦点

**5b. Turn 结果** (`cost` / `duration` 存在)

**期望渲染：**
- 居中分隔线 + mono 字体 "3.2s · $0.0042"
- 更淡的灰色

**验证步骤：**
- [ ] 发送 `/model` → 显示 "/model sent" 分隔线
- [ ] Claude 完成回复 → 显示耗时 + 费用分隔线
- [ ] 只有 duration 无 cost → 只显示耗时
- [ ] 两者都无 → 不渲染

---

## 二、历史消息加载

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

## 三、右侧 ArtifactPanel 预览

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

## 四、WS 协议消息（非渲染）

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
