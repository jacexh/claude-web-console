# Multi-Connection Broadcast & Session Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable multi-connection broadcast, explicit session resume/close, and heartbeat-based auto-reclaim of idle sessions.

**Architecture:** Replace the single-callback `sessionCallbacks` with a pub/sub listener model. Sessions have three explicit states: idle (no process), running (process active), closed. Resume is explicit via button, not implicit on send. Heartbeat detects dead WS connections; sessions with zero listeners are auto-closed after 1 minute.

**Tech Stack:** Node.js, Fastify WebSocket, TypeScript, React

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `server/src/session-manager.ts` | Modify | Pub/sub listeners; broadcast; idle timer (1min); force-kill on resume conflict |
| `server/src/ws-handler.ts` | Modify | Subscribe/unsubscribe; heartbeat; `resume_session` / `close_session` handlers; no implicit resume on `send_message` |
| `server/src/types.ts` | Modify | Add `ResumeSessionMessage`, `CloseSessionMessage`, `PermissionDecidedMessage`, `SessionResumedMessage` |
| `client/src/types.ts` | Modify | Mirror new message types |
| `client/src/App.tsx` | Modify | Handle `permission_decided`, `session_resumed`; send `resume_session` / `close_session`; disable send for idle sessions |
| `client/src/hooks/useSessionStore.ts` | Modify | Add `removeSession`, `setSessionStatus` actions |
| `client/src/components/SessionList.tsx` | Modify | Add close button (X) on running sessions |
| `client/src/components/ChatPanel.tsx` | Modify | Show session status badge in header; replace input with Resume button when idle |
| `client/src/components/EventCard.tsx` | Modify | Derive decided state from props (external permission_decided) + local state |

---

### Task 1: Server — Multi-Listener Pub/Sub in SessionManager

**Files:**
- Modify: `server/src/session-manager.ts`

Replace `sessionCallbacks: Map<string, SessionCallbacks>` with `sessionListeners: Map<string, Set<SessionListener>>`. Stream consumer broadcasts to all. Permission requests broadcast to all. Permission decisions broadcast to all. Zero-listener sessions get 1-minute idle close timer.

- [ ] **Step 1: Replace SessionCallbacks with SessionListener type**

Remove:
```typescript
type SessionCallbacks = {
  onMessage: (sessionId: string, msg: SDKMessage) => void
  onEnd: (sessionId: string) => void
}
```

Add:
```typescript
type SessionListener = {
  id: string
  onMessage: (sessionId: string, msg: SDKMessage) => void
  onPermissionRequest: (sessionId: string, toolUseId: string, toolName: string, input: Record<string, unknown>, meta: PermissionMeta) => void
  onEnd: (sessionId: string) => void
}
```

Replace class fields:
```typescript
// Remove:
private sessionCallbacks = new Map<string, SessionCallbacks>()

// Add:
private sessionListeners = new Map<string, Set<SessionListener>>()
private idleTimers = new Map<string, ReturnType<typeof setTimeout>>()
```

- [ ] **Step 2: Add subscribe / unsubscribe / broadcast / idle-close methods**

```typescript
private static IDLE_TIMEOUT = 60_000  // 1 minute

subscribe(sessionId: string, listener: SessionListener): void {
  // Deduplicate: remove existing listener with same id first
  const set = this.sessionListeners.get(sessionId) ?? new Set()
  for (const l of set) {
    if (l.id === listener.id) { set.delete(l); break }
  }
  set.add(listener)
  this.sessionListeners.set(sessionId, set)
  // Cancel pending idle close
  const timer = this.idleTimers.get(sessionId)
  if (timer) {
    clearTimeout(timer)
    this.idleTimers.delete(sessionId)
  }
}

unsubscribe(sessionId: string, listenerId: string): void {
  const set = this.sessionListeners.get(sessionId)
  if (!set) return
  for (const l of set) {
    if (l.id === listenerId) { set.delete(l); break }
  }
  if (set.size === 0) {
    this.sessionListeners.delete(sessionId)
    this.scheduleIdleClose(sessionId)
  }
}

unsubscribeAll(listenerId: string): void {
  for (const [sessionId, set] of this.sessionListeners) {
    for (const l of set) {
      if (l.id === listenerId) { set.delete(l); break }
    }
    if (set.size === 0) {
      this.sessionListeners.delete(sessionId)
      this.scheduleIdleClose(sessionId)
    }
  }
}

private broadcast(sessionId: string, fn: (listener: SessionListener) => void): void {
  const set = this.sessionListeners.get(sessionId)
  if (!set) return
  for (const listener of set) {
    fn(listener)
  }
}

private scheduleIdleClose(sessionId: string): void {
  if (!this.sessions.has(sessionId)) return
  const timer = setTimeout(() => {
    this.idleTimers.delete(sessionId)
    const set = this.sessionListeners.get(sessionId)
    if (!set || set.size === 0) {
      console.log('[SessionManager] Idle-closing session', sessionId)
      this.closeSession(sessionId)
    }
  }, SessionManager.IDLE_TIMEOUT)
  this.idleTimers.set(sessionId, timer)
}
```

