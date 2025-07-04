import { useState, useEffect } from "react";
import ProjectsSidebar from "./components/ProjectsSidebar";
import SpreadsheetView from "./components/SpreadsheetView";
import ProjectModal from "./components/ProjectModal";
import CategoryModal from "./components/CategoryModal";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Toaster } from "sonner";
import "./App.css";

function App() {
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState(null);
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isHelpDialogOpen, setIsHelpDialogOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchCategories = async () => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
      const response = await fetch(`${API_URL}/api/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data || []);
      }
    } catch (error) {
      console.error("Failed to fetch categories:", error);
    }
  };

  const handleHelpOpen = () => {
    fetchCategories();
    setIsHelpDialogOpen(true);
  };

  const formatCategoryName = (name, hotkey) => {
    if (!hotkey) return name;
    
    // Try to highlight the hotkey in the name
    const index = name.toUpperCase().indexOf(hotkey.toUpperCase());
    if (index === -1) {
      return `${name} [${hotkey}]`;
    }
    
    return (
      <>
        {name.slice(0, index)}
        <span className="font-bold">[{name.slice(index, index + 1)}]</span>
        {name.slice(index + 1)}
      </>
    );
  };

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
      <header className="border-b bg-card shadow-md" style={{height: '50px'}}>
        <div className="px-6 h-full flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">ookkee</h1>
            <p className="text-sm text-muted-foreground">AI Bookkeeping Assistant</p>
          </div>
          <Dialog open={isHelpDialogOpen} onOpenChange={setIsHelpDialogOpen}>
            <DialogTrigger asChild>
              <button 
                className="text-blue-600 hover:text-blue-800 underline"
                onClick={handleHelpOpen}
              >
                Help
              </button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Keyboard Shortcuts</DialogTitle>
                <DialogDescription>
                  Available shortcuts when interacting with the table
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-2 items-center gap-4">
                  <div className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
                    ↑ / ↓
                  </div>
                  <div className="text-sm">
                    Navigate between rows
                  </div>
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <div className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
                    A
                  </div>
                  <div className="text-sm">
                    Accept AI suggestion
                  </div>
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <div className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
                    P
                  </div>
                  <div className="text-sm">
                    Toggle Personal expense
                  </div>
                </div>
                <div className="grid grid-cols-2 items-center gap-4">
                  <div className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
                    Esc
                  </div>
                  <div className="text-sm">
                    Deactivate table
                  </div>
                </div>
                
                {/* Dynamic Category Hotkeys */}
                {categories.filter(cat => cat.hotkey).length > 0 && (
                  <>
                    <div className="col-span-2 border-t pt-4">
                      <h4 className="font-medium text-sm mb-2">Category Hotkeys</h4>
                    </div>
                    {categories
                      .filter(cat => cat.hotkey)
                      .sort((a, b) => a.hotkey.localeCompare(b.hotkey))
                      .map(category => (
                        <div key={category.id} className="grid grid-cols-2 items-center gap-4">
                          <div className="font-mono bg-gray-100 px-2 py-1 rounded text-sm">
                            {category.hotkey}
                          </div>
                          <div className="text-sm">
                            {formatCategoryName(category.name, category.hotkey)}
                          </div>
                        </div>
                      ))
                    }
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="flex h-[calc(100vh-50px)] relative">
        {/* Sidebar */}
        <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'w-0' : 'w-64'} overflow-hidden`}>
          <ProjectsSidebar
            projects={projects}
            selectedProject={selectedProject}
            onProjectSelect={handleProjectSelect}
            onNewProject={handleNewProject}
            onEditProject={handleEditProject}
            onDeleteProject={handleDeleteProject}
            onManageCategories={handleManageCategories}
          />
        </div>

        {/* Collapse/Expand Button */}
        <Button
          variant="outline"
          size="sm"
          className="absolute left-0 top-1/2 transform -translate-y-1/2 z-10 h-12 w-8 rounded-r-md rounded-l-none border-l-0 bg-background hover:bg-muted"
          style={{ left: isSidebarCollapsed ? '0px' : '256px' }}
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        >
          {isSidebarCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>

        {/* Main Content */}
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
      
      <Toaster position="top-right" richColors />
    </div>
  );
}

export default App;
