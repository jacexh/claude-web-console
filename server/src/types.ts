// === Client → Server Messages ===

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

export interface CloseSessionMessage {
  type: 'close_session'
  sessionId: string
}

export interface InterruptSessionMessage {
  type: 'interrupt_session'
  sessionId: string
}

export interface StopTaskMessage {
  type: 'stop_task'
  sessionId: string
  taskId: string
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

export interface SetPermissionModeMessage {
  type: 'set_permission_mode'
  sessionId: string
  mode: string
}

export interface SetEnvMessage {
  type: 'set_env'
  sessionId: string
  env: Record<string, string>
}

export interface GetSessionSettingsMessage {
  type: 'get_session_settings'
  sessionId: string
}

export type ClientMessage =
  | SendMessageMessage
  | SwitchSessionMessage
  | PermissionDecisionMessage
  | ListSessionsMessage
  | ListFilesMessage
  | GetDefaultCwdMessage
  | ListCommandsMessage
  | CloseSessionMessage
  | InterruptSessionMessage
  | StopTaskMessage
  | SetModelMessage
  | ListModelsMessage
  | RenameSessionMessage
  | ForkSessionMessage
  | SetEffortLevelMessage
  | GetSubagentMessagesMessage
  | ElicitationResponseMessage
  | SetPermissionModeMessage
  | SetEnvMessage
  | GetSessionSettingsMessage

// === Server → Client Messages ===

export interface SessionListMessage {
  type: 'session_list'
  sessions: SessionInfo[]
}

export interface SessionInfo {
  sessionId: string
  summary: string
  lastModified: number
  status: 'idle' | 'running' | 'stopped'
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
  title: string
}

export interface EffortLevelChangedMessage {
  type: 'effort_level_changed'
  sessionId: string
  level: EffortLevel
}

export interface ModelChangedMessage {
  type: 'model_changed'
  sessionId: string
  model: string
}

export interface SessionStateMessage {
  type: 'session_state'
  sessionId: string
  model?: string
  effortLevel?: EffortLevel
  status?: 'idle' | 'running' | 'stopped'
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

export interface SessionStatusMessage {
  type: 'session_status'
  sessionId: string
  status: string
}

export type ServerMessage =
  | SessionListMessage
  | SdkEventMessage
  | PermissionRequestMessage
  | ErrorMessage
  | SessionEndMessage
  | SessionHistoryMessage
  | FileListMessage
  | DefaultCwdMessage
  | CommandListMessage
  | PermissionDecidedMessage
  | SessionResumedMessage
  | ModelListMessage
  | SessionRenamedMessage
  | SessionForkedMessage
  | EffortLevelChangedMessage
  | ModelChangedMessage
  | SessionStateMessage
  | SubagentMessagesMessage
  | ElicitationRequestMessage
  | SessionSettingsMessage
  | SessionStatusMessage
