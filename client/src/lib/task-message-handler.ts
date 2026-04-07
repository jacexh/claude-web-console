import type { ChatItem } from '../types'

export interface TaskStartedData {
  task_id: string
  tool_use_id?: string
  description: string
}

export interface TaskProgressData {
  task_id: string
  description: string
  usage: { total_tokens: number; tool_uses: number; duration_ms: number }
  last_tool_name?: string
  summary?: string
}

export interface TaskNotificationData {
  task_id: string
  status: 'completed' | 'failed' | 'stopped'
  summary: string
  output_file: string
  usage?: { total_tokens: number; tool_uses: number; duration_ms: number }
}

export function handleTaskStarted(item: ChatItem, data: TaskStartedData): ChatItem | null {
  if (item.type !== 'tool_use' || item.id !== data.tool_use_id) return null
  return {
    ...item,
    taskId: data.task_id,
    taskStatus: 'running',
  }
}

export function handleTaskProgress(item: ChatItem, data: TaskProgressData): ChatItem | null {
  if (item.taskId !== data.task_id) return null
  return {
    ...item,
    taskProgress: {
      tokens: data.usage.total_tokens,
      toolUses: data.usage.tool_uses,
      durationMs: data.usage.duration_ms,
      lastToolName: data.last_tool_name,
      description: data.description,
    },
  }
}

export function handleTaskNotification(item: ChatItem, data: TaskNotificationData): ChatItem | null {
  if (item.taskId !== data.task_id) return null
  const content =
    typeof item.content === 'object' && item.content !== null
      ? { ...(item.content as Record<string, unknown>), result: data.summary }
      : { result: data.summary }
  return {
    ...item,
    taskStatus: data.status,
    content,
    ...(data.usage
      ? {
          taskProgress: {
            tokens: data.usage.total_tokens,
            toolUses: data.usage.tool_uses,
            durationMs: data.usage.duration_ms,
          },
        }
      : {}),
  }
}
