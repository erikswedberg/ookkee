import { useState, useRef, useEffect } from 'react'

const ProjectMenu = ({ project, onEdit, onDelete }) => {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleEdit = () => {
    setIsOpen(false)
    onEdit(project)
  }

  const handleDelete = () => {
    setIsOpen(false)
    if (window.confirm(`Are you sure you want to delete "${project.name}"?`)) {
      onDelete(project.id)
    }
  }

  return (
    <div className="project-menu" ref={menuRef}>
      <button 
        className="project-menu-trigger"
        onClick={() => setIsOpen(!isOpen)}
        title="Project options"
      >
        ⋮
      </button>
      
      {isOpen && (
        <div className="project-menu-dropdown">
          <button className="menu-item" onClick={handleEdit}>
            Edit
          </button>
          <button className="menu-item menu-item-danger" onClick={handleDelete}>
            Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default ProjectMenu
