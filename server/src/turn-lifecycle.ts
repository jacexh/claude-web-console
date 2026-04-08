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
