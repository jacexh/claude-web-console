import Fastify from 'fastify'
import websocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import { SessionManager } from './session-manager.js'
import { createWsHandler } from './ws-handler.js'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

async function main(): Promise<void> {
  const app = Fastify({ logger: true })

  await app.register(websocket)

  // Serve built client in production
  const clientDist = path.resolve(__dirname, '../../client/dist')
  await app.register(fastifyStatic, {
    root: clientDist,
    prefix: '/',
    wildcard: false,
    decorateReply: false,
  })

  const sessionManager = new SessionManager()
  const wsHandler = createWsHandler(sessionManager)

  app.get('/ws', { websocket: true }, (socket) => {
    wsHandler(socket)
  })

  // SPA fallback
  app.setNotFoundHandler((_req, reply) => {
    reply.sendFile('index.html')
  })

  // Graceful shutdown: close all SDK processes before exit
  function shutdown() {
    console.log('[Server] Shutting down, closing all sessions...')
    sessionManager.closeAll()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)

  const port = parseInt(process.env.PORT ?? '3000', 10)
  const host = process.env.HOST ?? '0.0.0.0'
  await app.listen({ port, host })
  console.log(`CC Web Console server running on http://localhost:${port}`)
}

main().catch(console.error)
