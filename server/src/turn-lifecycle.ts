export interface TurnState {
  turnStarted: boolean
}

/** Returns true (and flips the flag) on the first call per turn. */
export function shouldBroadcastTurnStarted(state: TurnState): boolean {
  if (state.turnStarted) return false
  state.turnStarted = true
  return true
}

/** Returns true if status should be reset to idle when a stream ends without a result. */
export function shouldResetToIdleOnStreamEnd(currentStatus: string): boolean {
  return currentStatus === 'running'
}

/** Returns true if this SDK message is part of an active turn (not session init). */
export function isTurnMessage(msg: Record<string, unknown>): boolean {
  if (msg.type === 'system' && msg.subtype === 'init') return false
  return true
}
