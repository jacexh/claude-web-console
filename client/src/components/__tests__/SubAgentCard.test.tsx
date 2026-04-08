import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SubAgentCard } from '../SubAgentCard'
import type { ChatItem } from '../../types'

const baseProps = {
  agentId: 'agent-1',
  sessionId: 'session-1',
  description: 'Analyzing code',
  status: 'running' as const,
  onExpand: vi.fn(),
}

describe('SubAgentCard', () => {
  it('renders with description and status', () => {
    render(<SubAgentCard {...baseProps} />)
    expect(screen.getByText('Analyzing code')).toBeTruthy()
    expect(screen.getByText('running')).toBeTruthy()
  })

  it('renders agent name when provided', () => {
    render(<SubAgentCard {...baseProps} agentName="Explore" />)
    expect(screen.getByText('Explore')).toBeTruthy()
  })

  it('renders done status', () => {
    render(<SubAgentCard {...baseProps} status="done" />)
    expect(screen.getByText('done')).toBeTruthy()
  })

  it('renders error status', () => {
    render(<SubAgentCard {...baseProps} status="error" />)
    expect(screen.getByText('error')).toBeTruthy()
  })
})

describe('SubAgentCard toggle & expand', () => {
  it('calls onExpand when first expanded and no subagentMessages exist', () => {
    const onExpand = vi.fn()
    render(<SubAgentCard {...baseProps} onExpand={onExpand} />)
    // Click header to expand
    fireEvent.click(screen.getByText('Analyzing code'))
    expect(onExpand).toHaveBeenCalledWith('session-1', 'agent-1')
  })

  it('does not call onExpand when subagentMessages already exist', () => {
    const onExpand = vi.fn()
    const messages: ChatItem[] = [
      { id: 'msg-1', type: 'assistant', content: 'Working on it...', timestamp: 0 },
    ]
    render(<SubAgentCard {...baseProps} onExpand={onExpand} subagentMessages={messages} />)
    fireEvent.click(screen.getByText('Analyzing code'))
    expect(onExpand).not.toHaveBeenCalled()
  })

  it('shows "Waiting for messages..." when expanded with no messages and running', () => {
    render(<SubAgentCard {...baseProps} subagentMessages={[]} />)
    fireEvent.click(screen.getByText('Analyzing code'))
    expect(screen.getByText('Waiting for messages...')).toBeTruthy()
  })

  it('shows "Internal messages..." when expanded with no messages and done', () => {
    render(<SubAgentCard {...baseProps} status="done" subagentMessages={[]} />)
    fireEvent.click(screen.getByText('Analyzing code'))
    expect(screen.getByText('Internal messages are only available during live sessions')).toBeTruthy()
  })

  it('shows resultPreview when collapsed', () => {
    render(<SubAgentCard {...baseProps} status="done" resultPreview="Found 3 issues" />)
    expect(screen.getByText('Found 3 issues')).toBeTruthy()
  })

  it('hides resultPreview when expanded', () => {
    const messages: ChatItem[] = [
      { id: 'msg-1', type: 'assistant', content: 'Analysis complete', timestamp: 0 },
    ]
    render(<SubAgentCard {...baseProps} status="done" resultPreview="Found 3 issues" subagentMessages={messages} />)
    fireEvent.click(screen.getByText('Analyzing code'))
    expect(screen.queryByText('Found 3 issues')).toBeNull()
  })
})

describe('SubAgentCard auto-expand', () => {
  it('auto-expands when status is running and subagentMessages arrive', () => {
    const messages: ChatItem[] = [
      { id: 'msg-1', type: 'assistant', content: 'Starting analysis...', timestamp: 0 },
    ]
    render(<SubAgentCard {...baseProps} status="running" subagentMessages={messages} />)
    // Should auto-expand and show the message
    expect(screen.getByText('Starting analysis...')).toBeTruthy()
  })

  it('does not auto-expand when status is done even with messages', () => {
    const messages: ChatItem[] = [
      { id: 'msg-1', type: 'assistant', content: 'Done text', timestamp: 0 },
    ]
    render(<SubAgentCard {...baseProps} status="done" subagentMessages={messages} />)
    // Should NOT auto-expand — message not visible until manual click
    expect(screen.queryByText('Done text')).toBeNull()
  })

  it('does not auto-expand when running but subagentMessages is empty', () => {
    render(<SubAgentCard {...baseProps} status="running" subagentMessages={[]} />)
    // Empty messages → no auto-expand → "Waiting" text not visible
    expect(screen.queryByText('Waiting for messages...')).toBeNull()
  })
})

