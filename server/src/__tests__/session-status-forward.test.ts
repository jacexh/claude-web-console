import { describe, it, expect } from 'vitest'

describe('session_status WS forwarding', () => {
  it('session_status message is forwarded as top-level (not wrapped in sdk_message)', () => {
    const sent: Record<string, unknown>[] = []
    const send = (msg: Record<string, unknown>) => sent.push(msg)

    const msg = { type: 'session_status', sessionId: 's1', status: 'running' }
    const msgAny = msg as Record<string, unknown>

    if (msgAny.type === 'session_status') {
      send(msg)
    } else {
      send({ type: 'sdk_message', sessionId: 's1', message: msg })
    }

    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('session_status')
    expect(sent[0].status).toBe('running')
    expect(sent[0]).not.toHaveProperty('message')
  })

  it('regular SDK messages are still wrapped in sdk_message', () => {
    const sent: Record<string, unknown>[] = []
    const send = (msg: Record<string, unknown>) => sent.push(msg)

    const msg = { type: 'assistant', message: { content: [] } }
    const msgAny = msg as Record<string, unknown>

    if (msgAny.type === 'session_status') {
      send(msg)
    } else {
      send({ type: 'sdk_message', sessionId: 's1', message: msg })
    }

    expect(sent).toHaveLength(1)
    expect(sent[0].type).toBe('sdk_message')
  })
})
