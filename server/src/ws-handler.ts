import type { WebSocket } from '@fastify/websocket'
import { randomUUID } from 'node:crypto'
import { readdir, mkdir } from 'node:fs/promises'
import { join, resolve, relative, basename, dirname } from 'node:path'
import type { SessionManager, PermissionMeta, SessionListener } from './session-manager.js'
import type { ClientMessage, ServerMessage, FileEntry, EffortLevel } from './types.js'

export function createWsHandler(sessionManager: SessionManager) {
  return async function handleConnection(socket: WebSocket): Promise<void> {
    const listenerId = randomUUID()
    let alive = true

    // --- Heartbeat: 30s ping interval ---
    const pingInterval = setInterval(() => {
      if (!alive) {
        socket.terminate()
        return
      }
      alive = false
      socket.ping()
    }, 30_000)

    socket.on('pong', () => {
      alive = true
    })

    function send(msg: ServerMessage): void {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg))
      }
    }

    function makeListener(sessionId: string): SessionListener {
      return {
        id: listenerId,
        onMessage(sid, message) {
          const msg = message as Record<string, unknown>

          // Handle synthetic messages from SessionManager
          if (msg.type === 'permission_decided') {
            send({
              type: 'permission_decided',
              toolUseId: msg.toolUseId as string,
              approved: msg.approved as boolean,
            })
            return
          }

          if (msg.type === 'session_id_resolved') {
            send({
              type: 'session_id_resolved',
              tempId: msg.tempId as string,
              sessionId: msg.sessionId as string,
            })
            return
          }

          if (msg.type === 'session_resumed') {
            send({
              type: 'session_resumed',
              sessionId: msg.sessionId as string,
            })
            return
          }

          if (msg.type === 'session_renamed') {
            send({
              type: 'session_renamed',
              sessionId: msg.sessionId as string,
              title: msg.title as string,
            })
            return
          }

          if (msg.type === 'session_forked') {
            send({
              type: 'session_forked',
              sessionId: msg.sessionId as string,
              newSessionId: msg.newSessionId as string,
            })
            return
          }

          if (msg.type === 'effort_level_changed') {
            send({
              type: 'effort_level_changed',
              sessionId: msg.sessionId as string,
              level: msg.level as EffortLevel,
            })
            return
          }

          if (msg.type === 'elicitation_request') {
            send({
              type: 'elicitation_request',
              id: msg.id as string,
              serverName: msg.serverName as string,
              message: msg.message as string,
              mode: msg.mode as string | undefined,
              requestedSchema: msg.requestedSchema as Record<string, unknown> | undefined,
              url: msg.url as string | undefined,
            })
            return
          }

          // Auto-push command list on init or commands_updated
          if ((msg.type === 'system' && msg.subtype === 'init') || msg.type === 'commands_updated') {
            sessionManager.getCommands(sid).then((commands) => {
              if (commands.length > 0) {
                send({ type: 'command_list', commands })
              }
            }).catch(() => {})
            if (msg.type === 'commands_updated') return // don't forward synthetic message
          }

          // Push model list when available
          if (msg.type === 'models_updated') {
            send({
              type: 'model_list',
              sessionId: sid,
              models: msg.models as { value: string; displayName: string; description: string }[],
              currentModel: msg.currentModel as string | undefined,
            })
            return // don't forward synthetic message
          }

          send({ type: 'sdk_message', sessionId: sid, message })
        },
        onPermissionRequest(sid, toolUseId, toolName, input, meta) {
          send({ type: 'permission_request', sessionId: sid, toolUseId, toolName, input, ...meta })
        },
        onEnd(sid) {
          send({ type: 'session_end', sessionId: sid })
        },
      }
    }

    // --- Cleanup on close/error ---
    function cleanup(): void {
      clearInterval(pingInterval)
      sessionManager.unsubscribeAll(listenerId)
    }

    socket.on('close', cleanup)
    socket.on('error', cleanup)

    // --- Message handling ---
    socket.on('message', async (raw: Buffer) => {
      alive = true

      let msg: ClientMessage
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage
      } catch {
        send({ type: 'error', message: 'Invalid JSON' })
        return
      }

      try {
        switch (msg.type) {
          case 'create_session': {
            // Ensure cwd exists before creating session
            const cwd = msg.options?.cwd
            if (cwd) {
              await mkdir(cwd, { recursive: true })
            }

            const tempId = await sessionManager.createSession(msg.options)
            sessionManager.subscribe(tempId, makeListener(tempId))
            send({ type: 'session_created', sessionId: tempId })
            break
          }

          case 'resume_session': {
            // Subscribe BEFORE resume so this connection receives the broadcast too
            sessionManager.subscribe(msg.sessionId, makeListener(msg.sessionId))
            await sessionManager.resumeSession(msg.sessionId)
            break
          }

          case 'send_message': {
            // Subscribe for live updates (idempotent via listener dedup)
            sessionManager.subscribe(msg.sessionId, makeListener(msg.sessionId))
            await sessionManager.sendMessage(msg.sessionId, msg.content)
            console.log('[ws] Message sent to session', msg.sessionId)
            break
          }

          case 'switch_session': {
            // Load historical messages
            const history = await sessionManager.getHistory(msg.sessionId)
            send({ type: 'session_history', sessionId: msg.sessionId, messages: history })
            // Subscribe for live updates if session is running
            sessionManager.subscribe(msg.sessionId, makeListener(msg.sessionId))
            break
          }

          case 'close_session': {
            sessionManager.closeSession(msg.sessionId)
            // Listeners get session_end via broadcast inside closeSession
            break
          }

          case 'permission_decision': {
            sessionManager.resolvePermission(
              msg.toolUseId,
              msg.approved,
              msg.reason,
              msg.alwaysAllow,
            )
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

          case 'set_model': {
            await sessionManager.setModel(msg.sessionId, msg.model)
            break
          }

          case 'list_models': {
            const models = await sessionManager.getSupportedModels(msg.sessionId)
            if (models.length > 0) {
              send({ type: 'model_list', sessionId: msg.sessionId, models })
            }
            break
          }

          case 'rename_session': {
            await sessionManager.renameSession(msg.sessionId, msg.title)
            break
          }

          case 'fork_session': {
            const newSessionId = await sessionManager.forkSession(msg.sessionId, msg.upToMessageId)
            send({ type: 'session_forked', sessionId: msg.sessionId, newSessionId })
            break
          }

          case 'set_effort_level': {
            await sessionManager.setEffortLevel(msg.sessionId, msg.level)
            break
          }

          case 'get_subagent_messages': {
            const messages = await sessionManager.getSubagentMessages(msg.sessionId, msg.agentId)
            send({ type: 'subagent_messages', agentId: msg.agentId, messages })
            break
          }

          case 'elicitation_response': {
            sessionManager.resolveElicitation(msg.id, msg.action, msg.content as Record<string, unknown> | undefined)
            break
          }
        }
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : 'Unknown error' })
      }
    })

    // Send initial session list on connect
    try {
      const sessions = await sessionManager.listSessions()
      send({ type: 'session_list', sessions })
    } catch {
      // Non-fatal: proceed without initial session list
    }
  }
}

