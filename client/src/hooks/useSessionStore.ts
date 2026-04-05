import { useReducer, useCallback } from 'react'
import type { SessionInfo, ChatItem } from '../types'

interface SessionState {
  sessions: SessionInfo[]
  activeSessionId: string | null
  messagesBySession: Record<string, ChatItem[]>
  historyBySession: Record<string, ChatItem[]>
  loadingBySession: Record<string, boolean>
}

type SessionAction =
  | { type: 'SET_SESSIONS'; sessions: SessionInfo[] }
  | { type: 'SET_ACTIVE'; sessionId: string }
  | { type: 'ADD_SESSION'; sessionId: string }
  | { type: 'ADD_CHAT_ITEM'; sessionId: string; item: ChatItem }
  | { type: 'UPDATE_CHAT_ITEM'; sessionId: string; itemId: string; updates: Partial<ChatItem> }
  | { type: 'SESSION_END'; sessionId: string }
  | { type: 'SET_HISTORY_ITEMS'; sessionId: string; items: ChatItem[] }
  | { type: 'REMAP_SESSION'; tempId: string; sessionId: string }
  | { type: 'SET_LOADING'; sessionId: string; loading: boolean }
  | { type: 'REMOVE_SESSION'; sessionId: string }
  | { type: 'SET_SESSION_STATUS'; sessionId: string; status: 'idle' | 'running' }
  | { type: 'RENAME_SESSION'; sessionId: string; title: string }

function reducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    case 'SET_SESSIONS':
      return { ...state, sessions: action.sessions }

    case 'SET_ACTIVE':
      return { ...state, activeSessionId: action.sessionId }

    case 'ADD_SESSION': {
      const newSession: SessionInfo = {
        sessionId: action.sessionId,
        summary: 'New conversation',
        lastModified: Date.now(),
        status: 'running',
      }
      return {
        ...state,
        sessions: [newSession, ...state.sessions],
        activeSessionId: action.sessionId,
        messagesBySession: { ...state.messagesBySession, [action.sessionId]: [] },
      }
    }

    case 'ADD_CHAT_ITEM': {
      const prev = state.messagesBySession[action.sessionId] ?? []
      return {
        ...state,
        messagesBySession: {
          ...state.messagesBySession,
          [action.sessionId]: [...prev, action.item],
        },
      }
    }

    case 'UPDATE_CHAT_ITEM': {
      const items = state.messagesBySession[action.sessionId]
      if (!items) return state
      return {
        ...state,
        messagesBySession: {
          ...state.messagesBySession,
          [action.sessionId]: items.map((item) => {
            if (item.id !== action.itemId) return item
            const updated = { ...item, ...action.updates }
            // Deep merge content to preserve existing fields (e.g. name, input) when adding result
            if (
              action.updates.content &&
              typeof item.content === 'object' &&
              item.content !== null &&
              typeof action.updates.content === 'object'
            ) {
              updated.content = { ...(item.content as Record<string, unknown>), ...(action.updates.content as Record<string, unknown>) }
            }
            return updated
          }),
        },
      }
    }

    case 'REMAP_SESSION': {
      const { tempId, sessionId } = action
      const newSessions = state.sessions.map((s) =>
        s.sessionId === tempId ? { ...s, sessionId } : s,
      )
      const newMessages = { ...state.messagesBySession }
      if (newMessages[tempId]) {
        newMessages[sessionId] = newMessages[tempId]
        delete newMessages[tempId]
      }
      const newHistory = { ...state.historyBySession }
      if (newHistory[tempId]) {
        newHistory[sessionId] = newHistory[tempId]
        delete newHistory[tempId]
      }
      const newLoading = { ...state.loadingBySession }
      if (tempId in newLoading) {
        newLoading[sessionId] = newLoading[tempId]
        delete newLoading[tempId]
      }
      return {
        ...state,
        sessions: newSessions,
        activeSessionId: state.activeSessionId === tempId ? sessionId : state.activeSessionId,
        messagesBySession: newMessages,
        historyBySession: newHistory,
        loadingBySession: newLoading,
      }
    }

    case 'SET_HISTORY_ITEMS':
      return {
        ...state,
        historyBySession: {
          ...state.historyBySession,
          [action.sessionId]: action.items,
        },
        // Clear live messages when loading a different session's history
        messagesBySession: {
          ...state.messagesBySession,
          [action.sessionId]: [],
        },
      }

    case 'SET_LOADING':
      return {
        ...state,
        loadingBySession: {
          ...state.loadingBySession,
          [action.sessionId]: action.loading,
        },
      }

    case 'SESSION_END': {
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.sessionId === action.sessionId ? { ...s, status: 'idle' as const } : s,
        ),
        loadingBySession: {
          ...state.loadingBySession,
          [action.sessionId]: false,
        },
      }
    }

    case 'REMOVE_SESSION': {
      const newSessions = state.sessions.filter((s) => s.sessionId !== action.sessionId)
      const newMessages = { ...state.messagesBySession }
      delete newMessages[action.sessionId]
      const newHistory = { ...state.historyBySession }
      delete newHistory[action.sessionId]
      const newLoading = { ...state.loadingBySession }
      delete newLoading[action.sessionId]
      return {
        ...state,
        sessions: newSessions,
        activeSessionId: state.activeSessionId === action.sessionId ? null : state.activeSessionId,
        messagesBySession: newMessages,
        historyBySession: newHistory,
        loadingBySession: newLoading,
      }
    }

    case 'SET_SESSION_STATUS': {
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.sessionId === action.sessionId ? { ...s, status: action.status } : s,
        ),
      }
    }

    case 'RENAME_SESSION': {
      return {
        ...state,
        sessions: state.sessions.map((s) =>
          s.sessionId === action.sessionId ? { ...s, summary: action.title } : s,
        ),
      }
    }

    default:
      return state
  }
}

