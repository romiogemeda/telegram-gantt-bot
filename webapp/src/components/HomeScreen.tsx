import React, { useState, useEffect } from "react";
import { fetchProjects, type ProjectListItem } from "../lib/api";

interface HomeScreenProps {
  onOpenProject: (projectId: string) => void;
  onSubmitCreate: (name: string) => Promise<void>;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onOpenProject,
  onSubmitCreate,
}) => {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Create form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    fetchProjects()
      .then((data) => {
        if (mounted) {
          setProjects(data.projects);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      setCreateError("Project name is required");
      return;
    }

    setCreateError(null);
    setIsCreating(true);
    try {
      await onSubmitCreate(newProjectName.trim());
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create project");
      setIsCreating(false);
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay === 1) return "Yesterday";
    if (diffDay < 7) return `${diffDay} days ago`;
    return date.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="home-screen">
        <div className="loading-spinner" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="home-screen">
        <div className="home-empty">
          <div className="home-empty-title">Failed to load projects</div>
          <div>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="home-screen">
      <header className="home-header">
        <h1 className="home-title">📋 My Projects</h1>
        <div className="home-subtitle">
          {projects.length} {projects.length === 1 ? "project" : "projects"}
        </div>
      </header>

      <div className="project-list">
        {projects.length === 0 ? (
          <div className="home-empty">
            <div className="home-empty-title">No projects yet</div>
            <div>Create your first project to get started</div>
          </div>
        ) : (
          projects.map((project) => (
            <div
              key={project.id}
              className="project-card"
              onClick={() => onOpenProject(project.id)}
            >
              <div className="project-card-name">{project.name}</div>
              <div className="project-card-meta">
                {project.members.length > 0 && (
                  <div className="member-stack">
                    {project.members.slice(0, 3).map((m) => (
                      <div
                        key={m.id}
                        className="member-avatar"
                        style={{ width: 22, height: 22, fontSize: 10 }}
                      >
                        {m.displayName[0]}
                      </div>
                    ))}
                  </div>
                )}
                <span>{project._count.tasks} tasks</span>
                <span>Updated {formatRelativeTime(project.updatedAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="home-bottom">
        {showCreateForm ? (
          <form className="create-form" onSubmit={handleCreateSubmit}>
            <input
              autoFocus
              className={`sheet-input ${createError ? "error" : ""}`}
              placeholder="Project name..."
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              disabled={isCreating}
            />
            {createError && <span className="sheet-field-error">{createError}</span>}
            <div className="create-form-actions">
              <button
                type="submit"
                className="sheet-action-btn"
                disabled={isCreating}
                style={{ flex: 1 }}
              >
                {isCreating ? <div className="sheet-action-spinner" /> : "Create"}
              </button>
              <button
                type="button"
                className="create-form-cancel"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewProjectName("");
                  setCreateError(null);
                }}
                disabled={isCreating}
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button className="sheet-action-btn" onClick={() => setShowCreateForm(true)}>
            Create New Project
          </button>
        )}
      </div>
    </div>
  );
};