const IGNORED = new Set(['.git', 'node_modules', '.next', 'dist', '__pycache__', '.venv', 'venv', '.cache'])
const MAX_FILES = 50

async function listFiles(cwd: string, prefix: string): Promise<FileEntry[]> {
  // Determine which directory to read based on the prefix
  // e.g. prefix="src/comp" → dir="src", namePrefix="comp"
  const targetPath = resolve(cwd, prefix)
  let dir: string
  let namePrefix: string

  try {
    const entries = await readdir(targetPath, { withFileTypes: true })
    // prefix points to a directory, list its contents
    dir = targetPath
    namePrefix = ''
    return entriesToFiles(entries, dir, cwd, namePrefix)
  } catch {
    // prefix is partial — list the parent directory and filter
    dir = dirname(targetPath)
    namePrefix = basename(targetPath).toLowerCase()
  }

  try {
    const entries = await readdir(dir, { withFileTypes: true })
    return entriesToFiles(entries, dir, cwd, namePrefix)
  } catch {
    return []
  }
}

function entriesToFiles(
  entries: import('node:fs').Dirent[],
  dir: string,
  cwd: string,
  namePrefix: string,
): FileEntry[] {
  const results: FileEntry[] = []
  for (const entry of entries) {
    if (entry.name.startsWith('.') && !namePrefix.startsWith('.')) continue
    if (IGNORED.has(entry.name)) continue
    if (namePrefix && !entry.name.toLowerCase().startsWith(namePrefix)) continue
    const fullPath = join(dir, entry.name)
    const relPath = relative(cwd, fullPath)
    results.push({
      name: entry.name,
      path: relPath + (entry.isDirectory() ? '/' : ''),
      isDir: entry.isDirectory(),
    })
    if (results.length >= MAX_FILES) break
  }
  // Directories first, then files, alphabetical
  results.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  return results
}