- [ ] **Step 3: Update consumeStream — remove callback params, use broadcast**

Remove `onMessage` and `onEnd` parameters. Replace all `onMessage(sessionId, msg)` with `this.broadcast(sessionId, l => l.onMessage(sessionId, msg))`. Replace `onEnd(sessionId)` with `this.broadcast(sessionId, l => l.onEnd(sessionId))`.

In the init message command extraction, replace `onMessage(sid, { type: 'commands_updated' } ...)` with `this.broadcast(sid, l => l.onMessage(sid, { type: 'commands_updated' } ...))`.

```typescript
private async consumeStream(session: SDKSession): Promise<void> {
  try {
    while (true) {
      for await (const msg of session.stream()) {
        const msgAny = msg as Record<string, unknown>
        if (msgAny.type === 'system' && msgAny.subtype === 'init') {
          try {
            const sid = session.sessionId
            const slashCmds = (msgAny.slash_commands as string[]) ?? []
            const skills = (msgAny.skills as string[]) ?? []
            const allNames = new Set([...slashCmds, ...skills])
            this.sessionCommands.set(sid, Array.from(allNames).map((name) => ({
              name,
              description: skills.includes(name) ? 'skill' : '',
            })))
            const s = session as unknown as { supportedCommands(): Promise<{ name: string; description: string }[]> }
            s.supportedCommands().then((cmds) => {
              if (cmds.length > 0) {
                this.sessionCommands.set(sid, cmds)
                this.broadcast(sid, (l) => l.onMessage(sid, { type: 'commands_updated' } as unknown as SDKMessage))
              }
            }).catch(() => {})
          } catch { /* session not yet initialized */ }
        }
        if (msgAny.type === 'result') {
          if (msgAny.is_error) {
            console.error('[SessionManager] SDK error result:', JSON.stringify(msg).slice(0, 500))
          } else {
            console.log('[SessionManager] Turn complete, cost:', (msgAny as Record<string, unknown>).total_cost_usd)
          }
        }
        let sessionId: string
        try { sessionId = session.sessionId } catch { continue }
        this.runningSessionIds.add(sessionId)
        this.broadcast(sessionId, (l) => l.onMessage(sessionId, msg))
      }
      let sessionId: string
      try { sessionId = session.sessionId } catch { break }
      if (this.closedSessionIds.has(sessionId)) break
      await new Promise((r) => setTimeout(r, 50))
    }
  } catch (err) {
    if (!(err instanceof Error && err.name === 'AbortError')) {
      console.error('[SessionManager] Stream error:', err)
    }
  } finally {
    try {
      const sessionId = session.sessionId
      this.runningSessionIds.delete(sessionId)
      this.streamingSessionIds.delete(sessionId)
      this.broadcast(sessionId, (l) => l.onEnd(sessionId))
    } catch { /* Session never initialized */ }
  }
}
```

- [ ] **Step 4: Update startStreamConsumer — remove callbacks param**

```typescript
private startStreamConsumer(sessionId: string, session: SDKSession): void {
  if (this.streamingSessionIds.has(sessionId)) return
  this.streamingSessionIds.add(sessionId)
  this.consumeStream(session)
}
```

- [ ] **Step 5: Update buildCanUseTool — remove onPermissionRequest param, use broadcast**

Remove the `onPermissionRequest` parameter. Use `this.broadcast` to notify all listeners:

