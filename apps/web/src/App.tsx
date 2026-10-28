import { useCallback, useEffect, useRef, useState } from "react";
import { ImportDetails } from "./imports/ImportDetails";
import { ImportList } from "./imports/ImportList";
import { ImportUpload } from "./imports/ImportUpload";
import {
  importPath,
  isPlainLeftClick,
  readRoute,
  type Route,
} from "./navigation";
import "./App.css";

function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [uploadKey, setUploadKey] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uploadBusyRef = useRef(false);

  const syncRoute = useCallback(() => {
    setRoute(readRoute());
  }, []);

  const navigate = useCallback((path: string) => {
    const current = `${window.location.pathname}${window.location.search}`;
    if (current !== path) window.history.pushState({}, "", path);
    setRoute(readRoute());
  }, []);

  useEffect(() => {
    const current = readRoute();
    if (current.name === "import" && current.legacy) {
      window.history.replaceState({}, "", importPath(current.id));
      setRoute({ name: "import", id: current.id });
    }
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, [syncRoute]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || uploadKey === 0 || dialog.open) return;
    dialog.showModal();
  }, [uploadKey]);

  const setUploadBusy = useCallback((busy: boolean) => {
    uploadBusyRef.current = busy;
  }, []);

  function openImportDialog() {
    setUploadKey((value) => value + 1);
  }

  function closeImportDialog() {
    dialogRef.current?.close();
  }

  function openImport(importId: string) {
    uploadBusyRef.current = false;
    closeImportDialog();
    navigate(importPath(importId));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            if (!isPlainLeftClick(event)) return;
            event.preventDefault();
            navigate("/");
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>
            File Importer<span className="brand-period">.</span>
          </span>
        </a>
      </header>

      <main className="page">
        {route.name === "home" ? (
          <ImportList onOpen={openImport} onRequestImport={openImportDialog} />
        ) : route.name === "import" ? (
          <ImportDetails
            key={route.id}
            importId={route.id}
            onBack={() => navigate("/")}
          />
        ) : (
          <section className="panel not-found">
            <h1>Page not found</h1>
            <p>That address is not part of the importer.</p>
            <a
              className="text-button"
              href="/"
              onClick={(event) => {
                if (!isPlainLeftClick(event)) return;
                event.preventDefault();
                navigate("/");
              }}
            >
              Back to imports
            </a>
          </section>
        )}
      </main>

      <dialog
        ref={dialogRef}
        className="import-dialog"
        aria-labelledby="upload-title"
        onCancel={(event) => {
          if (uploadBusyRef.current) event.preventDefault();
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current && !uploadBusyRef.current) {
            closeImportDialog();
          }
        }}
      >
        {uploadKey > 0 && (
          <ImportUpload
            key={uploadKey}
            onAccepted={openImport}
            onOpenImport={openImport}
            onDismiss={() => {
              if (!uploadBusyRef.current) closeImportDialog();
            }}
            onBusyChange={setUploadBusy}
          />
        )}
      </dialog>

      <footer className="site-footer">
        <span>File Importer</span>
        <span>Clear records. Calm workflows.</span>
      </footer>
    </div>
  );
}

export default App;
