import { useState, useRef } from 'react'

const FileUpload = ({ onUploadSuccess, projectName, fileInputRef }) => {
  const [file, setFile] = useState(null)
  const [uploadStatus, setUploadStatus] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const internalFileInputRef = useRef(null)
  const actualFileInputRef = fileInputRef || internalFileInputRef

  const handleFileSelect = (selectedFile) => {
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile)
      setUploadStatus('')
    } else {
      setUploadStatus('error')
      setFile(null)
      setTimeout(() => setUploadStatus(''), 3000)
    }
  }

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    handleFileSelect(selectedFile)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    handleFileSelect(droppedFile)
  }

  const handleUpload = async () => {
    if (!file) return

    setIsUploading(true)
    setUploadProgress(0)
    setUploadStatus('loading')

    const formData = new FormData()
    formData.append('csvFile', file)
    if (projectName) {
      formData.append('projectName', projectName)
    }

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => prev < 90 ? prev + 10 : prev)
      }, 100)

      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
      const response = await fetch(`${API_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      })

      clearInterval(progressInterval)
      setUploadProgress(100)

      if (response.ok) {
        const result = await response.json()
        setUploadStatus('success')
        console.log('Upload successful:', result)
        // Call success callback if provided
        if (onUploadSuccess) {
          setTimeout(() => onUploadSuccess(result), 1000)
        }
      } else {
        const errorText = await response.text()
        throw new Error(errorText)
      }
    } catch (error) {
      console.error('Upload failed:', error)
      setUploadStatus('error')
    } finally {
      setIsUploading(false)
      setTimeout(() => {
        setUploadProgress(0)
        if (uploadStatus === 'success') {
          setFile(null)
          setUploadStatus('')
          if (actualFileInputRef.current) {
            actualFileInputRef.current.value = ''
          }
        }
      }, 2000)
    }
  }

  const handleButtonClick = () => {
    actualFileInputRef.current?.click()
  }

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getStatusMessage = () => {
    switch (uploadStatus) {
      case 'success':
        return 'File uploaded successfully! 🎉'
      case 'error':
        return 'Upload failed. Please ensure you\'re uploading a valid CSV file.'
      case 'loading':
        return 'Uploading file...'
      default:
        return ''
    }
  }

  return (
    <div className={`file-upload-container ${isDragOver ? 'drag-over' : ''}`}
         onDragOver={handleDragOver}
         onDragLeave={handleDragLeave}
         onDrop={handleDrop}>
      
      <div className="upload-icon">📊</div>
      
      <div className="upload-text">
        {file ? 'File Ready for Upload' : 'Upload Your CSV File'}
      </div>
      
      <div className="upload-hint">
        {file ? 'Click upload to process your file' : 'Drag and drop your CSV file here, or click to browse'}
      </div>
      
      <input
        ref={actualFileInputRef}
        type="file"
        accept=".csv"
        onChange={handleFileChange}
        className="file-input"
      />
      
      {!file && (
        <button 
          onClick={handleButtonClick}
          className="upload-button"
          disabled={isUploading}
        >
          Browse Files
        </button>
      )}
      
      {file && (
        <div className="file-info">
          <h4>Selected File:</h4>
          <p><strong>Name:</strong> {file.name}</p>
          <p><strong>Size:</strong> {formatFileSize(file.size)}</p>
          <p><strong>Type:</strong> {file.type}</p>
          
          <button 
            onClick={handleUpload}
            className="upload-button"
            disabled={isUploading}
            style={{ marginTop: '1rem' }}
          >
            {isUploading ? 'Uploading...' : 'Upload File'}
          </button>
        </div>
      )}
      
      {uploadProgress > 0 && (
        <div className="progress-bar">
          <div 
            className="progress-fill" 
            style={{ width: `${uploadProgress}%` }}
          ></div>
        </div>
      )}
      
      {uploadStatus && (
        <div className={`upload-status ${uploadStatus}`}>
          {getStatusMessage()}
        </div>
      )}
    </div>
  )
}

export default FileUpload
