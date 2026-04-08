import type { FastifyInstance } from 'fastify'
import type { SessionManager } from './session-manager.js'
import { mkdir } from 'node:fs/promises'

export function registerHttpRoutes(app: FastifyInstance, sessionManager: SessionManager): void {
  app.post('/api/sessions', async (request, reply) => {
    const body = request.body as {
      cwd?: string
      model?: string
      permissionMode?: string
      executableArgs?: string[]
      env?: Record<string, string>
    } | null

    const cwd = body?.cwd
    if (cwd) {
      await mkdir(cwd, { recursive: true })
    }

    const sessionId = await sessionManager.createSession(body ?? undefined)
    const status = sessionManager.getSessionStatus(sessionId)

    reply.code(201).send({ sessionId, status })
  })

  app.post<{ Params: { id: string } }>('/api/sessions/:id/resume', async (request, reply) => {
    const sessionId = request.params.id
    try {
      await sessionManager.resumeSession(sessionId)
      const status = sessionManager.getSessionStatus(sessionId)
      reply.send({ sessionId, status })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      reply.code(409).send({ error: message })
    }
  })
}