const initialState: SessionState = {
  sessions: [],
  activeSessionId: null,
  messagesBySession: {},
  historyBySession: {},
  loadingBySession: {},
}

export function useSessionStore() {
  const [state, dispatch] = useReducer(reducer, initialState)

  const setSessions = useCallback((sessions: SessionInfo[]) => {
    dispatch({ type: 'SET_SESSIONS', sessions })
  }, [])

  const setActive = useCallback((sessionId: string) => {
    dispatch({ type: 'SET_ACTIVE', sessionId })
  }, [])

  const addSession = useCallback((sessionId: string) => {
    dispatch({ type: 'ADD_SESSION', sessionId })
  }, [])

  const addChatItem = useCallback((sessionId: string, item: ChatItem) => {
    dispatch({ type: 'ADD_CHAT_ITEM', sessionId, item })
  }, [])

  const updateChatItem = useCallback((sessionId: string, itemId: string, updates: Partial<ChatItem>) => {
    dispatch({ type: 'UPDATE_CHAT_ITEM', sessionId, itemId, updates })
  }, [])

  const remapSession = useCallback((tempId: string, sessionId: string) => {
    dispatch({ type: 'REMAP_SESSION', tempId, sessionId })
  }, [])

  const setHistoryItems = useCallback((sessionId: string, items: ChatItem[]) => {
    dispatch({ type: 'SET_HISTORY_ITEMS', sessionId, items })
  }, [])

  const setLoading = useCallback((sessionId: string, loading: boolean) => {
    dispatch({ type: 'SET_LOADING', sessionId, loading })
  }, [])

  const sessionEnd = useCallback((sessionId: string) => {
    dispatch({ type: 'SESSION_END', sessionId })
  }, [])

  const removeSession = useCallback((sessionId: string) => {
    dispatch({ type: 'REMOVE_SESSION', sessionId })
  }, [])

  const setSessionStatus = useCallback((sessionId: string, status: 'idle' | 'running') => {
    dispatch({ type: 'SET_SESSION_STATUS', sessionId, status })
  }, [])

  const renameSession = useCallback((sessionId: string, title: string) => {
    dispatch({ type: 'RENAME_SESSION', sessionId, title })
  }, [])

  return {
    ...state,
    setSessions,
    setActive,
    addSession,
    addChatItem,
    updateChatItem,
    remapSession,
    setHistoryItems,
    setLoading,
    sessionEnd,
    removeSession,
    setSessionStatus,
    renameSession,
  }
}
