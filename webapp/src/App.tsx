import { useEffect, useState } from "react";
import { getTelegram } from "./lib/telegram.js";
import { HomeScreen } from "./components/HomeScreen.js";
import { ProjectView } from "./components/ProjectView.js";
import { createProject } from "./lib/api.js";
import "./styles.css";

// ============================================================================
// App – Root Component
// ============================================================================
// Orchestrates the multi-screen navigation:
//   1. Init Telegram WebApp SDK
//   2. Determine initial screen (Home vs Project via URL)
//   3. Manage screen state and active project
// ============================================================================

type Screen = "home" | "project";

export function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [navigatedFromHome, setNavigatedFromHome] = useState(false);

  // ── Init Telegram SDK & Routing ─────────────────────────────────────
  useEffect(() => {
    const tg = getTelegram();
    if (tg) {
      tg.ready();
      tg.expand();
    }

    // Check for projectId in URL for direct/bot links
    const params = new URLSearchParams(window.location.search);
    const projectId = params.get("projectId");
    if (projectId) {
      setScreen("project");
      setActiveProjectId(projectId);
      setNavigatedFromHome(false);
    }
  }, []);

  // ── Navigation Handlers ─────────────────────────────────────────────

  const handleOpenProject = (projectId: string) => {
    setActiveProjectId(projectId);
    setScreen("project");
    setNavigatedFromHome(true);
  };

  const handleBackToHome = () => {
    setScreen("home");
    setActiveProjectId(null);
    setNavigatedFromHome(false);
  };

  const handleCreateSubmit = async (name: string) => {
    const result = await createProject(name);
    if (result.ok) {
      setActiveProjectId(result.project.id);
      setScreen("project");
      setNavigatedFromHome(true);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────

  if (screen === "home") {
    return (
      <HomeScreen 
        onOpenProject={handleOpenProject} 
        onSubmitCreate={handleCreateSubmit}
      />
    );
  }

  if (screen === "project" && activeProjectId) {
    return (
      <ProjectView 
        projectId={activeProjectId} 
        onBack={navigatedFromHome ? handleBackToHome : undefined}
      />
    );
  }

  return null;
}