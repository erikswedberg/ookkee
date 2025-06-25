import { useState, useEffect, useRef } from 'react'
import FileUpload from './FileUpload'

const ProjectModal = ({ isOpen, onClose, onSave, project = null }) => {
  const [projectName, setProjectName] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const modalRef = useRef(null)
  // const nameInputRef = useRef(null)
  // const fileInputRef = useRef(null)

  useEffect(() => {
    if (project) {
      setProjectName(project.name)
      setIsEditing(true)
    } else {
      setProjectName('')
      setIsEditing(false)
    }
    
    // Clear file when project changes
    setSelectedFile(null)
  }, [project])

  useEffect(() => {
    if (!isOpen) {
      // Clear all state when modal closes
      setProjectName('')
      setSelectedFile(null)
      setIsEditing(false)
    }
  }, [isOpen])

  // useEffect(() => {
  //   if (isOpen && nameInputRef.current) {
  //     nameInputRef.current.focus()
  //   }
  // }, [isOpen])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    // const handleClickOutside = (e) => {
    //   // Don't close modal if click is on file input
    //   // if (fileInputRef.current && e.target === fileInputRef.current) {
    //   //   return
    //   // }
      
    //   if (modalRef.current && !modalRef.current.contains(e.target)) {
    //     onClose()
    //   }
    // }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      //document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      //document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen, onClose])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!projectName.trim()) {
      alert('Please enter a project name')
      return
    }
    onSave({ name: projectName.trim(), id: project?.id })
  }

  const handleFileUploadSuccess = (result) => {
    // For new projects, don't close modal - let user submit the form
    // For existing projects (editing), we're not showing file upload anyway
    setSelectedFile(result.filename)
  }

  const handleOverlayClick = (e) => {
    // Prevent closing modal if click is on the modal content
    if (modalRef.current && modalRef.current.contains(e.target)) {
      return
    }
    onClose()
  }

  if (!isOpen) {
    return null
  }

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal-content" ref={modalRef}>
        <div className="modal-header">
          <h2>{isEditing ? 'Edit Project' : 'Add New Project'}</h2>
          <button className="modal-close" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label htmlFor="projectName">Project Name</label>
            <input
              //ref={nameInputRef}
              type="text"
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name..."
              required
            />
          </div>

          {isEditing ? (
            <div className="form-group">
              <label>Original File</label>
              <input
                type="text"
                value={project?.original_name || ''}
                disabled
                className="form-input-disabled"
              />
            </div>
          ) : (
            <div className="form-group">
              <label>CSV File</label>
              <FileUpload 
                onUploadSuccess={handleFileUploadSuccess}
                projectName={projectName}
                //fileInputRef={fileInputRef}
              />
            </div>
          )}

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              {isEditing ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ProjectModal
