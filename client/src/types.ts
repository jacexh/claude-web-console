// Mirror server types for WS protocol
export interface CreateSessionMessage {
  type: 'create_session'
  options?: { model?: string; cwd?: string }
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

// Server → Client
export interface SessionInfo {
  sessionId: string
  summary: string
  lastModified: number
  status: 'idle' | 'running'
}

export interface ServerMessage {
  type: string
  [key: string]: unknown
}

export interface ModelInfo {
  value: string
  displayName: string
  description: string
}

// Frontend display types
export type ChatItemType = 'user' | 'assistant' | 'tool_use' | 'tool_result' | 'permission_request' | 'system'

export interface ChatItem {
  id: string
  type: ChatItemType
  content: unknown
  timestamp: number
  collapsed?: boolean
}
