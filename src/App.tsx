import { useEffect, useState } from "react";
import { AppShell } from "./components/AppShell";
import { Empty, Spinner } from "./components/ui";
import AddPage from "./pages/AddPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import DashboardPage from "./pages/DashboardPage";
import QuestionPage from "./pages/QuestionPage";
import QuestionsPage from "./pages/QuestionsPage";
import RevisionPage from "./pages/RevisionPage";
import SessionPage from "./pages/SessionPage";
import SettingsPage from "./pages/SettingsPage";
import TaxonomyPage from "./pages/TaxonomyPage";
import { FormulasPage, MistakesPage, TricksPage } from "./pages/VaultPages";
import { useRoute, useScrollTop } from "./lib/router";
import { initStore } from "./lib/store";

function Routes() {
  const route = useRoute();
  useScrollTop(route.path);
  const [a, b, c] = route.segments;
  switch (a) {
    case undefined:
    case "dashboard":
      return <DashboardPage />;
    case "questions":
      return b ? <QuestionPage id={b} /> : <QuestionsPage />;
    case "add":
      return <AddPage />;
    case "revision":
      return b === "session" ? <SessionPage /> : <RevisionPage />;
    case "formulas":
      return <FormulasPage />;
    case "tricks":
      return <TricksPage />;
    case "mistakes":
      return <MistakesPage />;
    case "analytics":
      return <AnalyticsPage />;
    case "admin":
      return b === "taxonomy" || c === undefined ? <TaxonomyPage /> : <TaxonomyPage />;
    case "settings":
      return <SettingsPage />;
    default:
      return <Empty title="Page not found" action={{ to: "/dashboard", label: "Go to dashboard" }} />;
  }
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    initStore().then(() => setReady(true), (e) => setFailed(e instanceof Error ? e.message : "Could not open the local database."));
  }, []);
  if (failed) return <div className="p-8 text-center text-bad">Could not start: {failed}</div>;
  if (!ready)
    return (
      <div className="flex min-h-screen items-center justify-center text-muted">
        <Spinner className="mr-2" /> Loading StudyForge…
      </div>
    );
  return (
    <AppShell>
      <Routes />
    </AppShell>
  );
}
