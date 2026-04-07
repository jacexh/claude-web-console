import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SubAgentCard } from '../SubAgentCard'

const baseProps = {
  agentId: 'agent-1',
  sessionId: 'session-1',
  description: 'Analyzing code',
  status: 'running' as const,
  onExpand: vi.fn(),
}

describe('SubAgentCard with background task', () => {
  it('renders task progress when taskProgress is provided', () => {
    render(
      <SubAgentCard
        {...baseProps}
        taskProgress={{ tokens: 2500, toolUses: 5, durationMs: 30000, lastToolName: 'Read', description: 'Reading files' }}
      />,
    )
    expect(screen.getByText(/2,?500/)).toBeTruthy()
    expect(screen.getByText(/5 tools/)).toBeTruthy()
    expect(screen.getByText(/30s/)).toBeTruthy()
    expect(screen.getByText('Read')).toBeTruthy()
  })

  it('shows stop button when taskStatus is running', () => {
    const onStopTask = vi.fn()
    render(
      <SubAgentCard
        {...baseProps}
        taskId="task-1"
        taskStatus="running"
        onStopTask={onStopTask}
      />,
    )
    const stopBtn = screen.getByRole('button', { name: /stop/i })
    expect(stopBtn).toBeTruthy()
    fireEvent.click(stopBtn)
    expect(onStopTask).toHaveBeenCalledWith('session-1', 'task-1')
  })

  it('hides stop button when taskStatus is completed', () => {
    render(
      <SubAgentCard
        {...baseProps}
        taskId="task-1"
        taskStatus="completed"
        status="done"
      />,
    )
    expect(screen.queryByRole('button', { name: /stop/i })).toBeNull()
  })

  it('maps taskStatus to SubAgentCard status correctly', () => {
    const { rerender } = render(
      <SubAgentCard {...baseProps} taskStatus="failed" status="error" />,
    )
    expect(screen.getByText('error')).toBeTruthy()

    rerender(
      <SubAgentCard {...baseProps} taskStatus="stopped" status="error" />,
    )
    expect(screen.getByText('error')).toBeTruthy()
  })
})