```typescript
private buildCanUseTool(
  sessionIdRef: { current: string },
): SDKSessionOptions['canUseTool'] {
  return async (toolName, input, { toolUseID, agentID, suggestions, title, description }) => {
    const autoAllow = new Set(['TaskCreate', 'TaskUpdate', 'TaskGet', 'TaskList'])
    if (autoAllow.has(toolName)) {
      return { behavior: 'allow' as const, updatedInput: input as Record<string, unknown> }
    }
    const isQuestion = toolName === 'AskUserQuestion'
    return new Promise<PermissionResult>((resolve) => {
      this.pendingPermissions.set(toolUseID, {
        resolve: (approved, reason, updatedPermissions?) => {
          if (approved) {
            resolve({
              behavior: 'allow',
              updatedInput: input as Record<string, unknown>,
              ...(updatedPermissions ? { updatedPermissions } : {}),
            })
          } else {
            resolve({ behavior: 'deny', message: reason ?? 'User denied' })
          }
        },
        sessionId: sessionIdRef.current,
        suggestions,
      })
      if (!isQuestion) {
        const meta: PermissionMeta = {
          agentId: agentID, title, description,
          hasSuggestions: (suggestions?.length ?? 0) > 0,
        }
        this.broadcast(sessionIdRef.current, (l) =>
          l.onPermissionRequest(sessionIdRef.current, toolUseID, toolName, input as Record<string, unknown>, meta),
        )
      }
    })
  }
}
```

- [ ] **Step 6: Update createSession — remove callback params**

```typescript
async createSession(options?: { model?: string; cwd?: string }): Promise<string> {
  const cwd = options?.cwd ?? process.env.CC_WEB_CONSOLE_CWD ?? process.env.HOME ?? '/'
  const sessionIdRef = { current: '' }
  const sessionOptions = {
    model: options?.model ?? 'claude-sonnet-4-6',
    permissionMode: 'default',
    canUseTool: this.buildCanUseTool(sessionIdRef),
    env: cleanEnv(cwd),
    pathToClaudeCodeExecutable: CLAUDE_EXECUTABLE,
    executableArgs: getPluginDirArgs(),
  } as SDKSessionOptions

  const originalCwd = process.cwd()
  try { process.chdir(cwd) } catch { /* ignore */ }
  const session = unstable_v2_createSession(sessionOptions)
  try { process.chdir(originalCwd) } catch { /* ignore */ }

  const tempId = `pending-${Date.now()}`
  this.sessions.set(tempId, session)
  this.sessionCwds.set(tempId, cwd)

  // Remap tempId → real sessionId on first message
  const originalBroadcast = this.broadcast.bind(this)
  const self = this
  // We need to intercept the first message to remap IDs.
  // Use a wrapper that listens for the real sessionId and remaps all state.
  const remapOnce = {
    done: false,
    tryRemap(sid: string) {
      if (this.done || !sid || sid.startsWith('pending-')) return
      this.done = true
      sessionIdRef.current = sid
      // Move session
      const s = self.sessions.get(tempId)
      if (s) { self.sessions.delete(tempId); self.sessions.set(sid, s) }
      // Move cwd
      const c = self.sessionCwds.get(tempId)
      if (c) { self.sessionCwds.delete(tempId); self.sessionCwds.set(sid, c) }
      // Move listeners
      const listeners = self.sessionListeners.get(tempId)
      if (listeners) { self.sessionListeners.delete(tempId); self.sessionListeners.set(sid, listeners) }
      // Move streaming
      self.streamingSessionIds.delete(tempId)
      self.streamingSessionIds.add(sid)
    },
  }

  // Wrap broadcast for this session to handle remap
  const origBroadcastFn = this.broadcast
  // We'll handle remap inside consumeStream by checking sessionIdRef
  // Actually, the existing pattern uses sessionIdRef which is updated in the remap.
  // The consumeStream reads session.sessionId which gives the real ID.
  // So we just need to remap the maps when the real ID first appears.
  // The simplest approach: do the remap in consumeStream's message loop.

  this.startStreamConsumer(tempId, session)
  return tempId
}
```

Note: The tempId → real sessionId remap is tricky without callbacks. The cleanest approach is to keep a `tempIdMap` that maps tempId to the remap logic, and check it in `consumeStream`. Let me simplify — keep a `pendingRemaps` map:

