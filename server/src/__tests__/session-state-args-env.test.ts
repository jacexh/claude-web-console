import { describe, it, expect } from 'vitest'
import { SessionManager } from '../session-manager'

/**
 * Bug: After resuming or switching to a session, the AdvancedOptionsDialog
 * shows empty args/env because getSessionState() doesn't include them.
 *
 * getSessionState() should return executableArgs and env from
 * sessionCreationOptions so the client can display them.
 */

const fakeLog = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
  trace: () => {},
  fatal: () => {},
  child: () => fakeLog,
  level: 'silent',
  silent: () => {},
} as never

describe('getSessionState includes executableArgs and env', () => {
  it('returns executableArgs and env for a session with creation options', () => {
    const sm = new SessionManager(fakeLog)

    // Inject creation options via the private map (no public API to set them without creating a real SDK session)
    const opts = (sm as unknown as { sessionCreationOptions: Map<string, unknown> }).sessionCreationOptions
    opts.set('sess-1', {
      executableArgs: ['--verbose', '--debug'],
      env: { API_KEY: 'test-key', NODE_ENV: 'development' },
    })

    const state = sm.getSessionState('sess-1')

    expect(state).toHaveProperty('executableArgs')
    expect(state.executableArgs).toEqual(['--verbose', '--debug'])
    expect(state).toHaveProperty('env')
    expect(state.env).toEqual({ API_KEY: 'test-key', NODE_ENV: 'development' })
  })

  it('returns undefined args/env when session has no creation options', () => {
    const sm = new SessionManager(fakeLog)

    const state = sm.getSessionState('nonexistent')

    expect(state.executableArgs).toBeUndefined()
    expect(state.env).toBeUndefined()
  })
})
