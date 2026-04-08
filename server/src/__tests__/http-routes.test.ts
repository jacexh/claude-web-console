import { describe, it, expect, vi } from 'vitest'
import Fastify from 'fastify'
import { registerHttpRoutes } from '../http-routes'

function mockSessionManager(overrides: Record<string, unknown> = {}) {
  return {
    createSession: vi.fn().mockResolvedValue('pending-123'),
    resumeSession: vi.fn().mockResolvedValue(undefined),
    getSessionStatus: vi.fn().mockReturnValue('idle'),
    ...overrides,
  }
}

describe('POST /api/sessions', () => {
  it('returns 201 with sessionId and idle status', async () => {
    const app = Fastify()
    const sm = mockSessionManager()
    registerHttpRoutes(app, sm as any)
    await app.ready()

    const resp = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { cwd: '/tmp/test' },
    })

    expect(resp.statusCode).toBe(201)
    const body = resp.json()
    expect(body.sessionId).toBe('pending-123')
    expect(body.status).toBe('idle')
    expect(sm.createSession).toHaveBeenCalled()
  })

  it('returns 201 with empty body', async () => {
    const app = Fastify()
    const sm = mockSessionManager()
    registerHttpRoutes(app, sm as any)
    await app.ready()

    const resp = await app.inject({
      method: 'POST',
      url: '/api/sessions',
    })

    expect(resp.statusCode).toBe(201)
    const body = resp.json()
    expect(body.sessionId).toBe('pending-123')
    expect(body.status).toBe('idle')
  })

  it('returns 500 when createSession throws', async () => {
    const app = Fastify()
    const sm = mockSessionManager({
      createSession: vi.fn().mockRejectedValue(new Error('SDK init failed')),
    })
    registerHttpRoutes(app, sm as any)
    await app.ready()

    const resp = await app.inject({
      method: 'POST',
      url: '/api/sessions',
      payload: { cwd: '/tmp/test' },
    })

    expect(resp.statusCode).toBe(500)
  })
})

describe('POST /api/sessions/:id/resume', () => {
  it('returns 200 with sessionId and idle status', async () => {
    const app = Fastify()
    const sm = mockSessionManager()
    registerHttpRoutes(app, sm as any)
    await app.ready()

    const resp = await app.inject({
      method: 'POST',
      url: '/api/sessions/session-abc/resume',
    })

    expect(resp.statusCode).toBe(200)
    const body = resp.json()
    expect(body.sessionId).toBe('session-abc')
    expect(body.status).toBe('idle')
    expect(sm.resumeSession).toHaveBeenCalledWith('session-abc')
  })

  it('returns 409 when session is already running', async () => {
    const app = Fastify()
    const sm = mockSessionManager({
      resumeSession: vi.fn().mockRejectedValue(new Error('Session is already running in this server')),
    })
    registerHttpRoutes(app, sm as any)
    await app.ready()

    const resp = await app.inject({
      method: 'POST',
      url: '/api/sessions/session-abc/resume',
    })

    expect(resp.statusCode).toBe(409)
    const body = resp.json()
    expect(body.error).toBe('Session is already running in this server')
  })
})
