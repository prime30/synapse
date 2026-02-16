'use client'

import { useState, useCallback, useRef } from 'react'

type GitStatus = 'idle' | 'committing' | 'pushing' | 'pulling' | 'fetching' | 'loading'

interface BranchInfo {
  branches: string[]
  current: string
}

interface FileStatus {
  path: string
  status: string
}

interface CommitAuthor {
  name: string
  email: string
  timestamp: number
}

interface CommitLogEntry {
  sha: string
  message: string
  author: CommitAuthor
  parent: string[]
}

interface RemoteInfo {
  remote: string
  url: string
}

export function useGitSync(projectId: string) {
  const [status, setStatus] = useState<GitStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [branches, setBranches] = useState<BranchInfo | null>(null)
  const [fileStatuses, setFileStatuses] = useState<FileStatus[] | null>(null)
  const [commitLog, setCommitLog] = useState<CommitLogEntry[] | null>(null)
  const [remotes, setRemotes] = useState<RemoteInfo[] | null>(null)
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null)

  const operationLockRef = useRef<boolean>(false)

  const executeOperation = useCallback(
    async <T,>(
      operation: () => Promise<T>,
      statusValue: GitStatus
    ): Promise<T | null> => {
      if (operationLockRef.current) {
        setError('Another operation is already in progress')
        return null
      }

      try {
        operationLockRef.current = true
        setStatus(statusValue)
        setError(null)

        const result = await operation()
        setStatus('idle')
        setLastSyncAt(new Date())
        return result
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred'
        setError(errorMessage)
        setStatus('idle')
        return null
      } finally {
        operationLockRef.current = false
      }
    },
    []
  )

  const refreshStatus = useCallback(async (): Promise<void> => {
    await executeOperation(async () => {
      const response = await fetch(`/api/projects/${projectId}/git/status`)
      if (!response.ok) {
        throw new Error(`Failed to refresh status: ${response.statusText}`)
      }
      const data = await response.json()
      setFileStatuses(data.files || [])
    }, 'fetching')
  }, [projectId, executeOperation])

  const refreshBranches = useCallback(async (): Promise<void> => {
    await executeOperation(async () => {
      const response = await fetch(`/api/projects/${projectId}/git/branches`)
      if (!response.ok) {
        throw new Error(`Failed to refresh branches: ${response.statusText}`)
      }
      const data = await response.json()
      setBranches(data)
    }, 'fetching')
  }, [projectId, executeOperation])

  const refreshLog = useCallback(
    async (depth?: number): Promise<void> => {
      await executeOperation(async () => {
        const params = depth ? `?depth=${depth}` : ''
        const response = await fetch(`/api/projects/${projectId}/git/log${params}`)
        if (!response.ok) {
          throw new Error(`Failed to refresh log: ${response.statusText}`)
        }
        const data = await response.json()
        setCommitLog(data.commits || [])
      }, 'fetching')
    },
    [projectId, executeOperation]
  )

  const commit = useCallback(
    async (message: string, files?: string[]): Promise<string | null> => {
      return await executeOperation(async () => {
        const response = await fetch(`/api/projects/${projectId}/git/commit`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message, files }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to commit: ${response.statusText}`)
        }

        const data = await response.json()
        const sha = data.sha

        // Refresh status and log after commit
        await Promise.all([refreshStatus(), refreshLog()])

        return sha
      }, 'committing')
    },
    [projectId, executeOperation, refreshStatus, refreshLog]
  )

  const createBranch = useCallback(
    async (name: string, startPoint?: string): Promise<void> => {
      await executeOperation(async () => {
        const response = await fetch(`/api/projects/${projectId}/git/branches`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name, startPoint }),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to create branch: ${response.statusText}`)
        }

        // Refresh branches after creation
        await refreshBranches()
      }, 'loading')
    },
    [projectId, executeOperation, refreshBranches]
  )

  const push = useCallback(
    async (options?: {
      remoteName?: string
      branch?: string
      token: string
      force?: boolean
    }): Promise<boolean> => {
      const result = await executeOperation(async () => {
        const response = await fetch(`/api/projects/${projectId}/git/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(options || {}),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to push: ${response.statusText}`)
        }

        return true
      }, 'pushing')

      return result === true
    },
    [projectId, executeOperation]
  )

  const pull = useCallback(
    async (options?: {
      token?: string
      remoteName?: string
      branch?: string
    }): Promise<{ ok: boolean; conflicts?: string[] }> => {
      const result = await executeOperation(async () => {
        const response = await fetch(`/api/projects/${projectId}/git/pull`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(options ?? {}),
        })

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error || `Failed to pull: ${response.statusText}`)
        }

        const data = await response.json()
        return {
          ok: data.ok !== false,
          conflicts: data.conflicts,
        }
      }, 'pulling')

      return result || { ok: false }
    },
    [projectId, executeOperation]
  )

  const initRepo = useCallback(async (): Promise<void> => {
    await executeOperation(async () => {
      const response = await fetch(`/api/projects/${projectId}/git/init`, {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to initialize repo: ${response.statusText}`)
      }
    }, 'loading')
  }, [projectId, executeOperation])

  return {
    status,
    error,
    branches,
    fileStatuses,
    commitLog,
    remotes,
    lastSyncAt,
    refreshStatus,
    refreshBranches,
    refreshLog,
    commit,
    createBranch,
    push,
    pull,
    initRepo,
  }
}
