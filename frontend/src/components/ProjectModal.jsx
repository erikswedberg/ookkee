import { useState, useEffect, useRef } from "react";
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
import { toast } from "sonner";
import FileUpload from "./FileUpload";

const ProjectModal = ({ isOpen, onClose, onSave, onAppended, project = null }) => {
  const [projectName, setProjectName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null); // eslint-disable-line no-unused-vars
  const [isEditing, setIsEditing] = useState(false);
  const [files, setFiles] = useState([]);
  const [appending, setAppending] = useState(false);
  const appendInputRef = useRef(null);

  const fetchFiles = async projectId => {
    try {
      const API_URL = import.meta.env.VITE_API_URL || "";
      const res = await fetch(`${API_URL}/api/projects/${projectId}/files`);
      if (res.ok) setFiles(await res.json());
    } catch (err) {
      console.error("Failed to fetch project files:", err);
    }
  };

  useEffect(() => {
    if (project) {
      setProjectName(project.name);
      setIsEditing(true);
      fetchFiles(project.id);
    } else {
      setProjectName("");
      setIsEditing(false);
      setFiles([]);
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
      setFiles([]);
      setAppending(false);
    }
  }, [isOpen]);

  // Append one CSV at a time so we can confirm each operation succeeded.
  const handleAppendFile = async e => {
    const file = e.target.files?.[0];
    if (!file || !project?.id) return;
    setAppending(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || "";
      const formData = new FormData();
      formData.append("csvFile", file);
      const res = await fetch(`${API_URL}/api/projects/${project.id}/append`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || `status ${res.status}`);
      }
      const result = await res.json();
      toast.success(`Appended ${result.rows_added} rows from ${file.name}`);
      await fetchFiles(project.id);
      if (onAppended) onAppended(project.id);
    } catch (err) {
      console.error("Append failed:", err);
      toast.error(`Append failed: ${err.message}`);
    } finally {
      setAppending(false);
      if (appendInputRef.current) appendInputRef.current.value = "";
    }
  };

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
              <Label>Original File{files.length === 1 ? "" : "s"}</Label>
              <div className="rounded-md border divide-y">
                {files.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground">
                    {project?.original_name || "No files"}
                  </div>
                ) : (
                  files.map(f => (
                    <div
                      key={f.id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="truncate mr-3">{f.original_name}</span>
                      <span className="text-muted-foreground whitespace-nowrap">
                        {f.row_count} rows
                      </span>
                    </div>
                  ))
                )}
              </div>
              <div className="pt-1">
                <Label htmlFor="appendCsv" className="text-xs text-muted-foreground">
                  Add a CSV (appends rows to this project)
                </Label>
                <Input
                  id="appendCsv"
                  ref={appendInputRef}
                  type="file"
                  accept=".csv"
                  disabled={appending}
                  onChange={handleAppendFile}
                  className="mt-1 file:mr-2 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                />
                {appending && (
                  <p className="text-xs text-muted-foreground mt-1">Uploading…</p>
                )}
              </div>
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
