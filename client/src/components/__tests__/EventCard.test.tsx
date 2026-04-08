import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
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

describe('EventCard tool result display hint', () => {
  it('shows "Result omitted" label when display is omitted', () => {
    render(
      <EventCard
        toolName="Bash"
        input={{ command: 'ls' }}
        result="file1.txt\nfile2.txt"
        display="omitted"
        defaultCollapsed={false}
      />
    )
    expect(screen.getByText('Result omitted')).toBeTruthy()
  })

  it('shows "Result summarized" label when display is summarized', () => {
    render(
      <EventCard
        toolName="Bash"
        input={{ command: 'ls' }}
        result="file1.txt\nfile2.txt"
        display="summarized"
        defaultCollapsed={false}
      />
    )
    expect(screen.getByText('Result summarized')).toBeTruthy()
  })

  it('expands to show result after clicking the label', () => {
    render(
      <EventCard
        toolName="Bash"
        input={{ command: 'ls' }}
        result="file1.txt"
        display="omitted"
        defaultCollapsed={false}
      />
    )
    expect(screen.queryByText(/file1\.txt/)).toBeNull()
    fireEvent.click(screen.getByText('Result omitted'))
    expect(screen.getByText(/file1\.txt/)).toBeTruthy()
  })

  it('renders result normally when display is undefined', () => {
    render(
      <EventCard
        toolName="Bash"
        input={{ command: 'ls' }}
        result="file1.txt"
        defaultCollapsed={false}
      />
    )
    expect(screen.getByText(/file1\.txt/)).toBeTruthy()
    expect(screen.queryByText('Result omitted')).toBeNull()
    expect(screen.queryByText('Result summarized')).toBeNull()
  })
})
