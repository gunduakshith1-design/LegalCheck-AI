import React, { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import ProcessingSteps from '../components/ProcessingSteps'
import { useScanStore } from '../store/scanStore'

export default function Processing() {
  const [currentStep, setCurrentStep] = useState(0)
  const [processingComplete, setProcessingComplete] = useState(false)
  const [error, setError] = useState(null)
  const [ocrResult, setOcrResult] = useState(null)
  const navigate = useNavigate()
  const scanStore = useScanStore()
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const pendingImageName = sessionStorage.getItem('pendingScanImageName')
    const pendingImageUrl = sessionStorage.getItem('pendingScanImageUrl')

    if (!pendingImageName && !pendingImageUrl) {
      setError('No pending scan found. Please upload an image first.')
      setCurrentStep(5)
      setProcessingComplete(true)
      return
    }

    // Simulate progressive steps while the real backend processes
    const timers = []
    timers.push(setTimeout(() => setCurrentStep(1), 400))
    timers.push(setTimeout(() => setCurrentStep(2), 1200))
    timers.push(setTimeout(() => setCurrentStep(3), 2500))

    // Call the real backend
    const processImage = async () => {
      try {
        // Fetch the image from the blob URL if available
        let imageBlob
        if (pendingImageUrl && pendingImageUrl.startsWith('blob:')) {
          const resp = await fetch(pendingImageUrl)
          imageBlob = await resp.blob()
        }

        const formData = new FormData()

        if (imageBlob) {
          formData.append('file', imageBlob, pendingImageName || 'image.png')
        } else {
          // If we don't have the blob, navigate back
          throw new Error('Image data is no longer available. Please scan again.')
        }

        formData.append('preprocessing', 'standard')

        const response = await fetch('/api/ocr', {
          method: 'POST',
          body: formData,
        })

        const data = await response.json()

        if (!response.ok) {
          throw new Error(data.detail?.error || 'OCR processing failed')
        }

        setCurrentStep(4)

        // Store result in session for Result page
        const scanRecord = {
          id: `scan-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          productName: data.lines.length > 0 ? data.lines[0].text : pendingImageName || 'Unknown Product',
          timestamp: new Date().toISOString(),
          status: 'PENDING',
          issueCount: 0,
          ocrData: data,
          imageUrl: pendingImageUrl || null,
        }

        // Add to scan store
        scanStore.addScan(scanRecord)
        sessionStorage.setItem('lastScanId', scanRecord.id)

        setCurrentStep(5)
        setProcessingComplete(true)
        setOcrResult(data)
      } catch (err) {
        console.error('Processing error:', err)
        setError(err.message || 'An unexpected error occurred')
        setCurrentStep(5)
        setProcessingComplete(true)
      }
    }

    // Start processing after a brief delay
    timers.push(setTimeout(processImage, 800))

    return () => {
      timers.forEach(clearTimeout)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const goToResults = () => {
    sessionStorage.removeItem('pendingScanImageName')
    sessionStorage.removeItem('pendingScanImageUrl')
    navigate('/result')
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-neutral-900">Processing Product</h1>
        <p className="text-neutral-600 mt-1">
          Please wait while we extract text from your product image...
        </p>
      </div>

      <ProcessingSteps currentStep={currentStep} />

      <div className="bg-white rounded-lg border border-neutral-200 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-neutral-900 mb-4">Processing Details</h2>
        <div className="bg-neutral-50 rounded-lg p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-neutral-600">Status:</p>
              <p className={`font-medium ${processingComplete && !error ? 'text-success-700' : error ? 'text-danger-700' : 'text-primary-700'}`}>
                {error ? 'Failed' : processingComplete ? 'Complete' : 'In Progress'}
              </p>
            </div>
            <div>
              <p className="text-neutral-600">Analysis type:</p>
              <p className="font-medium text-neutral-900">Real OCR (OpenCV + PaddleOCR)</p>
            </div>
            <div>
              <p className="text-neutral-600">Processing steps:</p>
              <p className="font-medium text-neutral-900">{Math.min(currentStep + 1, 5)}/5 completed</p>
            </div>
            {ocrResult && (
              <div>
                <p className="text-neutral-600">Text regions detected:</p>
                <p className="font-medium text-neutral-900">{ocrResult.metadata?.line_count || 0}</p>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mt-6 p-4 bg-danger-50 border border-danger-200 rounded-lg">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-danger-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-danger-800 font-medium">Processing failed</p>
                <p className="text-danger-700 text-sm mt-1">{error}</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/scan')}
              className="mt-3 w-full px-4 py-2 bg-danger-600 text-white rounded-lg hover:bg-danger-700 transition-colors font-medium"
            >
              Try Again
            </button>
          </div>
        )}

        {processingComplete && !error && (
          <div className="mt-6 p-4 bg-success-50 border border-success-200 rounded-lg">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5 text-success-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-success-800 font-medium">Processing completed successfully! Results are ready.</p>
            </div>
            <button
              onClick={goToResults}
              className="mt-3 w-full px-4 py-2 bg-success-600 text-white rounded-lg hover:bg-success-700 transition-colors font-medium"
            >
              View Results
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
