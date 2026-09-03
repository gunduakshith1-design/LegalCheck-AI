import React from 'react'

export default function ComplianceBadge({ status, children }) {
  const getBadgeClasses = () => {
    switch (status) {
      case 'PASS':
        return 'bg-success-100 text-success-800 border-success-200'
      case 'WARNING':
        return 'bg-warning-100 text-warning-800 border-warning-200'
      case 'VIOLATION':
        return 'bg-danger-100 text-danger-800 border-danger-200'
      default:
        return 'bg-neutral-100 text-neutral-800 border-neutral-200'
    }
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-sm font-medium border ${getBadgeClasses()}`}>
      {children}
    </span>
  )
}