```typescript
private pendingRemaps = new Map<string, { sessionIdRef: { current: string } }>()

async createSession(options?: { model?: string; cwd?: string }): Promise<string> {
  const cwd = options?.cwd ?? process.env.CC_WEB_CONSOLE_CWD ?? process.env.HOME ?? '/'
  const sessionIdRef = { current: '' }
  const sessionOptions = {
    model: options?.model ?? 'claude-sonnet-4-6',
    permissionMode: 'default',
    canUseTool: this.buildCanUseTool(sessionIdRef),
    env: cleanEnv(cwd),
    pathToClaudeCodeExecutable: CLAUDE_EXECUTABLE,
    executableArgs: getPluginDirArgs(),
  } as SDKSessionOptions

  const originalCwd = process.cwd()
  try { process.chdir(cwd) } catch { /* ignore */ }
  const session = unstable_v2_createSession(sessionOptions)
  try { process.chdir(originalCwd) } catch { /* ignore */ }

  const tempId = `pending-${Date.now()}`
  this.sessions.set(tempId, session)
  this.sessionCwds.set(tempId, cwd)
  this.pendingRemaps.set(tempId, { sessionIdRef })
  this.startStreamConsumer(tempId, session)
  return tempId
}
```

Then in `consumeStream`, before broadcasting each message, check for pending remap:

```typescript
let sessionId: string
try { sessionId = session.sessionId } catch { continue }

// Remap tempId → real sessionId on first real ID
for (const [tempId, { sessionIdRef }] of this.pendingRemaps) {
  if (sessionIdRef.current === '' && sessionId && !sessionId.startsWith('pending-')) {
    sessionIdRef.current = sessionId
    // Move all maps from tempId to sessionId
    const s = this.sessions.get(tempId)
    if (s) { this.sessions.delete(tempId); this.sessions.set(sessionId, s) }
    const c = this.sessionCwds.get(tempId)
    if (c) { this.sessionCwds.delete(tempId); this.sessionCwds.set(sessionId, c) }
    const listeners = this.sessionListeners.get(tempId)
    if (listeners) { this.sessionListeners.delete(tempId); this.sessionListeners.set(sessionId, listeners) }
    this.streamingSessionIds.delete(tempId)
    this.streamingSessionIds.add(sessionId)
    this.pendingRemaps.delete(tempId)
    // Notify listeners of the remap
    this.broadcast(sessionId, (l) => l.onMessage(sessionId, {
      type: 'session_id_resolved', tempId, sessionId,
    } as unknown as SDKMessage))
    break
  }
}

this.runningSessionIds.add(sessionId)
this.broadcast(sessionId, (l) => l.onMessage(sessionId, msg))
```

- [ ] **Step 7: Update resumeSession — remove callback params, add force-kill**

```typescript
async resumeSession(sessionId: string): Promise<void> {
  // Force-kill existing process if one is running (conflict from stale connection)
  if (this.sessions.has(sessionId)) {
    console.log('[SessionManager] Force-killing existing process for', sessionId)
    this.closeSession(sessionId)
    // Remove from closedSessionIds so it can be reused
    this.closedSessionIds.delete(sessionId)
  }

  const cwd = this.sessionCwds.get(sessionId)
  const sessionOptions = {
    model: 'claude-sonnet-4-6',
    permissionMode: 'default',
    canUseTool: this.buildCanUseTool({ current: sessionId }),
    env: cleanEnv(cwd),
    pathToClaudeCodeExecutable: CLAUDE_EXECUTABLE,
    executableArgs: getPluginDirArgs(),
  } as SDKSessionOptions

  const originalCwd = process.cwd()
  if (cwd) { try { process.chdir(cwd) } catch { /* ignore */ } }
  const session = unstable_v2_resumeSession(sessionId, sessionOptions)
  try { process.chdir(originalCwd) } catch { /* ignore */ }
  this.sessions.set(sessionId, session)
  this.runningSessionIds.add(sessionId)
}
```

- [ ] **Step 8: Update sendMessage — remove implicit resume, no callback lookup**

`send_message` no longer resumes automatically. It requires the session to already be running:

