import { describe, it, expect, vi } from 'vitest'

describe('SessionManager.stopTask', () => {
  it('calls session.stopTask with the taskId', async () => {
    const mockStopTask = vi.fn().mockResolvedValue(undefined)
    const mockSession = { stopTask: mockStopTask }

    const sessions = new Map<string, { stopTask: (id: string) => Promise<void> }>()
    sessions.set('session-1', mockSession)

    async function stopTask(sessionId: string, taskId: string) {
      const session = sessions.get(sessionId)
      if (!session) throw new Error(`Session ${sessionId} not found`)
      await session.stopTask(taskId)
    }

    await stopTask('session-1', 'task-abc')
    expect(mockStopTask).toHaveBeenCalledWith('task-abc')
  })

  it('throws when session not found', async () => {
    const sessions = new Map<string, { stopTask: (id: string) => Promise<void> }>()

    async function stopTask(sessionId: string, taskId: string) {
      const session = sessions.get(sessionId)
      if (!session) throw new Error(`Session ${sessionId} not found`)
      await session.stopTask(taskId)
    }

    await expect(stopTask('nonexistent', 'task-abc')).rejects.toThrow('Session nonexistent not found')
  })
})
