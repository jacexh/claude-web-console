import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SubAgentCard } from '../SubAgentCard'

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
