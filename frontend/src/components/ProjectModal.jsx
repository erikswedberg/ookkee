import { useState, useEffect, useRef } from 'react'
import FileUpload from './FileUpload'

const ProjectModal = ({ isOpen, onClose, onSave, project = null }) => {
  const [projectName, setProjectName] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const modalRef = useRef(null)
  const nameInputRef = useRef(null)

  useEffect(() => {
    if (project) {
      setProjectName(project.name)
      setIsEditing(true)
    } else {
      setProjectName('')
      setIsEditing(false)
    }
  }, [project])

  useEffect(() => {
    if (isOpen && nameInputRef.current) {
      nameInputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }

    const handleClickOutside = (e) => {
      if (modalRef.current && !modalRef.current.contains(e.target)) {
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('mousedown', handleClickOutside)
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
    // For new projects, close modal after upload
    if (!isEditing) {
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay">
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
              ref={nameInputRef}
              type="text"
              id="projectName"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name..."
              required
            />
          </div>

          {!isEditing && (
            <div className="form-group">
              <label>CSV File</label>
              <FileUpload 
                onUploadSuccess={handleFileUploadSuccess}
                projectName={projectName}
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