```typescript
async sendMessage(sessionId: string, content: string): Promise<void> {
  const session = this.sessions.get(sessionId)
  if (!session) {
    throw new Error(`Session ${sessionId} not running. Resume it first.`)
  }
  await session.send(content)
  this.startStreamConsumer(sessionId, session)
}
```

- [ ] **Step 9: Update resolvePermission — broadcast decision to all listeners**

```typescript
resolvePermission(toolUseId: string, approved: boolean, reason?: string, alwaysAllow?: boolean): void {
  const pending = this.pendingPermissions.get(toolUseId)
  if (!pending) return
  const updatedPermissions = (approved && alwaysAllow) ? pending.suggestions : undefined
  pending.resolve(approved, reason, updatedPermissions)
  this.broadcast(pending.sessionId, (l) =>
    l.onMessage(pending.sessionId, {
      type: 'permission_decided', toolUseId, approved,
    } as unknown as SDKMessage),
  )
  this.pendingPermissions.delete(toolUseId)
}
```

- [ ] **Step 10: Update closeSession — clean up idle timers and listeners**

```typescript
closeSession(sessionId: string): void {
  const timer = this.idleTimers.get(sessionId)
  if (timer) { clearTimeout(timer); this.idleTimers.delete(sessionId) }
  const session = this.sessions.get(sessionId)
  if (session) {
    this.closedSessionIds.add(sessionId)
    session.close()
    this.sessions.delete(sessionId)
    this.runningSessionIds.delete(sessionId)
    this.streamingSessionIds.delete(sessionId)
    // Notify all listeners before removing them
    this.broadcast(sessionId, (l) => l.onEnd(sessionId))
    this.sessionListeners.delete(sessionId)
    this.sessionCwds.delete(sessionId)
    for (const [id, entry] of this.pendingPermissions) {
      if (entry.sessionId === sessionId) {
        entry.resolve(false, 'Session closed')
        this.pendingPermissions.delete(id)
      }
    }
  }
}
```

- [ ] **Step 11: Verify server compiles**

Run: `cd cc-web-console/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 12: Commit**

```bash
git add server/src/session-manager.ts
git commit -m "refactor(server): multi-listener pub/sub, idle auto-close, force-kill on resume"
```

---

### Task 2: Server — Update ws-handler and Types

**Files:**
- Modify: `server/src/types.ts`
- Modify: `server/src/ws-handler.ts`

- [ ] **Step 1: Add new message types to server types**

```typescript
// Client → Server
export interface ResumeSessionMessage {
  type: 'resume_session'
  sessionId: string
}

export interface CloseSessionMessage {
  type: 'close_session'
  sessionId: string
}

// Server → Client
export interface PermissionDecidedMessage {
  type: 'permission_decided'
  toolUseId: string
  approved: boolean
}

export interface SessionResumedMessage {
  type: 'session_resumed'
  sessionId: string
}
```

Add `ResumeSessionMessage | CloseSessionMessage` to `ClientMessage` union.
Add `PermissionDecidedMessage | SessionResumedMessage` to `ServerMessage` union.

- [ ] **Step 2: Rewrite ws-handler**

Key changes vs current:
- Each connection gets `listenerId = randomUUID()`
- `makeListener()` creates a `SessionListener` for this connection
- Heartbeat: 30s ping, dead if no pong before next ping
- `create_session`: call `sessionManager.createSession(options)` (no callbacks), then `subscribe(tempId, listener)`. Handle `session_id_resolved` synthetic message from SessionManager's remap broadcast.
- `resume_session` (NEW): call `sessionManager.resumeSession(sessionId)`, subscribe, send `session_resumed` back
- `send_message`: NO implicit resume. Just call `sendMessage()`. Error if session not running.
- `close_session` (NEW): call `sessionManager.closeSession(sessionId)`
- `switch_session`: load history, subscribe for live updates
- `cleanup` on close/error: `clearInterval(pingInterval)`, `sessionManager.unsubscribeAll(listenerId)`

```typescript
import type { WebSocket } from '@fastify/websocket'
import { randomUUID } from 'node:crypto'
import { readdir, mkdir } from 'node:fs/promises'
import { join, resolve, relative, basename, dirname } from 'node:path'
import type { SessionManager, PermissionMeta } from './session-manager.js'
import type { ClientMessage, ServerMessage, FileEntry } from './types.js'

