export type Route =
  | { name: "home" }
  | { name: "import"; id: string; legacy?: boolean }
  | { name: "not-found" };

export function readRoute(
  pathname = window.location.pathname,
  search = window.location.search,
): Route {
  const legacyId = new URLSearchParams(search).get("import");
  if (legacyId && (pathname === "/" || pathname === "")) {
    return { name: "import", id: legacyId, legacy: true };
  }

  if (pathname === "/" || pathname === "") return { name: "home" };

  const match = pathname.match(/^\/imports\/([^/]+)\/?$/);
  const importId = match?.[1];
  if (importId) {
    return { name: "import", id: decodeURIComponent(importId) };
  }

  return { name: "not-found" };
}

export function importPath(importId: string): string {
  return `/imports/${encodeURIComponent(importId)}`;
}

export function isPlainLeftClick(event: {
  metaKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  button: number;
}): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.shiftKey
  );
}
