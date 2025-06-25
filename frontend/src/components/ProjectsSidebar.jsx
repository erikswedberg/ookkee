import ProjectMenu from './ProjectMenu'

const ProjectsSidebar = ({ projects, selectedProject, onProjectSelect, onNewProject, onEditProject, onDeleteProject }) => {
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
        <button className="new-project-btn" onClick={onNewProject} title="Add new project">
          +
        </button>
      </div>
      
      <div className="projects-list">
        {projects.length === 0 ? (
          <div className="projects-empty">
            Add a project
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className={`project-item ${
                selectedProject?.id === project.id ? 'selected' : ''
              }`}
            >
              <div 
                className="project-main"
                onClick={() => onProjectSelect(project)}
              >
                <div className="project-name">{project.name}</div>
                <div className="project-meta">
                  <span className="project-filename">{project.original_name}</span>
                  <span className="project-details">
                    {formatRowCount(project.row_count)} • {formatDate(project.created_at)}
                  </span>
                </div>
              </div>
              <ProjectMenu 
                project={project}
                onEdit={onEditProject}
                onDelete={onDeleteProject}
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ProjectsSidebar
