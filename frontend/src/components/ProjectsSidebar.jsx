import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import ProjectMenu from "./ProjectMenu";

const ProjectsSidebar = ({
  projects,
  selectedProject,
  onProjectSelect,
  onNewProject,
  onEditProject,
  onDeleteProject,
  onManageCategories,
}) => {
  return (
    <div className="w-64 bg-card border-r p-4 space-y-4">
      {/* Categories link */}
      <div className="pb-2 border-b">
        <Button
          variant="ghost"
          onClick={onManageCategories}
          className="w-full justify-start text-sm"
        >
          Categories
        </Button>
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Projects</h2>
        <Button
          size="icon"
          variant="outline"
          onClick={onNewProject}
          className="h-8 w-8"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No projects yet.
            <br />
            Click the + button to create one.
          </p>
        ) : (
          projects.map(project => (
            <Card
              key={project.id}
              className={`cursor-pointer transition-colors group hover:bg-accent ${
                selectedProject?.id === project.id ? "bg-accent" : ""
              }`}
            >
              <CardContent className="p-3">
                <div
                  className="flex items-center justify-between"
                  onClick={() => onProjectSelect(project)}
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-sm truncate">
                      {project.name}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                      {project.original_name}
                    </p>
                  </div>
                  <div
                    className="flex-shrink-0 ml-2"
                    onClick={e => e.stopPropagation()}
                  >
                    <ProjectMenu
                      project={project}
                      onEdit={onEditProject}
                      onDelete={onDeleteProject}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};

export default ProjectsSidebar;
