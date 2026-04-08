import { describe, it, expect } from 'vitest'

/**
 * Tests for the turn_started broadcast logic.
 *
 * In consumeStream, each call to stream() represents a turn.
 * shouldBroadcastTurnStarted gates two side-effects on the first SDK message
 * of each turn: broadcasting { type: 'turn_started' } and emitting a
 * session_status: running update so clients know the session is active.
 *
 * We extract the logic into a pure function so it can be tested
 * without mocking the full SessionManager.
 */
import { shouldBroadcastTurnStarted, shouldResetToIdleOnStreamEnd, isTurnMessage } from '../turn-lifecycle'

describe('shouldBroadcastTurnStarted', () => {
  it('returns true for the first message of a turn', () => {
    const state = { turnStarted: false }
    expect(shouldBroadcastTurnStarted(state)).toBe(true)
    expect(state.turnStarted).toBe(true)
  })

  it('returns false for subsequent messages in the same turn', () => {
    const state = { turnStarted: true }
    expect(shouldBroadcastTurnStarted(state)).toBe(false)
  })

  it('returns true again after reset (new turn)', () => {
    const state = { turnStarted: true }
    state.turnStarted = false // simulate reset between turns
    expect(shouldBroadcastTurnStarted(state)).toBe(true)
    expect(state.turnStarted).toBe(true)
  })

  it('handles a sequence of multiple turns', () => {
    const state = { turnStarted: false }

    // Turn 1: first message
    expect(shouldBroadcastTurnStarted(state)).toBe(true)
    // Turn 1: second message
    expect(shouldBroadcastTurnStarted(state)).toBe(false)
    // Turn 1: third message
    expect(shouldBroadcastTurnStarted(state)).toBe(false)

    // Reset for turn 2
    state.turnStarted = false

    // Turn 2: first message
    expect(shouldBroadcastTurnStarted(state)).toBe(true)
    // Turn 2: second message
    expect(shouldBroadcastTurnStarted(state)).toBe(false)
  })
})

describe('shouldResetToIdleOnStreamEnd', () => {
  it('returns true when current status is running (stream ended without result)', () => {
    expect(shouldResetToIdleOnStreamEnd('running')).toBe(true)
  })

  it('returns false when current status is idle (result already set idle)', () => {
    expect(shouldResetToIdleOnStreamEnd('idle')).toBe(false)
  })

  it('returns false when current status is stopped (session closed)', () => {
    expect(shouldResetToIdleOnStreamEnd('stopped')).toBe(false)
  })
})

describe('isTurnMessage', () => {
  it('returns false for system/init (session initialization, not a turn)', () => {
    expect(isTurnMessage({ type: 'system', subtype: 'init' })).toBe(false)
  })

  it('returns true for assistant messages (agent generating)', () => {
    expect(isTurnMessage({ type: 'assistant' })).toBe(true)
  })

  it('returns true for user messages (tool results)', () => {
    expect(isTurnMessage({ type: 'user' })).toBe(true)
  })

  it('returns true for result messages (turn complete)', () => {
    expect(isTurnMessage({ type: 'result' })).toBe(true)
  })

  it('returns true for system/task_started', () => {
    expect(isTurnMessage({ type: 'system', subtype: 'task_started' })).toBe(true)
  })

  it('returns true for system/task_progress', () => {
    expect(isTurnMessage({ type: 'system', subtype: 'task_progress' })).toBe(true)
  })

  it('returns true for system/task_notification', () => {
    expect(isTurnMessage({ type: 'system', subtype: 'task_notification' })).toBe(true)
  })

  it('returns false for system/init even with extra fields', () => {
    expect(isTurnMessage({ type: 'system', subtype: 'init', model: 'claude-sonnet' })).toBe(false)
  })
})
