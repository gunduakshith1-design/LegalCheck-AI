import React from 'react'

export default function ProcessingSteps({ currentStep = 0 }) {
  const steps = [
    { id: 1, title: 'Image received', description: 'Upload and validation complete' },
    { id: 2, title: 'Image preprocessing', description: 'Enhancing quality and optimizing for OCR' },
    { id: 3, title: 'Reading package text', description: 'Extracting text from packaging' },
    { id: 4, title: 'Identifying declaration fields', description: 'Locating and categorizing product information' },
    { id: 5, title: 'Checking compliance rules', description: 'Evaluating against legal metrology requirements' },
  ]

  return (
    <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-neutral-900 mb-6">Processing Status</h2>
      <div className="space-y-4">
        {steps.map((step, index) => {
          let status = 'pending'
          if (index < currentStep) status = 'completed'
          else if (index === currentStep) status = 'active'

          const statusClasses = status === 'completed' ? 'bg-success-500 text-white' :
            status === 'active' ? 'bg-primary-500 text-white' :
            'bg-neutral-200 text-neutral-500'

          return (
            <div key={step.id} className={`processing-step ${status}`}>              <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-4 ${statusClasses}`}>                {status === 'completed' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : status === 'active' ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                ) : (
                  <div className="w-5 h-5" />
                )}
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-neutral-900">{step.title}</h3>
                <p className="text-xs text-neutral-600 mt-1">{step.description}</p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}