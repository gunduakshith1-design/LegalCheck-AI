import React, { useState, useRef } from 'react'
import GlassSurface from './GlassSurface'

export default function ScanDropzone({ onImageSelect, accept = ".png,.jpg,.jpeg", maxSize = 10 * 1024 * 1024 }) {
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef()

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const validateFile = (file) => {
    // Check file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg']
    if (!allowedTypes.includes(file.type)) {
      setError(`File type not supported. Please upload ${accept} files.`)
      return false
    }

    // Check file size
    if (file.size > maxSize) {
      setError(`File size exceeds ${maxSize / (1024 * 1024)}MB limit.`)
      return false
    }

    setError('')
    return true
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      if (validateFile(e.dataTransfer.files[0])) {
        onImageSelect(e.dataTransfer.files[0])
      }
    }
  }

  const handleChange = (e) => {
    e.preventDefault()
    if (e.target.files && e.target.files[0]) {
      if (validateFile(e.target.files[0])) {
        onImageSelect(e.target.files[0])
      }
    }
  }

  return (
    <div className="space-y-4">
      <GlassSurface
        width="100%"
        height="auto"
        borderRadius={12}
        backgroundOpacity={0.02}
        saturation={1}
        className="w-full"
        style={{ padding: 0 }}
      >
      <div
        className={`scan-dropzone ${dragActive ? 'active' : ''} ${error ? 'error' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept={accept}
          onChange={handleChange}
        />

        <div className="flex flex-col items-center space-y-4">
          <div className="w-16 h-16 bg-neutral-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          </div>

          <div className="text-center">
            <h3 className="text-lg font-medium text-neutral-900">Upload Product Image</h3>
            <p className="text-neutral-500 mt-1">Drag and drop or click to browse</p>
            <p className="text-sm text-neutral-400 mt-2">PNG, JPG up to {maxSize / (1024 * 1024)}MB</p>
          </div>

          <button
            type="button"
            className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium"
            onClick={(e) => {
              e.stopPropagation()
              inputRef.current?.click()
            }}
          >
            Select Image
          </button>
        </div>
      </div>
      </GlassSurface>

      {error && (
        <div className="text-danger-700 bg-danger-50 border border-danger-200 rounded-lg p-3 text-sm">
          {error}
        </div>
      )}

      <div className="flex items-center justify-center space-x-4 text-sm text-neutral-400">
        <span>• No registration required</span>
        <span>• Secure processing</span>
        <span>• Privacy protected</span>
      </div>
    </div>
  )
}