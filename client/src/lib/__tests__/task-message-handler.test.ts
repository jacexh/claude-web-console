import { describe, it, expect } from 'vitest'
import { handleTaskStarted, handleTaskProgress, handleTaskNotification } from '../task-message-handler'
import type { ChatItem } from '../../types'

function makeToolUseItem(id: string, overrides?: Partial<ChatItem>): ChatItem {
  return {
    id,
    type: 'tool_use',
    content: { name: 'Agent', input: { prompt: 'do stuff', run_in_background: true } },
    timestamp: Date.now(),
    agentId: id,
    toolInput: { prompt: 'do stuff', run_in_background: true },
    ...overrides,
  }
}

describe('handleTaskStarted', () => {
  it('returns updated item with taskId and running status when tool_use_id matches', () => {
    const item = makeToolUseItem('tool-1')
    const result = handleTaskStarted(item, {
      task_id: 'task-abc',
      tool_use_id: 'tool-1',
      description: 'Analyzing code',
    })
    expect(result).not.toBeNull()
    expect(result!.taskId).toBe('task-abc')
    expect(result!.taskStatus).toBe('running')
  })

  it('returns null when tool_use_id does not match', () => {
    const item = makeToolUseItem('tool-1')
    const result = handleTaskStarted(item, {
      task_id: 'task-abc',
      tool_use_id: 'tool-other',
      description: 'Analyzing code',
    })
    expect(result).toBeNull()
  })

  it('returns null for non-tool_use items', () => {
    const item: ChatItem = { id: 'msg-1', type: 'assistant', content: 'hello', timestamp: Date.now() }
    const result = handleTaskStarted(item, {
      task_id: 'task-abc',
      tool_use_id: 'msg-1',
      description: 'Analyzing code',
    })
    expect(result).toBeNull()
  })
})

describe('handleTaskProgress', () => {
  it('returns updated item with progress data when taskId matches', () => {
    const item = makeToolUseItem('tool-1', { taskId: 'task-abc', taskStatus: 'running' })
    const result = handleTaskProgress(item, {
      task_id: 'task-abc',
      description: 'Reading files',
      usage: { total_tokens: 1500, tool_uses: 3, duration_ms: 12000 },
      last_tool_name: 'Read',
    })
    expect(result).not.toBeNull()
    expect(result!.taskProgress).toEqual({
      tokens: 1500,
      toolUses: 3,
      durationMs: 12000,
      lastToolName: 'Read',
      description: 'Reading files',
    })
  })

  it('returns null when taskId does not match', () => {
    const item = makeToolUseItem('tool-1', { taskId: 'task-other' })
    const result = handleTaskProgress(item, {
      task_id: 'task-abc',
      description: 'Reading files',
      usage: { total_tokens: 100, tool_uses: 1, duration_ms: 1000 },
    })
    expect(result).toBeNull()
  })

  it('returns null for items without taskId', () => {
    const item = makeToolUseItem('tool-1')
    const result = handleTaskProgress(item, {
      task_id: 'task-abc',
      description: 'Reading files',
      usage: { total_tokens: 100, tool_uses: 1, duration_ms: 1000 },
    })
    expect(result).toBeNull()
  })
})

describe('handleTaskNotification', () => {
  it('returns updated item with completed status and summary', () => {
    const item = makeToolUseItem('tool-1', { taskId: 'task-abc', taskStatus: 'running' })
    const result = handleTaskNotification(item, {
      task_id: 'task-abc',
      status: 'completed',
      summary: 'Successfully analyzed 5 files',
      output_file: '/tmp/output.jsonl',
      usage: { total_tokens: 5000, tool_uses: 12, duration_ms: 45000 },
    })
    expect(result).not.toBeNull()
    expect(result!.taskStatus).toBe('completed')
    const content = result!.content as Record<string, unknown>
    expect(content.result).toBe('Successfully analyzed 5 files')
    expect(result!.taskProgress).toEqual({
      tokens: 5000,
      toolUses: 12,
      durationMs: 45000,
    })
  })

  it('returns updated item with failed status', () => {
    const item = makeToolUseItem('tool-1', { taskId: 'task-abc', taskStatus: 'running' })
    const result = handleTaskNotification(item, {
      task_id: 'task-abc',
      status: 'failed',
      summary: 'Error: out of memory',
      output_file: '/tmp/output.jsonl',
    })
    expect(result).not.toBeNull()
    expect(result!.taskStatus).toBe('failed')
  })

  it('returns updated item with stopped status', () => {
    const item = makeToolUseItem('tool-1', { taskId: 'task-abc', taskStatus: 'running' })
    const result = handleTaskNotification(item, {
      task_id: 'task-abc',
      status: 'stopped',
      summary: 'Task was stopped by user',
      output_file: '/tmp/output.jsonl',
    })
    expect(result).not.toBeNull()
    expect(result!.taskStatus).toBe('stopped')
  })

  it('returns null when taskId does not match', () => {
    const item = makeToolUseItem('tool-1', { taskId: 'task-other' })
    const result = handleTaskNotification(item, {
      task_id: 'task-abc',
      status: 'completed',
      summary: 'Done',
      output_file: '/tmp/output.jsonl',
    })
    expect(result).toBeNull()
  })
})
