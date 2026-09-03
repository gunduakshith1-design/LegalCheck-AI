import React from 'react'
import {
  BarChart3, Target, CheckCircle, AlertTriangle,
  Store, Eye, Shield, Package, ScanLine, FileText,
} from 'lucide-react'
import SpotlightCard from './SpotlightCard'
import CountUp from './CountUp'

const ICON_MAP = {
  scan: ScanLine,
  score: Target,
  pass: CheckCircle,
  warn: AlertTriangle,
  store: Store,
  review: Eye,
  shield: Shield,
  package: Package,
  report: FileText,
}

export default function StatCard({ title, value, icon, color = 'primary' }) {
  const colorClasses = {
    primary: 'bg-primary-50 text-primary-600',
    success: 'bg-success-50 text-success-600',
    warning: 'bg-warning-50 text-warning-600',
    neutral: 'bg-neutral-100 text-neutral-600',
  }

  const IconComponent = ICON_MAP[icon]

  return (
    <SpotlightCard className="p-5" spotlightColor="rgba(0, 100, 255, 0.05)">
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${colorClasses[color] || colorClasses.neutral}`}>
          {IconComponent ? (
            <IconComponent className="h-5 w-5" />
          ) : (
            <span className="text-lg">{icon}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-neutral-500 truncate">{title}</p>
          <p className="text-2xl font-semibold text-neutral-900">
            {typeof value === 'number' ? (
              <CountUp to={value} duration={1} separator="," />
            ) : (
              value
            )}
          </p>
        </div>
      </div>
    </SpotlightCard>
  )
}