const HEARTBEAT_INTERVAL = 30_000

export function createWsHandler(sessionManager: SessionManager) {
  return async function handleConnection(socket: WebSocket): Promise<void> {
    const listenerId = randomUUID()
    let alive = true

    function send(msg: ServerMessage): void {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg))
      }
    }

    // Heartbeat
    const pingInterval = setInterval(() => {
      if (!alive) { socket.terminate(); return }
      alive = false
      socket.ping()
    }, HEARTBEAT_INTERVAL)
    socket.on('pong', () => { alive = true })

    function makeListener() {
      return {
        id: listenerId,
        onMessage: (sid: string, message: unknown) => {
          const m = message as Record<string, unknown>
          if (m.type === 'permission_decided') {
            send({ type: 'permission_decided', toolUseId: m.toolUseId as string, approved: m.approved as boolean })
            return
          }
          if (m.type === 'session_id_resolved') {
            send({ type: 'session_id_resolved', tempId: m.tempId as string, sessionId: m.sessionId as string })
            return
          }
          send({ type: 'sdk_message', sessionId: sid, message })
          if ((m.type === 'system' && m.subtype === 'init') || m.type === 'commands_updated') {
            sessionManager.getCommands(sid).then((commands) => {
              if (commands.length > 0) send({ type: 'command_list', commands })
            }).catch(() => {})
          }
        },
        onPermissionRequest: (sid: string, toolUseId: string, toolName: string, input: Record<string, unknown>, meta: PermissionMeta) => {
          send({ type: 'permission_request', sessionId: sid, toolUseId, toolName, input, ...meta })
        },
        onEnd: (sid: string) => {
          send({ type: 'session_end', sessionId: sid })
        },
      }
    }

    function cleanup() {
      clearInterval(pingInterval)
      sessionManager.unsubscribeAll(listenerId)
    }
    socket.on('close', cleanup)
    socket.on('error', cleanup)

    socket.on('message', async (raw: Buffer) => {
      alive = true
      let msg: ClientMessage
      try { msg = JSON.parse(raw.toString()) as ClientMessage }
      catch { send({ type: 'error', message: 'Invalid JSON' }); return }

      try {
        switch (msg.type) {
          case 'create_session': {
            const cwd = msg.options?.cwd
            if (cwd) await mkdir(cwd, { recursive: true })
            const tempId = await sessionManager.createSession(msg.options)
            sessionManager.subscribe(tempId, makeListener())
            send({ type: 'session_created', sessionId: tempId })
            break
          }

          case 'resume_session': {
            await sessionManager.resumeSession(msg.sessionId)
            sessionManager.subscribe(msg.sessionId, makeListener())
            send({ type: 'session_resumed', sessionId: msg.sessionId })
            break
          }

          case 'send_message': {
            // Ensure subscribed (idempotent)
            sessionManager.subscribe(msg.sessionId, makeListener())
            await sessionManager.sendMessage(msg.sessionId, msg.content)
            break
          }

          case 'switch_session': {
            const history = await sessionManager.getHistory(msg.sessionId)
            send({ type: 'session_history', sessionId: msg.sessionId, messages: history })
            sessionManager.subscribe(msg.sessionId, makeListener())
            break
          }

          case 'close_session': {
            sessionManager.closeSession(msg.sessionId)
            break
          }

          case 'permission_decision': {
            sessionManager.resolvePermission(msg.toolUseId, msg.approved, msg.reason, msg.alwaysAllow)
            break
          }

          case 'list_sessions': {
            const sessions = await sessionManager.listSessions()
            send({ type: 'session_list', sessions })
            break
          }

          case 'list_files': {
            const cwd = sessionManager.getCwd(msg.sessionId)
            const prefix = msg.prefix || ''
            const files = await listFiles(cwd, prefix)
            send({ type: 'file_list', files })
            break
          }

          case 'get_default_cwd': {
            const cwd = sessionManager.getCwd()
            send({ type: 'default_cwd', cwd })
            break
          }

          case 'list_commands': {
            const commands = await sessionManager.getCommands(msg.sessionId)
            send({ type: 'command_list', commands })
            break
          }
        }
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
      }
    })

    // Initial session list
    try {
      const sessions = await sessionManager.listSessions()
      send({ type: 'session_list', sessions })
    } catch { /* non-fatal */ }
  }
}

