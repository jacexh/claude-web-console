// === Client → Server Messages ===

export interface CreateSessionMessage {
  type: 'create_session'
  options?: {
    model?: string
    cwd?: string
    permissionMode?: string
    executableArgs?: string[]
    env?: Record<string, string>
  }
}

export interface SendMessageMessage {
  type: 'send_message'
  sessionId: string
  content: string
}

export interface SwitchSessionMessage {
  type: 'switch_session'
  sessionId: string
}

export interface PermissionDecisionMessage {
  type: 'permission_decision'
  toolUseId: string
  approved: boolean
  reason?: string
  alwaysAllow?: boolean
  updatedPermissions?: unknown[]
}

export interface ListSessionsMessage {
  type: 'list_sessions'
}

export interface ListFilesMessage {
  type: 'list_files'
  prefix: string
  sessionId?: string
}

export interface GetDefaultCwdMessage {
  type: 'get_default_cwd'
}

export interface ListCommandsMessage {
  type: 'list_commands'
  sessionId: string
}

export interface ResumeSessionMessage {
  type: 'resume_session'
  sessionId: string
}

export interface CloseSessionMessage {
  type: 'close_session'
  sessionId: string
}

export interface InterruptSessionMessage {
  type: 'interrupt_session'
  sessionId: string
}

export interface SetModelMessage {
  type: 'set_model'
  sessionId: string
  model: string
}

export interface ListModelsMessage {
  type: 'list_models'
  sessionId: string
}

export interface RenameSessionMessage {
  type: 'rename_session'
  sessionId: string
  title: string
}

export interface ForkSessionMessage {
  type: 'fork_session'
  sessionId: string
  upToMessageId: string
}

export type EffortLevel = 'low' | 'medium' | 'high' | 'max'

export interface SetEffortLevelMessage {
  type: 'set_effort_level'
  sessionId: string
  level: EffortLevel
}

export interface GetSubagentMessagesMessage {
  type: 'get_subagent_messages'
  sessionId: string
  agentId: string
}

export interface ElicitationResponseMessage {
  type: 'elicitation_response'
  id: string
  action: 'accept' | 'decline' | 'cancel'
  content?: Record<string, unknown>
}

export interface GetSessionSettingsMessage {
  type: 'get_session_settings'
  sessionId: string
}

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
  | InterruptSessionMessage
  | SetModelMessage
  | ListModelsMessage
  | RenameSessionMessage
  | ForkSessionMessage
  | SetEffortLevelMessage
  | GetSubagentMessagesMessage
  | ElicitationResponseMessage
  | GetSessionSettingsMessage

// === Server → Client Messages ===

export interface SessionCreatedMessage {
  type: 'session_created'
  sessionId: string
}

export interface SessionListMessage {
  type: 'session_list'
  sessions: SessionInfo[]
}

export interface SessionInfo {
  sessionId: string
  summary: string
  lastModified: number
  status: 'idle' | 'running'
  cwd?: string
}

export interface SdkEventMessage {
  type: 'sdk_message'
  sessionId: string
  message: unknown // SDK message, typed on client side
}

export interface PermissionRequestMessage {
  type: 'permission_request'
  sessionId: string
  toolUseId: string
  toolName: string
  input: Record<string, unknown>
  agentId?: string
  title?: string
  description?: string
  hasSuggestions?: boolean
}

export interface ErrorMessage {
  type: 'error'
  message: string
}

export interface SessionEndMessage {
  type: 'session_end'
  sessionId: string
}

export interface SessionHistoryMessage {
  type: 'session_history'
  sessionId: string
  messages: unknown[]
}

export interface SessionIdResolvedMessage {
  type: 'session_id_resolved'
  tempId: string
  sessionId: string
}

export interface FileListMessage {
  type: 'file_list'
  files: FileEntry[]
}

export interface FileEntry {
  name: string
  path: string
  isDir: boolean
}

export interface DefaultCwdMessage {
  type: 'default_cwd'
  cwd: string
}

export interface CommandListMessage {
  type: 'command_list'
  commands: { name: string; description: string }[]
}

export interface PermissionDecidedMessage {
  type: 'permission_decided'
  toolUseId: string
  approved: boolean
}

export interface SessionResumedMessage {
  type: 'session_resumed'
  sessionId: string
}

export interface ModelInfo {
  value: string
  displayName: string
  description: string
}

export interface ModelListMessage {
  type: 'model_list'
  sessionId: string
  models: ModelInfo[]
  currentModel?: string
}

export interface SessionRenamedMessage {
  type: 'session_renamed'
  sessionId: string
  title: string
}

export interface SessionForkedMessage {
  type: 'session_forked'
  sessionId: string
  newSessionId: string
}

export interface EffortLevelChangedMessage {
  type: 'effort_level_changed'
  sessionId: string
  level: EffortLevel
}

export interface SubagentMessagesMessage {
  type: 'subagent_messages'
  sessionId: string
  agentId: string
  messages: unknown[]
}

export interface ElicitationRequestMessage {
  type: 'elicitation_request'
  id: string
  serverName: string
  message: string
  mode?: string
  requestedSchema?: Record<string, unknown>
  url?: string
}

export interface SessionSettingsMessage {
  type: 'session_settings'
  sessionId: string
  settings: Record<string, unknown>
}

export type ServerMessage =
  | SessionCreatedMessage
  | SessionListMessage
  | SdkEventMessage
  | PermissionRequestMessage
  | ErrorMessage
  | SessionEndMessage
  | SessionHistoryMessage
  | SessionIdResolvedMessage
  | FileListMessage
  | DefaultCwdMessage
  | CommandListMessage
  | PermissionDecidedMessage
  | SessionResumedMessage
  | ModelListMessage
  | SessionRenamedMessage
  | SessionForkedMessage
  | EffortLevelChangedMessage
  | SubagentMessagesMessage
  | ElicitationRequestMessage
  | SessionSettingsMessage
