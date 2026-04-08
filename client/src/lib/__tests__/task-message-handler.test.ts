import { describe, it, expect } from 'vitest'
import { handleTaskStarted, handleTaskProgress, handleTaskNotification, parseTaskNotificationXml, classifyTaskEvent } from '../task-message-handler'
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

  it('returns updated item with failed status and summary in result', () => {
    const item = makeToolUseItem('tool-1', { taskId: 'task-abc', taskStatus: 'running' })
    const result = handleTaskNotification(item, {
      task_id: 'task-abc',
      status: 'failed',
      summary: 'Error: out of memory',
      output_file: '/tmp/output.jsonl',
    })
    expect(result).not.toBeNull()
    expect(result!.taskStatus).toBe('failed')
    expect((result!.content as Record<string, unknown>).result).toBe('Error: out of memory')
  })

  it('returns updated item with stopped status and summary in result', () => {
    const item = makeToolUseItem('tool-1', { taskId: 'task-abc', taskStatus: 'running' })
    const result = handleTaskNotification(item, {
      task_id: 'task-abc',
      status: 'stopped',
      summary: 'Task was stopped by user',
      output_file: '/tmp/output.jsonl',
    })
    expect(result).not.toBeNull()
    expect(result!.taskStatus).toBe('stopped')
    expect((result!.content as Record<string, unknown>).result).toBe('Task was stopped by user')
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

describe('handleTaskStarted edge cases', () => {
  it('returns null when data has no tool_use_id', () => {
    const item = makeToolUseItem('tool-1')
    const result = handleTaskStarted(item, {
      task_id: 'task-abc',
      description: 'Analyzing code',
      // no tool_use_id
    })
    expect(result).toBeNull()
  })

  it('returns null when data.tool_use_id is undefined', () => {
    const item = makeToolUseItem('tool-1')
    const result = handleTaskStarted(item, {
      task_id: 'task-abc',
      tool_use_id: undefined,
      description: 'Analyzing code',
    })
    expect(result).toBeNull()
  })
})

describe('handleTaskNotification edge cases', () => {
  it('preserves existing content fields when adding result', () => {
    const item = makeToolUseItem('tool-1', {
      taskId: 'task-abc',
      taskStatus: 'running',
      content: { name: 'Agent', input: { prompt: 'do stuff' }, extra: 'data' },
    })
    const result = handleTaskNotification(item, {
      task_id: 'task-abc',
      status: 'completed',
      summary: 'Done',
      output_file: '/tmp/output.jsonl',
    })
    expect(result).not.toBeNull()
    const content = result!.content as Record<string, unknown>
    expect(content.result).toBe('Done')
    expect(content.name).toBe('Agent')
    expect(content.extra).toBe('data')
  })

  it('handles non-object content gracefully', () => {
    const item: ChatItem = {
      id: 'tool-1',
      type: 'tool_use',
      content: 'string content',
      timestamp: Date.now(),
      taskId: 'task-abc',
      taskStatus: 'running',
    }
    const result = handleTaskNotification(item, {
      task_id: 'task-abc',
      status: 'completed',
      summary: 'Done',
      output_file: '/tmp/output.jsonl',
    })
    expect(result).not.toBeNull()
    expect(result!.content).toEqual({ result: 'Done' })
  })

  it('does not include taskProgress when usage is not provided', () => {
    const item = makeToolUseItem('tool-1', { taskId: 'task-abc', taskStatus: 'running' })
    const result = handleTaskNotification(item, {
      task_id: 'task-abc',
      status: 'completed',
      summary: 'Done',
      output_file: '/tmp/output.jsonl',
      // no usage
    })
    expect(result).not.toBeNull()
    expect(result!.taskProgress).toBeUndefined()
  })
})

describe('parseTaskNotificationXml', () => {
  it('parses completed notification', () => {
    const text = '<task-notification><status>completed</status><summary>Analyzed 5 files</summary></task-notification>'
    const result = parseTaskNotificationXml(text)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('completed')
    expect(result!.summary).toBe('Analyzed 5 files')
    expect(result!.isFailed).toBe(false)
  })

  it('parses failed notification', () => {
    const text = '<task-notification><status>failed</status><summary>Out of memory</summary></task-notification>'
    const result = parseTaskNotificationXml(text)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('failed')
    expect(result!.summary).toBe('Out of memory')
    expect(result!.isFailed).toBe(true)
  })

  it('parses stopped notification', () => {
    const text = '<task-notification><status>stopped</status><summary>Stopped by user</summary></task-notification>'
    const result = parseTaskNotificationXml(text)
    expect(result).not.toBeNull()
    expect(result!.isFailed).toBe(true)
  })

  it('returns null for text without task-notification tag', () => {
    const text = 'This is just a regular message'
    expect(parseTaskNotificationXml(text)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseTaskNotificationXml('')).toBeNull()
  })

  it('handles missing status tag', () => {
    const text = '<task-notification><summary>Done</summary></task-notification>'
    const result = parseTaskNotificationXml(text)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('')
    expect(result!.summary).toBe('Done')
    expect(result!.isFailed).toBe(false)
  })

  it('handles missing summary tag', () => {
    const text = '<task-notification><status>completed</status></task-notification>'
    const result = parseTaskNotificationXml(text)
    expect(result).not.toBeNull()
    expect(result!.summary).toBe('')
  })

  it('extracts from text with surrounding content', () => {
    const text = 'Some prefix <task-notification><status>completed</status><summary>OK</summary></task-notification> some suffix'
    const result = parseTaskNotificationXml(text)
    expect(result).not.toBeNull()
    expect(result!.summary).toBe('OK')
  })

  it('handles multiline content', () => {
    const text = `<task-notification>
<status>completed</status>
<summary>Successfully processed all files</summary>
</task-notification>`
    const result = parseTaskNotificationXml(text)
    expect(result).not.toBeNull()
    expect(result!.status).toBe('completed')
    expect(result!.summary).toBe('Successfully processed all files')
  })
})

describe('classifyTaskEvent', () => {
  // Scenario 1: top-level async SubAgent → render as main chat status line
  it('routes to main-status-line when tool_use_id is a known background agent', () => {
    const bgIds = new Set(['tool-bg-1'])
    const nestedMap = new Map<string, string>()
    const result = classifyTaskEvent('tool-bg-1', bgIds, nestedMap)
    expect(result).toEqual({ target: 'main-status-line' })
  })

  // Scenario 2: top-level sync SubAgent → update SubAgentCard usage
  it('routes to update-subagent-card when tool_use_id is a known foreground agent', () => {
    const bgIds = new Set<string>()
    const nestedMap = new Map<string, string>()
    const result = classifyTaskEvent('tool-fg-1', bgIds, nestedMap)
    expect(result).toEqual({ target: 'update-subagent-card', toolUseId: 'tool-fg-1' })
  })

  // Scenario 3: nested async SubSubAgent inside sync SubAgent → route to parent subagentMessages
  it('routes to nested-subagent when tool_use_id is in nestedBgAgentMap', () => {
    const bgIds = new Set<string>()
    const nestedMap = new Map([['tool-nested-bg', 'tool-parent-fg']])
    const result = classifyTaskEvent('tool-nested-bg', bgIds, nestedMap)
    expect(result).toEqual({ target: 'nested-subagent', parentToolUseId: 'tool-parent-fg' })
  })

  // Scenario 4: unknown tool_use_id → drop
  it('returns null when tool_use_id is undefined', () => {
    const bgIds = new Set<string>()
    const nestedMap = new Map<string, string>()
    const result = classifyTaskEvent(undefined, bgIds, nestedMap)
    expect(result).toBeNull()
  })

  // Priority: nestedBgAgentMap takes precedence over fallback to update-subagent-card
  it('nestedBgAgentMap takes precedence over default foreground route', () => {
    const bgIds = new Set<string>()
    const nestedMap = new Map([['tool-x', 'tool-parent']])
    const result = classifyTaskEvent('tool-x', bgIds, nestedMap)
    expect(result).toEqual({ target: 'nested-subagent', parentToolUseId: 'tool-parent' })
  })

  // Priority: backgroundToolUseIds takes precedence over nestedBgAgentMap
  it('backgroundToolUseIds takes precedence over nestedBgAgentMap', () => {
    const bgIds = new Set(['tool-x'])
    const nestedMap = new Map([['tool-x', 'tool-parent']])
    const result = classifyTaskEvent('tool-x', bgIds, nestedMap)
    expect(result).toEqual({ target: 'main-status-line' })
  })
})
