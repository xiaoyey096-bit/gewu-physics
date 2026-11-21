import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Spinner } from "@/components/ui/spinner";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { requestJson } from "@/lib/api";
import { StoreProvider, useStore } from "@/lib/store";
import type { HealthInfo } from "@/lib/types";
import { useBreakpoint } from "@/lib/use-media";
import { IntakeScreen } from "@/src/features/intake/IntakeScreen";
import { Atmosphere, BrandMark } from "@/src/features/shell/Chrome";
import { StudyLayout, Workspace } from "@/src/features/shell/Workspace";
import { LandingScreen } from "@/src/features/shell/LandingScreen";

export default function App() {
  return (
    <StoreProvider>
      <TooltipProvider delayDuration={220}>
        <Shell />
      </TooltipProvider>
    </StoreProvider>
  );
}

function Shell() {
  const { ready, sessions, activeSession, setActive, prefs, setPrefs } = useStore();
  const bp = useBreakpoint();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [view, setView] = useState<"landing" | "intake" | "workspace">("landing");
  const [draftKey, setDraftKey] = useState(0);
  const [showProblem, setShowProblem] = useState(false);
  const newProblem = () => {
    setDraftKey((key) => key + 1);
    setView("intake");
  };

  useEffect(() => {
    let alive = true;
    requestJson("/functions/v1/app/health")
      .then((data) => {
        const h = data as HealthInfo;
        if (alive && h?.ok === true) setConfigured(Boolean(h.recognizeConfigured));
      })
      .catch(() => {
        if (alive) setConfigured(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  // 当前题目被删除后自动接管：仍有题目则切到最近一道，否则回到第一步；撤销恢复后再回到工作台。
  const autoLeft = useRef(false);
  useEffect(() => {
    if (activeSession) {
      autoLeft.current = false;
      return;
    }
    if (view === "workspace") {
      if (sessions.length) setActive(sessions[0].id);
      else {
        autoLeft.current = true;
        setView("intake");
      }
    } else if (autoLeft.current && sessions.length) {
      autoLeft.current = false;
      setActive(sessions[0].id);
      setView("workspace");
    }
  }, [view, activeSession, sessions, setActive]);

  const openSession = useCallback((id: string, detail = false) => {
    setActive(id);
    setShowProblem(detail);
    setView("workspace");
  }, [setActive]);

  const openLibrary = useCallback(() => {
    const target = activeSession ?? sessions[0];
    if (!target) {
      toast("题库还是空的", { description: "先上传照片或输入一道题，就会自动归入项目。", duration: 2600 });
      return;
    }
    setActive(target.id);
    setShowProblem(false);
    setPrefs({ leftOpen: true });
    setView("workspace");
  }, [activeSession, sessions, setActive, setPrefs]);

  const theme = prefs.theme === "system" ? "system" : prefs.theme;

  return (
    <>
      {!ready ? (
        <div className="relative grid min-h-dvh place-items-center">
          <Atmosphere />
          <div className="gw-rise relative flex flex-col items-center gap-4 text-center">
            <BrandMark />
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              正在打开本地题库…
            </p>
          </div>
        </div>
      ) : view === "landing" ? (
        <LandingScreen onEnter={() => setView("intake")} />
      ) : view === "workspace" && activeSession ? (
        <Workspace key={activeSession.id} configured={configured} onNewProblem={newProblem} onHome={() => setView("landing")} onOpenSession={openSession} showProblem={showProblem} onBackToLibrary={() => setShowProblem(false)} />
      ) : (
        <StudyLayout configured={configured} title="新建题目会话" composing onHome={() => setView("landing")} onNewProblem={newProblem} onOpenSession={openSession}>
          <IntakeScreen key={draftKey} configured={configured} onCreated={openSession} onOpenSession={openSession} onOpenLibrary={openLibrary} />
        </StudyLayout>
      )}
      <Toaster
        theme={theme}
        position={bp.mobile ? "top-center" : "bottom-right"}
        closeButton
        duration={3200}
        offset={bp.mobile ? 12 : 20}
      />
    </>
  );
}