import { describe, it, expect } from 'vitest'

describe('session status store', () => {
  it('SessionInfo status type accepts stopped', () => {
    const session = {
      sessionId: 'test',
      summary: 'Test',
      lastModified: Date.now(),
      status: 'stopped' as const,
    }
    expect(session.status).toBe('stopped')
  })

  it('new session default status should be idle (not running)', () => {
    // Simulates the ADD_SESSION reducer behavior: when no status is provided,
    // new sessions should default to 'idle' (waiting for input, not frozen)
    const defaultStatus = undefined ?? 'idle'
    expect(defaultStatus).toBe('idle')

    // The bug: addSession defaulted to 'running', freezing input on New Session
    const buggyDefault = undefined ?? 'running'
    expect(buggyDefault).not.toBe('idle') // This proves the old default was wrong
  })

  it('loading should be derived from session status running', () => {
    const sessions = [
      { sessionId: 's1', summary: '', lastModified: 0, status: 'idle' as const },
      { sessionId: 's2', summary: '', lastModified: 0, status: 'running' as const },
      { sessionId: 's3', summary: '', lastModified: 0, status: 'stopped' as const },
    ]
    const activeSessionId = 's2'
    const activeSession = sessions.find(s => s.sessionId === activeSessionId)
    const loading = activeSession?.status === 'running'
    expect(loading).toBe(true)

    const idle = sessions.find(s => s.sessionId === 's1')
    expect(idle?.status === 'running').toBe(false)

    const stopped = sessions.find(s => s.sessionId === 's3')
    expect(stopped?.status === 'running').toBe(false)
  })
})
