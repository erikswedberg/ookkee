import { useState } from 'react'

const ProjectsSidebar = ({ projects, selectedProject, onProjectSelect, onNewUpload }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatRowCount = (count) => {
    return `${count} row${count !== 1 ? 's' : ''}`
  }

  return (
    <div className="projects-sidebar">
      <div className="sidebar-header">
        <h3>Projects</h3>
        <button className="new-upload-btn" onClick={onNewUpload}>
          + Upload CSV
        </button>
      </div>
      
      <div className="projects-list">
        {projects.length === 0 ? (
          <div className="projects-empty">
            No projects yet. Upload a CSV file to get started.
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className={`project-item ${
                selectedProject?.id === project.id ? 'selected' : ''
              }`}
              onClick={() => onProjectSelect(project)}
            >
              <div className="project-name">{project.name}</div>
              <div className="project-meta">
                {formatRowCount(project.row_count)} • {formatDate(project.created_at)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ProjectsSidebar
