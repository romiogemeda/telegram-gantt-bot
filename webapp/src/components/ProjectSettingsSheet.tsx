import React, { useState, useEffect } from "react";

interface ProjectSettingsSheetProps {
  project: { id: string; name: string; settings: { notificationsEnabled: boolean } };
  onRename: (name: string) => Promise<void>;
  onToggleNotifications: () => Promise<void>;
  onArchive: () => Promise<boolean>;
  onClose: () => void;
  onArchiveComplete: () => void;
}

const ProjectSettingsSheet: React.FC<ProjectSettingsSheetProps> = ({
  project,
  onRename,
  onToggleNotifications,
  onArchive,
  onClose,
  onArchiveComplete,
}) => {
  const [name, setName] = useState(project.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showArchiveConfirm, setShowArchiveConfirm] = useState(false);

  useEffect(() => {
    setName(project.name);
  }, [project.name]);

  const handleRename = async () => {
    if (!name.trim() || name === project.name) return;
    setIsSavingName(true);
    try {
      await onRename(name);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingName(false);
    }
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      const success = await onArchive();
      if (success) {
        onArchiveComplete();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsArchiving(false);
    }
  };

  const nameChanged = name !== project.name && name.trim().length > 0;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header">
          <h2 className="sheet-title">Project Settings</h2>
          <button className="sheet-close" onClick={onClose}>×</button>
        </div>

        <div className="sheet-content">
          {/* Section 1: Project Name */}
          <div className="settings-section">
            <label className="sheet-section-label">Project Name</label>
            <div className="settings-rename-row">
              <input
                type="text"
                className="sheet-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter project name"
                disabled={isSavingName}
              />
              {nameChanged && (
                <button
                  className="settings-rename-btn"
                  onClick={handleRename}
                  disabled={isSavingName}
                >
                  {isSavingName ? "Saving..." : "Rename"}
                </button>
              )}
            </div>
          </div>

          {/* Section 2: Notifications */}
          <div className="settings-section">
            <div className="settings-toggle-row">
              <span className="settings-toggle-label">Status change notifications</span>
              <button
                className={`settings-toggle ${project.settings.notificationsEnabled ? "on" : ""}`}
                onClick={() => onToggleNotifications()}
                aria-label="Toggle notifications"
              >
                <div className="settings-toggle-knob" />
              </button>
            </div>
            <p className="settings-toggle-hint">
              When enabled, the bot posts a message to the group chat whenever a task status changes.
            </p>
          </div>

          <div className="settings-danger">
            <label className="settings-danger-label">Danger Zone</label>
            
            {!showArchiveConfirm ? (
              <button 
                className="settings-archive-btn"
                onClick={() => setShowArchiveConfirm(true)}
              >
                Archive Project
              </button>
            ) : (
              <div className="settings-archive-confirm">
                <p>This will hide the project and disable the Gantt chart. Are you sure?</p>
                <div className="settings-archive-actions">
                  <button 
                    className="settings-archive-btn-confirm" 
                    onClick={handleArchive}
                    disabled={isArchiving}
                  >
                    {isArchiving ? "Archiving..." : "Yes, archive"}
                  </button>
                  <button 
                    className="settings-archive-btn-cancel" 
                    onClick={() => setShowArchiveConfirm(false)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProjectSettingsSheet;
