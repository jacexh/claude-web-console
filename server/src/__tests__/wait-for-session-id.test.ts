import { describe, it, expect, vi } from 'vitest'
import { waitForSessionId } from '../session-id-resolver'

describe('waitForSessionId', () => {
  it('resolves when session.sessionId becomes available', async () => {
    let ready = false
    const session = {
      get sessionId() {
        if (!ready) throw new Error('not ready')
        return 'real-session-id'
      },
    }

    // Simulate SDK resolving sessionId after 100ms
    setTimeout(() => { ready = true }, 100)

    const result = await waitForSessionId(session as any, 5000)
    expect(result).toBe('real-session-id')
  })

  it('resolves immediately when sessionId is already available', async () => {
    const session = { sessionId: 'already-ready' }
    const result = await waitForSessionId(session as any, 5000)
    expect(result).toBe('already-ready')
  })

  it('rejects on timeout if sessionId never becomes available', async () => {
    const session = {
      get sessionId(): string { throw new Error('not ready') },
    }

    await expect(waitForSessionId(session as any, 200)).rejects.toThrow('Session init timed out')
  })

  it('ignores pending- prefixed session IDs', async () => {
    let callCount = 0
    const session = {
      get sessionId() {
        callCount++
        if (callCount < 3) return 'pending-123'
        return 'real-id'
      },
    }

    const result = await waitForSessionId(session as any, 5000)
    expect(result).toBe('real-id')
  })
})
