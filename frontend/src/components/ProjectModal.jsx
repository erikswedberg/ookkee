import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import FileUpload from "./FileUpload";

const ProjectModal = ({ isOpen, onClose, onSave, project = null }) => {
  const [projectName, setProjectName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null); // eslint-disable-line no-unused-vars
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (project) {
      setProjectName(project.name);
      setIsEditing(true);
    } else {
      setProjectName("");
      setIsEditing(false);
    }

    // Clear file when project changes
    setSelectedFile(null);
  }, [project]);

  useEffect(() => {
    if (!isOpen) {
      // Clear all state when modal closes
      setProjectName("");
      setSelectedFile(null);
      setIsEditing(false);
    }
  }, [isOpen]);

  const handleSubmit = e => {
    e.preventDefault();
    if (!projectName.trim()) {
      alert("Please enter a project name");
      return;
    }
    onSave({ name: projectName.trim(), id: project?.id });
  };

  const handleFileUploadSuccess = result => {
    // For new projects, don't close modal - let user submit the form
    // For existing projects (editing), we're not showing file upload anyway
    setSelectedFile(result.filename);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Project" : "Add New Project"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="projectName">Project Name</Label>
            <Input
              id="projectName"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="Enter project name..."
              required
              data-testid="project-name-input"
            />
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Label>Original File</Label>
              <Input
                value={project?.original_name || ""}
                disabled
                className="opacity-50"
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label>CSV File</Label>
              <FileUpload
                onUploadSuccess={handleFileUploadSuccess}
                projectName={projectName}
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} data-testid="cancel-button">
              Cancel
            </Button>
            <Button type="submit" data-testid="create-project-button">
              {isEditing ? "Save Changes" : "Create Project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ProjectModal;
