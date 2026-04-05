// === Client → Server Messages ===

export interface CreateSessionMessage {
  type: 'create_session'
  options?: {
    model?: string
    cwd?: string
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

export interface SetModelMessage {
  type: 'set_model'
  sessionId: string
  model: string
}

export interface ListModelsMessage {
  type: 'list_models'
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
  | SetModelMessage
  | ListModelsMessage

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
