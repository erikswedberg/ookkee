import { useState, useEffect } from 'react'
import ProjectsSidebar from './components/ProjectsSidebar'
import SpreadsheetView from './components/SpreadsheetView'
import ProjectModal from './components/ProjectModal'
import './App.css'

function App() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingProject, setEditingProject] = useState(null)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
      const response = await fetch(`${API_URL}/api/projects`)
      const data = await response.json()
      setProjects(data || [])
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }

  const handleProjectSelect = (project) => {
    setSelectedProject(project)
  }

  const handleNewProject = () => {
    setEditingProject(null)
    setIsModalOpen(true)
  }

  const handleEditProject = (project) => {
    setEditingProject(project)
    setIsModalOpen(true)
  }

  const handleDeleteProject = async (projectId) => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: 'DELETE'
      })
      
      if (response.ok) {
        // Remove from local state
        setProjects(projects.filter(p => p.id !== projectId))
        // Clear selection if deleted project was selected
        if (selectedProject?.id === projectId) {
          setSelectedProject(null)
        }
      } else {
        throw new Error('Failed to delete project')
      }
    } catch (error) {
      console.error('Failed to delete project:', error)
      alert('Failed to delete project. Please try again.')
    }
  }

  const handleModalClose = () => {
    setIsModalOpen(false)
    setEditingProject(null)
  }

  const handleModalSave = async (projectData) => {
    try {
      if (editingProject) {
        // Update existing project
        const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080'
        const response = await fetch(`${API_URL}/api/projects/${editingProject.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ name: projectData.name })
        })
        
        if (response.ok) {
          // Update local state
          setProjects(projects.map(p => 
            p.id === editingProject.id 
              ? { ...p, name: projectData.name }
              : p
          ))
          setIsModalOpen(false)
        } else {
          throw new Error('Failed to update project')
        }
      } else {
        // For new projects, the modal will handle file upload
        // and refresh will happen via onUploadSuccess
        fetchProjects()
        setIsModalOpen(false)
      }
    } catch (error) {
      console.error('Failed to save project:', error)
      alert('Failed to save project. Please try again.')
    }
  }

  const handleUploadSuccess = () => {
    fetchProjects()
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>Ookkee</h1>
        <p>AI Bookkeeping Assistant</p>
      </header>
      
      <div className="app-content">
        <ProjectsSidebar
          projects={projects}
          selectedProject={selectedProject}
          onProjectSelect={handleProjectSelect}
          onNewProject={handleNewProject}
          onEditProject={handleEditProject}
          onDeleteProject={handleDeleteProject}
        />
        
        <div className="main-panel">
          {selectedProject ? (
            <SpreadsheetView project={selectedProject} />
          ) : (
            <div className="welcome-panel">
              <p className="welcome-message">Select a project to see its contents</p>
            </div>
          )}
        </div>
      </div>

      <ProjectModal
        isOpen={isModalOpen}
        onClose={handleModalClose}
        onSave={handleModalSave}
        project={editingProject}
      />
    </div>
  )
}

export default App