// listFiles and entriesToFiles unchanged
```

- [ ] **Step 3: Verify server compiles**

Run: `cd cc-web-console/server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add server/src/types.ts server/src/ws-handler.ts
git commit -m "feat(server): ws-handler with subscribe, heartbeat, resume/close handlers"
```

---

### Task 3: Client — Session Store and Types

**Files:**
- Modify: `client/src/types.ts`
- Modify: `client/src/hooks/useSessionStore.ts`

- [ ] **Step 1: Update client types**

Add to `client/src/types.ts`:

```typescript
export interface ResumeSessionMessage {
  type: 'resume_session'
  sessionId: string
}

export interface CloseSessionMessage {
  type: 'close_session'
  sessionId: string
}
```

Update `ClientMessage` union:
```typescript
export type ClientMessage =
  | CreateSessionMessage
  | SendMessageMessage
  | SwitchSessionMessage
  | PermissionDecisionMessage
  | ListSessionsMessage
  | ListFilesMessage
  | GetDefaultCwdMessage
  | ListCommandsMessage
  | ResumeSessionMessage
  | CloseSessionMessage
```

- [ ] **Step 2: Add removeSession and setSessionStatus to useSessionStore**

Add to `SessionAction`:
```typescript
| { type: 'REMOVE_SESSION'; sessionId: string }
| { type: 'SET_SESSION_STATUS'; sessionId: string; status: 'idle' | 'running' }
```

Add reducer cases:
```typescript
case 'REMOVE_SESSION': {
  const newSessions = state.sessions.filter((s) => s.sessionId !== action.sessionId)
  const newMessages = { ...state.messagesBySession }
  delete newMessages[action.sessionId]
  const newHistory = { ...state.historyBySession }
  delete newHistory[action.sessionId]
  const newLoading = { ...state.loadingBySession }
  delete newLoading[action.sessionId]
  return {
    ...state,
    sessions: newSessions,
    activeSessionId: state.activeSessionId === action.sessionId ? null : state.activeSessionId,
    messagesBySession: newMessages,
    historyBySession: newHistory,
    loadingBySession: newLoading,
  }
}

case 'SET_SESSION_STATUS': {
  return {
    ...state,
    sessions: state.sessions.map((s) =>
      s.sessionId === action.sessionId ? { ...s, status: action.status } : s,
    ),
  }
}
```

Add callbacks and return them:
```typescript
const removeSession = useCallback((sessionId: string) => {
  dispatch({ type: 'REMOVE_SESSION', sessionId })
}, [])

const setSessionStatus = useCallback((sessionId: string, status: 'idle' | 'running') => {
  dispatch({ type: 'SET_SESSION_STATUS', sessionId, status })
}, [])
```

- [ ] **Step 3: Verify client compiles**

Run: `cd cc-web-console/client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add client/src/types.ts client/src/hooks/useSessionStore.ts
git commit -m "feat(client): add resume/close message types and session store actions"
```

---

### Task 4: Client — App.tsx, ChatPanel, SessionList, EventCard

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/ChatPanel.tsx`
- Modify: `client/src/components/SessionList.tsx`
- Modify: `client/src/components/EventCard.tsx`

- [ ] **Step 1: App.tsx — handle new server messages and add resume/close handlers**

Add handler for `session_resumed`:
```typescript
case 'session_resumed':
  store.setSessionStatus(data.sessionId as string, 'running')
  break
```

Add handler for `permission_decided`:
```typescript
case 'permission_decided': {
  const toolUseId = data.toolUseId as string
  const approved = data.approved as boolean
  for (const [sessionId, items] of Object.entries(store.messagesBySession)) {
    if (items.find((i) => i.id === toolUseId)) {
      store.updateChatItem(sessionId, toolUseId, {
        content: {
          permission: { status: approved ? 'approved' : 'denied' },
        },
      })
      break
    }
  }
  break
}
```

Update `session_end` to set status idle:
```typescript
case 'session_end':
  store.setSessionStatus(data.sessionId as string, 'idle')
  store.sessionEnd(data.sessionId as string)
  break
```

