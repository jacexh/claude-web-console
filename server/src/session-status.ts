export type SessionStatus = 'idle' | 'running' | 'stopped'

export class SessionStatusTracker {
  private map = new Map<string, SessionStatus>()
  private onChange?: (sessionId: string, status: SessionStatus) => void

  constructor(onChange?: (sessionId: string, status: SessionStatus) => void) {
    this.onChange = onChange
  }

  get(sessionId: string): SessionStatus {
    return this.map.get(sessionId) ?? 'stopped'
  }

  set(sessionId: string, status: SessionStatus): void {
    const prev = this.map.get(sessionId)
    this.map.set(sessionId, status)
    if (prev !== status && this.onChange) {
      this.onChange(sessionId, status)
    }
  }

  delete(sessionId: string): void {
    this.map.delete(sessionId)
  }

  getAll(): Map<string, SessionStatus> {
    return new Map(this.map)
  }
}
