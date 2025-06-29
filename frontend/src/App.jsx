import { useState, useEffect } from "react";
import ProjectsSidebar from "./components/ProjectsSidebar";
import SpreadsheetView from "./components/SpreadsheetView";
import ProjectModal from "./components/ProjectModal";
import CategoryModal from "./components/CategoryModal";
import { Card, CardContent } from "@/components/ui/card";
import "./App.css";

function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/projects`);
      const data = await response.json();
      setProjects(data || []);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  };

  const handleProjectSelect = project => {
    setSelectedProject(project);
  };

  const handleNewProject = () => {
    setEditingProject(null);
    setIsModalOpen(true);
  };

  const handleEditProject = project => {
    setEditingProject(project);
    setIsModalOpen(true);
  };

  const handleDeleteProject = async projectId => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/projects/${projectId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        // Remove from local state
        setProjects(projects.filter(p => p.id !== projectId));
        // Clear selection if deleted project was selected
        if (selectedProject?.id === projectId) {
          setSelectedProject(null);
        }
      } else {
        throw new Error("Failed to delete project");
      }
    } catch (error) {
      console.error("Failed to delete project:", error);
      alert("Failed to delete project. Please try again.");
    }
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
    setEditingProject(null);
  };

  const handleModalSave = async projectData => {
    try {
      if (editingProject) {
        // Update existing project
        const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
        const response = await fetch(
          `${API_URL}/api/projects/${editingProject.id}`,
          {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ name: projectData.name }),
          }
        );

        if (response.ok) {
          // Update local state
          setProjects(
            projects.map(p =>
              p.id === editingProject.id ? { ...p, name: projectData.name } : p
            )
          );
          setIsModalOpen(false);
        } else {
          throw new Error("Failed to update project");
        }
      } else {
        // For new projects, the modal will handle file upload
        // and refresh will happen via onUploadSuccess
        fetchProjects();
        setIsModalOpen(false);
      }
    } catch (error) {
      console.error("Failed to save project:", error);
      alert("Failed to save project. Please try again.");
    }
  };

  const handleManageCategories = () => {
    setIsCategoryModalOpen(true);
  };

  // Removed unused handleUploadSuccess function

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="p-6">
          <h1 className="text-3xl font-bold">Ookkee</h1>
          <p className="text-muted-foreground">AI Bookkeeping Assistant</p>
        </div>
      </header>

      <div className="flex h-[calc(100vh-110px)]">
        <ProjectsSidebar
          projects={projects}
          selectedProject={selectedProject}
          onProjectSelect={handleProjectSelect}
          onNewProject={handleNewProject}
          onEditProject={handleEditProject}
          onDeleteProject={handleDeleteProject}
          onManageCategories={handleManageCategories}
        />

        <div className="flex-1 overflow-hidden">
          {selectedProject ? (
            <SpreadsheetView project={selectedProject} />
          ) : (
            <div className="flex items-center justify-center h-full">
              <Card>
                <CardContent className="p-8 text-center">
                  <p className="text-muted-foreground">
                    Select a project to see its contents
                  </p>
                </CardContent>
              </Card>
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
      
      <CategoryModal
        isOpen={isCategoryModalOpen}
        onClose={() => setIsCategoryModalOpen(false)}
      />
    </div>
  );
}

export default App;