Add `handleResumeSession`:
```typescript
const handleResumeSession = useCallback(
  (sessionId: string) => {
    send({ type: 'resume_session', sessionId })
  },
  [send],
)
```

Add `handleCloseSession`:
```typescript
const handleCloseSession = useCallback(
  (sessionId: string) => {
    send({ type: 'close_session', sessionId })
  },
  [send],
)
```

Pass to ChatPanel: `onResume={handleResumeSession}`, `sessionRunning={activeSession?.status === 'running'}`
Pass to SessionList: `onClose={handleCloseSession}`

- [ ] **Step 2: ChatPanel — session status badge + resume button replacing input**

Add props:
```typescript
interface ChatPanelProps {
  // ... existing ...
  sessionRunning: boolean
  onResume: (sessionId: string) => void
}
```

In the header, add status badge next to session title:
```tsx
<span className={cn(
  "text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded",
  sessionRunning
    ? "bg-emerald-50 text-emerald-600"
    : "bg-slate-100 text-slate-400"
)}>
  {sessionRunning ? "running" : "idle"}
</span>
```

Replace the bottom input area: if `!sessionRunning`, show Resume button instead of input box:
```tsx
{/* Bottom input area */}
<div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4">
  <div className="max-w-4xl mx-auto">
    {sessionRunning ? (
      <>
        <StatusBar status={sessionStatus} loading={loading} />
        <div className="relative">
          {/* existing command menu, file mention, input box */}
        </div>
      </>
    ) : (
      <button
        onClick={() => activeSessionId && onResume(activeSessionId)}
        className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-medium rounded-xl transition-colors"
      >
        Resume Session
      </button>
    )}
  </div>
</div>
```

- [ ] **Step 3: SessionList — add close button on running sessions**

Add `onClose` prop to `SessionListProps`:
```typescript
onClose: (sessionId: string) => void
```

Import `X` from lucide-react.

Add `group relative` to session item className. Add close button:
```tsx
{session.status === 'running' && (
  <button
    onClick={(e) => { e.stopPropagation(); onClose(session.sessionId) }}
    className="absolute top-2 right-2 p-1 rounded text-slate-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
    title="Close session process"
  >
    <X className="w-3.5 h-3.5" />
  </button>
)}
```

- [ ] **Step 4: EventCard — derive decided from props + local state**

Replace:
```typescript
const [decided, setDecided] = useState<'approved' | 'denied' | null>(null)
```

With:
```typescript
const [localDecided, setLocalDecided] = useState<'approved' | 'denied' | null>(null)
const decided = permission?.status === 'approved'
  ? 'approved'
  : permission?.status === 'denied'
    ? 'denied'
    : localDecided
```

Update `handleDecision` to use `setLocalDecided` instead of `setDecided`.

- [ ] **Step 5: Verify client compiles**

Run: `cd cc-web-console/client && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add client/src/App.tsx client/src/components/ChatPanel.tsx client/src/components/SessionList.tsx client/src/components/EventCard.tsx
git commit -m "feat(client): explicit resume button, session status, close button, permission sync"
```

---

### Task 5: Manual Verification

- [ ] **Step 1: Single-user flow**

1. `npm run dev`
2. Create session → sends message → verify response + StatusBar
3. Close session via sidebar X → verify header shows `idle`, input replaced with Resume button
4. Click Resume → verify header shows `running`, input box returns
5. Send message → verify response

- [ ] **Step 2: Multi-connection broadcast**

1. Open two browser tabs
2. Tab A creates session, sends message
3. Tab B clicks same session → sees history + real-time updates
4. Tab A sends message → Tab B sees response
5. Permission prompt → Tab B clicks Allow → Tab A card updates to approved

- [ ] **Step 3: Heartbeat auto-close**

1. Create and resume a session
2. Close all browser tabs
3. Wait ~1.5 minutes (30s heartbeat detect + 60s idle timer)
4. Check server logs for `[SessionManager] Idle-closing session`
5. Reopen browser → session shows `idle`

- [ ] **Step 4: Resume with conflict**

1. Tab A resumes session, sends message
2. Tab B clicks Resume on same session
3. Server should force-kill Tab A's process, spawn new one
4. Tab A gets `session_end`, Tab B gets `session_resumed`

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(cc-web-console): multi-connection broadcast, session lifecycle management"
```
