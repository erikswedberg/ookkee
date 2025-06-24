import { useState, useEffect } from 'react'
import ProjectsSidebar from './components/ProjectsSidebar'
import SpreadsheetView from './components/SpreadsheetView'
import FileUpload from './components/FileUpload'
import './App.css'

function App() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [showUpload, setShowUpload] = useState(false)

  useEffect(() => {
    fetchProjects()
  }, [])

  const fetchProjects = async () => {
    try {
      const response = await fetch('http://localhost:8080/api/projects')
      const data = await response.json()
      setProjects(data || [])
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    }
  }

  const handleProjectSelect = (project) => {
    setSelectedProject(project)
    setShowUpload(false)
  }

  const handleUploadSuccess = () => {
    fetchProjects()
    setShowUpload(false)
  }

  const handleNewUpload = () => {
    setShowUpload(true)
    setSelectedProject(null)
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
          onNewUpload={handleNewUpload}
        />
        
        <div className="main-panel">
          {showUpload ? (
            <div className="upload-panel">
              <h2>Upload New CSV File</h2>
              <FileUpload onUploadSuccess={handleUploadSuccess} />
            </div>
          ) : selectedProject ? (
            <SpreadsheetView project={selectedProject} />
          ) : (
            <div className="welcome-panel">
              <h2>Welcome to Ookkee</h2>
              <p>Select a project from the sidebar or upload a new CSV file to get started.</p>
              <button className="upload-button" onClick={handleNewUpload}>
                Upload CSV File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App
