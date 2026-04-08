import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EventCard } from '../EventCard'

describe('EventCard permission description', () => {
  it('renders description when permission has description', () => {
    render(
      <EventCard
        toolUseId="test-id"
        toolName="Bash"
        input={{ command: 'ls' }}
        permission={{
          status: 'pending',
          title: 'Allow shell access',
          description: 'This tool executes shell commands on your machine',
        }}
        onPermissionDecision={() => {}}
      />
    )
    expect(screen.getByText('This tool executes shell commands on your machine')).toBeTruthy()
  })

  it('does not render description line when description is absent', () => {
    render(
      <EventCard
        toolUseId="test-id"
        toolName="Bash"
        input={{ command: 'ls' }}
        permission={{
          status: 'pending',
          title: 'Allow shell access',
        }}
        onPermissionDecision={() => {}}
      />
    )
    expect(screen.getByText('Allow shell access')).toBeTruthy()
    expect(screen.queryByTestId('permission-description')).toBeNull()
  })
})
