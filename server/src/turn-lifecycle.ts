export interface TurnState {
  turnStarted: boolean
}

/** Returns true (and flips the flag) on the first call per turn. */
export function shouldBroadcastTurnStarted(state: TurnState): boolean {
  if (state.turnStarted) return false
  state.turnStarted = true
  return true
}