describe('SubAgentCard renderItem', () => {
  function renderExpanded(messages: ChatItem[], extraProps?: Partial<typeof baseProps>) {
    // Use running + non-empty messages to trigger auto-expand
    render(
      <SubAgentCard
        {...baseProps}
        status="running"
        subagentMessages={messages}
        {...extraProps}
      />
    )
  }

  it('renders user message via MessageBubble', () => {
    renderExpanded([
      { id: 'u1', type: 'user', content: 'Please analyze this file', timestamp: 0 },
    ])
    expect(screen.getByText('Please analyze this file')).toBeTruthy()
  })

  it('renders assistant message via MessageBubble', () => {
    renderExpanded([
      { id: 'a1', type: 'assistant', content: 'I found a bug in line 42', timestamp: 0 },
    ])
    expect(screen.getByText('I found a bug in line 42')).toBeTruthy()
  })

  it('renders tool_use as EventCard for non-Agent tools', () => {
    renderExpanded([
      {
        id: 'tool-1',
        type: 'tool_use',
        content: { name: 'Read', input: { file_path: '/src/index.ts' } },
        timestamp: 0,
      },
    ])
    expect(screen.getByText('Read')).toBeTruthy()
  })

  it('renders nested Agent tool_use as nested SubAgentCard', () => {
    renderExpanded([
      {
        id: 'nested-agent-1',
        type: 'tool_use',
        content: { name: 'Agent', input: { prompt: 'Search for files', description: 'File search' } },
        timestamp: 0,
        agentId: 'nested-agent-1',
        toolInput: { prompt: 'Search for files', description: 'File search', subagent_type: 'Explore' },
      },
    ])
    // Nested SubAgentCard should render with description and agent type
    expect(screen.getByText('File search')).toBeTruthy()
    expect(screen.getByText('Explore')).toBeTruthy()
  })

  it('renders system type items as inline status lines (nested async agent events)', () => {
    renderExpanded([
      {
        id: 'sys-1',
        type: 'system',
        content: { icon: 'zap', name: 'Background agent', summary: 'started' },
        timestamp: 0,
      } as ChatItem,
      { id: 'a1', type: 'assistant', content: 'visible text', timestamp: 0 },
    ])
    // system item should render as inline status line
    expect(screen.getByText('Background agent')).toBeTruthy()
    expect(screen.getByText('— started')).toBeTruthy()
    // assistant message also renders
    expect(screen.getByText('visible text')).toBeTruthy()
  })

  it('renders resultText as final MessageBubble when expanded', () => {
    const messages: ChatItem[] = [
      { id: 'a1', type: 'assistant', content: 'Working...', timestamp: 0 },
    ]
    render(
      <SubAgentCard
        {...baseProps}
        status="running"
        subagentMessages={messages}
        resultText="Final result summary"
      />
    )
    expect(screen.getByText('Final result summary')).toBeTruthy()
  })
})

describe('SubAgentCard nested agent status determination', () => {
  function renderExpanded(messages: ChatItem[]) {
    render(
      <SubAgentCard
        {...baseProps}
        status="running"
        subagentMessages={messages}
      />
    )
  }

  it('nested agent shows done when result present', () => {
    renderExpanded([
      {
        id: 'nested-1',
        type: 'tool_use',
        content: { name: 'Agent', input: { prompt: 'do work' }, result: 'completed successfully' },
        timestamp: 0,
        agentId: 'nested-1',
        toolInput: { prompt: 'do work', description: 'Worker' },
      },
    ])
    expect(screen.getByText('done')).toBeTruthy()
  })

  it('nested agent shows error when result has is_error', () => {
    renderExpanded([
      {
        id: 'nested-1',
        type: 'tool_use',
        content: {
          name: 'Agent',
          input: { prompt: 'do work' },
          result: [{ type: 'text', text: 'Error occurred', is_error: true }],
        },
        timestamp: 0,
        agentId: 'nested-1',
        toolInput: { prompt: 'do work', description: 'Worker' },
      },
    ])
    expect(screen.getByText('error')).toBeTruthy()
  })

  it('nested agent shows running when parent is running and no result', () => {
    renderExpanded([
      {
        id: 'nested-1',
        type: 'tool_use',
        content: { name: 'Agent', input: { prompt: 'do work' } },
        timestamp: 0,
        agentId: 'nested-1',
        toolInput: { prompt: 'do work', description: 'Worker' },
      },
    ])
    // Parent is running, nested has no result → running
    // Two 'running' badges: parent + nested
    const badges = screen.getAllByText('running')
    expect(badges.length).toBe(2)
  })

  it('nested agent description fallback to prompt first line when no description', () => {
    renderExpanded([
      {
        id: 'nested-1',
        type: 'tool_use',
        content: { name: 'Agent', input: { prompt: 'Multi\nline\nprompt' } },
        timestamp: 0,
        agentId: 'nested-1',
        toolInput: { prompt: 'Multi\nline\nprompt' },
      },
    ])
    expect(screen.getByText('Multi')).toBeTruthy()
  })

  it('nested agent description fallback to tool name when no description and no prompt', () => {
    renderExpanded([
      {
        id: 'nested-1',
        type: 'tool_use',
        content: { name: 'Agent', input: {} },
        timestamp: 0,
        agentId: 'nested-1',
        toolInput: {},
      },
    ])
    // Final fallback: uses data.name which is 'Agent'
    expect(screen.getByText('Agent')).toBeTruthy()
  })
})

describe('SubAgentCard taskProgress display', () => {
  it('shows token/tool/duration usage in header when taskProgress is provided', () => {
    render(
      <SubAgentCard
        {...baseProps}
        status="running"
        taskProgress={{ tokens: 1500, toolUses: 3, durationMs: 12000 }}
      />
    )
    expect(screen.getByText('1,500 tokens')).toBeTruthy()
    expect(screen.getByText('3 tools')).toBeTruthy()
    expect(screen.getByText('12s')).toBeTruthy()
  })

  it('does not show usage when taskProgress is not provided', () => {
    render(<SubAgentCard {...baseProps} status="running" />)
    expect(screen.queryByText('tokens')).toBeNull()
  })

  it('shows lastToolName when available', () => {
    render(
      <SubAgentCard
        {...baseProps}
        status="running"
        taskProgress={{ tokens: 500, toolUses: 1, durationMs: 3000, lastToolName: 'Bash' }}
      />
    )
    expect(screen.getByText('Bash')).toBeTruthy()
  })
})
