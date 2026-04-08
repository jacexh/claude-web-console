import { describe, it, expect, vi } from 'vitest'
import { SessionStatusTracker } from '../session-status'

describe('SessionStatusTracker', () => {
  it('returns stopped for unknown sessions', () => {
    const tracker = new SessionStatusTracker()
    expect(tracker.get('unknown')).toBe('stopped')
  })

  it('set idle on create', () => {
    const tracker = new SessionStatusTracker()
    tracker.set('s1', 'idle')
    expect(tracker.get('s1')).toBe('idle')
  })

  it('set running on turn start', () => {
    const tracker = new SessionStatusTracker()
    tracker.set('s1', 'idle')
    tracker.set('s1', 'running')
    expect(tracker.get('s1')).toBe('running')
  })

  it('set idle on result (turn end)', () => {
    const tracker = new SessionStatusTracker()
    tracker.set('s1', 'running')
    tracker.set('s1', 'idle')
    expect(tracker.get('s1')).toBe('idle')
  })

  it('set stopped on close/crash', () => {
    const tracker = new SessionStatusTracker()
    tracker.set('s1', 'running')
    tracker.set('s1', 'stopped')
    expect(tracker.get('s1')).toBe('stopped')
  })

  it('getAll returns all tracked sessions', () => {
    const tracker = new SessionStatusTracker()
    tracker.set('s1', 'idle')
    tracker.set('s2', 'running')
    tracker.set('s3', 'stopped')
    expect(tracker.getAll()).toEqual(
      new Map([['s1', 'idle'], ['s2', 'running'], ['s3', 'stopped']])
    )
  })

  it('calls onChange callback when status changes', () => {
    const onChange = vi.fn()
    const tracker = new SessionStatusTracker(onChange)
    tracker.set('s1', 'idle')
    expect(onChange).toHaveBeenCalledWith('s1', 'idle')
    tracker.set('s1', 'running')
    expect(onChange).toHaveBeenCalledWith('s1', 'running')
  })

  it('does not call onChange when status is the same', () => {
    const onChange = vi.fn()
    const tracker = new SessionStatusTracker(onChange)
    tracker.set('s1', 'idle')
    onChange.mockClear()
    tracker.set('s1', 'idle')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('delete removes session from tracker', () => {
    const tracker = new SessionStatusTracker()
    tracker.set('s1', 'idle')
    tracker.delete('s1')
    expect(tracker.get('s1')).toBe('stopped')
  })
})
