import React from 'react'
import ComplianceBadge from './ComplianceBadge'

export default function ComplianceField({ field, value, status, confidence, evidence }) {
  const getStatusColor = () => {
    switch (status) {
      case 'PASS':
        return 'text-success-700 bg-success-50 border-success-200'
      case 'WARNING':
        return 'text-warning-700 bg-warning-50 border-warning-200'
      case 'VIOLATION':
        return 'text-danger-700 bg-danger-50 border-danger-200'
      default:
        return 'text-neutral-700 bg-neutral-50 border-neutral-200'
    }
  }

  return (
    <div className={`border rounded-lg p-4 transition-colors min-w-0 overflow-wrap-anywhere ${getStatusColor()}`}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="font-medium text-neutral-900 min-w-0 truncate">{field}</h3>
        <ComplianceBadge status={status}>{status}</ComplianceBadge>
      </div>

      <div className="space-y-2 min-w-0">
        <p className="text-sm text-neutral-800 break-words">
          <strong>Value:</strong> {value}
        </p>
        {confidence && (
          <p className="text-xs text-neutral-600">
            <strong>Confidence:</strong> {confidence}%
          </p>
        )}
        {evidence && (
          <div className="mt-2">
            <p className="text-xs text-neutral-600 font-medium">Evidence:</p>
            <p className="text-xs text-neutral-700 italic break-words">{evidence}</p>
          </div>
        )}
      </div>
    </div>
  )
}