import React, { useState, useEffect, useRef } from 'react'
import { CheckCircle, Loader2, AlertCircle } from 'lucide-react'

/**
 * ScanProcessingPanel — shows honest processing stages during scan analysis.
 *
 * Since the backend does everything in a single POST request, stages are
 * estimated based on elapsed time. Each stage represents real work the
 * server is doing. The final stage completes when the response arrives.
 *
 * Props:
 * - imageLabels: string[] (e.g. ['Front', 'Back'] or ['Front', 'Back', 'Side'])
 * - active: boolean (true while the API call is in flight)
 * - error: string | null (error message if the scan failed)
 * - onRetry: () => void (callback to retry the scan)
 */

const STAGES = [
  { id: 'upload', label: 'Uploading images', minMs: 0 },
  { id: 'ocr', label: 'Reading label text', minMs: 2000 },
  { id: 'combine', label: 'Combining extracted information', minMs: 5000 },
  { id: 'rules', label: 'Checking Legal Metrology requirements', minMs: 8000 },
  { id: 'score', label: 'Calculating screening score', minMs: 11000 },
  { id: 'prepare', label: 'Preparing result', minMs: 14000 },
]

export default function ScanProcessingPanel({ imageLabels = [], active, error, onRetry }) {
  const [currentStageIdx, setCurrentStageIdx] = useState(0)
  const [completedStages, setCompletedStages] = useState([])
  const startTimeRef = useRef(Date.now())
  const intervalRef = useRef(null)

  // Image description
  const imageCount = imageLabels.length
  const imageDesc = imageCount === 1
    ? imageLabels[0]
    : imageLabels.join(' + ')

  // Reset on new scan
  useEffect(() => {
    if (active) {
      startTimeRef.current = Date.now()
      setCurrentStageIdx(0)
      setCompletedStages([])
    }
  }, [active])

  // Advance stages based on elapsed time
  useEffect(() => {
    if (!active) {
      if (intervalRef.current) clearInterval(intervalRef.current)
      return
    }

    intervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current
      let newIdx = 0
      for (let i = STAGES.length - 1; i >= 0; i--) {
        if (elapsed >= STAGES[i].minMs) {
          newIdx = i
          break
        }
      }
      setCurrentStageIdx(prev => {
        if (prev !== newIdx) {
          // Mark previous stage as completed
          if (newIdx > prev) {
            setCompletedStages(c => {
              const updated = [...c]
              for (let i = prev; i < newIdx; i++) {
                updated.push(STAGES[i].id)
              }
              return updated
            })
          }
          return newIdx
        }
        return prev
      })
    }, 500)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [active])

  // When processing ends (active becomes false), mark all as completed
  useEffect(() => {
    if (!active && !error) {
      setCompletedStages(STAGES.map(s => s.id))
    }
  }, [active, error])

  if (!active && !error) return null

  return (
    <div
      className="bg-primary-50 border border-primary-200 rounded-lg p-4 sm:p-5"
      role="status"
      aria-live="polite"
      aria-busy={active}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {active ? (
          <Loader2 className="h-5 w-5 text-primary-600 animate-spin flex-shrink-0" />
        ) : error ? (
          <AlertCircle className="h-5 w-5 text-danger-600 flex-shrink-0" />
        ) : (
          <CheckCircle className="h-5 w-5 text-success-600 flex-shrink-0" />
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-primary-900">
            {error ? 'Scan Failed' : active ? 'Analyzing Product' : 'Analysis Complete'}
          </p>
          <p className="text-xs text-primary-700 mt-0.5">
            Analyzing {imageCount} image{imageCount !== 1 ? 's' : ''} — {imageDesc}
          </p>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-danger-50 border border-danger-200">
          <p className="text-sm text-danger-700">{error}</p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 px-4 py-1.5 bg-danger-600 text-white text-sm font-medium rounded-lg hover:bg-danger-700 flex items-center gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry Scan
            </button>
          )}
        </div>
      )}

      {/* Stage list */}
      {!error && (
        <div className="space-y-2">
          {STAGES.map((stage, idx) => {
            const isCompleted = completedStages.includes(stage.id)
            const isCurrent = active && idx === currentStageIdx && !isCompleted
            const isPending = active && idx > currentStageIdx && !isCompleted
            const isFuture = !active && !isCompleted

            return (
              <div key={stage.id} className="flex items-center gap-2.5">
                {/* Status icon */}
                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                  {isCompleted ? (
                    <CheckCircle className="h-4 w-4 text-success-600" />
                  ) : isCurrent ? (
                    <Loader2 className="h-4 w-4 text-primary-600 animate-spin" />
                  ) : isPending ? (
                    <div className="w-3 h-3 rounded-full border-2 border-primary-200" />
                  ) : (
                    <div className="w-3 h-3 rounded-full border-2 border-neutral-200" />
                  )}
                </div>

                {/* Label */}
                <span className={`text-sm ${
                  isCompleted ? 'text-success-700 font-medium' :
                  isCurrent ? 'text-primary-800 font-medium' :
                  'text-neutral-400'
                }`}>
                  {stage.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
