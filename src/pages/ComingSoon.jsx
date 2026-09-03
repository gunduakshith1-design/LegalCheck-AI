import React from 'react'
import { Construction } from 'lucide-react'

export default function ComingSoon({ title = 'Coming Soon', description = 'This feature is under development and will be available in a future update.' }) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="w-16 h-16 rounded-2xl bg-neutral-100 flex items-center justify-center mb-4">
        <Construction className="h-8 w-8 text-neutral-400" />
      </div>
      <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
      <p className="text-neutral-500 text-sm mt-1 text-center max-w-sm">{description}</p>
    </div>
  )
}
