import type { SDKSession } from '@anthropic-ai/claude-agent-sdk'

/**
 * Polls session.sessionId until the SDK resolves the real ID.
 * The SDK sets sessionId asynchronously after process init.
 */
export function waitForSessionId(session: SDKSession, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      clearInterval(poll)
      reject(new Error('Session init timed out'))
    }, timeoutMs)

    const poll = setInterval(() => {
      try {
        const id = session.sessionId
        if (id && !id.startsWith('pending-')) {
          clearInterval(poll)
          clearTimeout(timeout)
          resolve(id)
        }
      } catch {
        // sessionId not ready yet, keep polling
      }
    }, 50)

    // Check immediately (no need to wait 50ms if already ready)
    try {
      const id = session.sessionId
      if (id && !id.startsWith('pending-')) {
        clearInterval(poll)
        clearTimeout(timeout)
        resolve(id)
      }
    } catch {
      // not ready, poll will handle it
    }
  })
}
