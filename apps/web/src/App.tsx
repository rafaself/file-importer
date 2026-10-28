import { useCallback, useEffect, useState } from "react";
import { ImportDetails } from "./imports/ImportDetails";
import { ImportList } from "./imports/ImportList";
import { ImportUpload } from "./imports/ImportUpload";
import "./App.css";

function App() {
  const [selectedImportId, setSelectedImportId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("import"),
  );
  const [listRefreshToken, setListRefreshToken] = useState(0);

  const selectImport = useCallback((importId: string | null) => {
    setSelectedImportId(importId);
    const url = new URL(window.location.href);
    if (importId) url.searchParams.set("import", importId);
    else url.searchParams.delete("import");
    window.history.pushState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  useEffect(() => {
    const syncSelection = () => {
      setSelectedImportId(
        new URLSearchParams(window.location.search).get("import"),
      );
    };
    window.addEventListener("popstate", syncSelection);
    return () => window.removeEventListener("popstate", syncSelection);
  }, []);

  const handleImportAvailable = useCallback(
    (importId: string) => {
      setListRefreshToken((value) => value + 1);
      selectImport(importId);
    },
    [selectImport],
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(event) => {
            event.preventDefault();
            selectImport(null);
          }}
        >
          <span className="brand-mark" aria-hidden="true">
            F
          </span>
          <span>
            File Importer<span className="brand-period">.</span>
          </span>
        </a>
        <div className="topbar-meta">
          <span className="connection-dot" aria-hidden="true" />
          <span>Import workspace</span>
        </div>
      </header>

      <main className="dashboard">
        <section className="welcome-block">
          <div>
            <p className="eyebrow">
              CSV WORKSPACE{" "}
              <span className="welcome-sparkle" aria-hidden="true">
                ✳
              </span>
            </p>
            <h1>
              Make sense of your
              <br className="desktop-break" /> incoming data.
            </h1>
            <p className="welcome-copy">
              Upload a file, track its progress, and review every row in one
              place.
            </p>
          </div>
          <div className="welcome-aside" aria-hidden="true">
            <span className="aside-line aside-line-one" />
            <span className="aside-line aside-line-two" />
            <span className="aside-line aside-line-three" />
            <span className="aside-caption">
              One file at a time.
              <br />
              Every row accounted for.
            </span>
          </div>
        </section>

        <div
          className={`dashboard-grid ${selectedImportId ? "has-selection" : ""}`}
        >
          <div className="dashboard-main-column">
            <ImportUpload onImportAvailable={handleImportAvailable} />
            <ImportList
              key={listRefreshToken}
              selectedId={selectedImportId}
              onSelect={selectImport}
            />
          </div>
          <aside
            className="dashboard-detail-column"
            aria-label="Selected import details"
          >
            {selectedImportId ? (
              <ImportDetails
                key={selectedImportId}
                importId={selectedImportId}
                onClose={() => selectImport(null)}
              />
            ) : (
              <div className="selection-placeholder">
                <span className="placeholder-art" aria-hidden="true">
                  <span className="placeholder-sheet placeholder-sheet-back" />
                  <span className="placeholder-sheet placeholder-sheet-front">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                </span>
                <p className="eyebrow">Your next step</p>
                <h2>
                  Select an import
                  <br />
                  to see the details.
                </h2>
                <p>Row outcomes and validation notes will appear here.</p>
              </div>
            )}
          </aside>
        </div>
      </main>

      <footer className="site-footer">
        <span>File Importer</span>
        <span>Clear records. Calm workflows.</span>
      </footer>
    </div>
  );
}

export default App;
