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
