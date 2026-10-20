// The About app's explorer view, styled like Ubuntu's Files app: places sidebar, breadcrumb, back/forward,
// folders as icons and files previewed inline. The tree itself is content/about/tree.tsx.
import React, { type KeyboardEvent, type ReactNode } from "react";
import { trackPageview } from "../../../lib/analytics";
import { resolvePath, validPath, type TreeNode } from "../../../lib/file-tree";
import { fileTree } from "../../../content/about/tree";

function TextFileIcon({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M11 4h18l10 10v30H11z" fill="#f2f2f2" />
      <path d="M29 4v10h10z" fill="#c8c8c8" />
      <g fill="#9a9a9a">
        <rect x="16" y="20" width="18" height="2" rx="1" />
        <rect x="16" y="25" width="18" height="2" rx="1" />
        <rect x="16" y="30" width="18" height="2" rx="1" />
        <rect x="16" y="35" width="11" height="2" rx="1" />
      </g>
    </svg>
  );
}

function PdfFileIcon({ size = 56 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path d="M11 4h18l10 10v30H11z" fill="#f2f2f2" />
      <path d="M29 4v10h10z" fill="#c8c8c8" />
      <rect x="11" y="29" width="28" height="11" fill="#e0443e" />
      <text x="25" y="37.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="sans-serif">PDF</text>
    </svg>
  );
}

function NodeIcon({ node, size = 56 }: { node: TreeNode; size?: number }) {
  if (node.kind === "folder") return <img src="./themes/Yaru/system/folder.png" alt="" style={{ width: size, height: size }} />;
  if (node.kind === "pdf") return <PdfFileIcon size={size} />;
  return <TextFileIcon size={size} />;
}

function SimplifiedViewIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" />
      <path d="M6 2.5v11M3 5.5h1.5M3 8h1.5M3 10.5h1.5" />
    </svg>
  );
}

function loadExplorerPath(): string[] {
  try {
    return validPath(fileTree, JSON.parse(localStorage.getItem("about-explorer-path") || "null"));
  } catch {
    return [];
  }
}

export function Explorer({ onSimplify }: { onSimplify(): void }) {
  // The app only renders in the browser (next/dynamic with ssr: false), so localStorage is readable here
  const [path, setPath] = React.useState<string[]>(loadExplorerPath);
  const [history, setHistory] = React.useState<{ back: string[][]; forward: string[][] }>({ back: [], forward: [] });


  const node = resolvePath(fileTree, path) || fileTree;

  const show = (next: string[]) => {
    setPath(next);
    try { localStorage.setItem("about-explorer-path", JSON.stringify(next)); } catch { /* storage blocked */ }
    trackPageview("/about/" + next.join("/"));
  };

  const navigate = (next: string[]) => {
    if (next.join("/") === path.join("/")) return;
    setHistory({ back: [...history.back, path], forward: [] });
    show(next);
  };

  const goBack = () => {
    if (!history.back.length) return;
    setHistory({ back: history.back.slice(0, -1), forward: [path, ...history.forward] });
    show(history.back[history.back.length - 1]);
  };

  const goForward = () => {
    if (!history.forward.length) return;
    setHistory({ back: [...history.back, path], forward: history.forward.slice(1) });
    show(history.forward[0]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    if ((e.altKey && e.key === "ArrowLeft") || e.key === "Backspace") { e.preventDefault(); goBack(); }
    if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); goForward(); }
  };

  const navButton = (label: string, onClick: () => void, disabled: boolean, glyph: ReactNode) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={(disabled ? "opacity-30 cursor-default " : "hover:bg-white hover:bg-opacity-10 ") + "w-8 h-8 flex-shrink-0 rounded-md flex items-center justify-center text-lg"}
    >
      {glyph}
    </button>
  );

  const sidebarItems = [
    { label: "Home", path: [], icon: "./themes/Yaru/system/user-home.png" },
    ...(fileTree.kind === "folder" ? fileTree.children : []).map(child => ({
      label: child.name, path: [child.name], icon: (child.kind === "folder" && child.icon) || child.sidebarIcon,
    })),
  ];

  return (
    <div className="w-full h-full flex flex-col text-white select-none outline-none" style={{ backgroundColor: "#242424" }} tabIndex={-1} onKeyDown={onKeyDown}>
      {/* Header bar: navigation, path, view switch */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-black border-opacity-60" style={{ backgroundColor: "#303030" }}>
        {navButton("Back", goBack, !history.back.length, "‹")}
        {navButton("Forward", goForward, !history.forward.length, "›")}
        <div className="flex-grow min-w-0 flex items-center overflow-x-auto windowMainScreen rounded-md bg-black bg-opacity-30 px-1 py-0.5 mx-1 text-sm whitespace-nowrap">
          {[{ name: "Home", path: [] }, ...path.map((name, i) => ({ name, path: path.slice(0, i + 1) }))].map((crumb, i, all) => (
            <React.Fragment key={crumb.path.join("/") || "home"}>
              {i > 0 && <span className="text-gray-500 px-0.5">/</span>}
              <button
                type="button"
                onClick={() => navigate(crumb.path)}
                className={(i === all.length - 1 ? "font-bold text-white " : "text-gray-300 ") + "flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white hover:bg-opacity-10"}
              >
                {i === 0 && <img src="./themes/Yaru/system/user-home.png" alt="" className="w-4 h-4" />}
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </div>
        <button
          type="button"
          onClick={onSimplify}
          title="Simplified view"
          aria-label="Switch to simplified view"
          className="w-8 h-8 flex-shrink-0 rounded-md flex items-center justify-center text-gray-200 hover:bg-white hover:bg-opacity-10"
        >
          <SimplifiedViewIcon />
        </button>
      </div>

      <div className="flex flex-grow overflow-hidden">
        {/* Places sidebar */}
        <div className="hidden sm:block w-44 flex-shrink-0 overflow-y-auto windowMainScreen py-2 border-r border-black border-opacity-40" style={{ backgroundColor: "#2a2a2a" }}>
          {sidebarItems.map(item => {
            const active = item.path.length === 0 ? path.length === 0 : path[0] === item.path[0];
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => navigate(item.path)}
                className={(active ? "bg-white bg-opacity-10 text-white " : "text-gray-300 hover:bg-white hover:bg-opacity-5 ") + "w-full flex items-center gap-2.5 px-4 py-1.5 text-sm text-left"}
              >
                <img src={item.icon || "./themes/Yaru/system/folder.png"} alt="" className="w-4 h-4" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* Folder contents or file preview */}
        {node.kind === "folder" ? (
          <div className="flex-grow flex flex-col overflow-hidden">
            <div className="flex-grow overflow-y-auto windowMainScreen p-3 flex flex-wrap content-start">
              {node.children.map(child => (
                <button
                  key={child.name}
                  type="button"
                  onClick={() => navigate([...path, child.name])}
                  className="w-24 md:w-28 m-1 p-2 rounded-lg flex flex-col items-center text-center hover:bg-white hover:bg-opacity-10 focus:bg-ub-orange focus:bg-opacity-30 outline-none"
                  title={child.name}
                >
                  <NodeIcon node={child} />
                  <span
                    className="mt-1 text-xs md:text-sm leading-tight break-words w-full"
                    style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                  >
                    {child.name}
                  </span>
                </button>
              ))}
            </div>
            <div className="px-3 py-1 text-xs text-gray-400 text-right border-t border-black border-opacity-40">
              {node.children.length} item{node.children.length === 1 ? "" : "s"}
            </div>
          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center overflow-y-auto windowMainScreen bg-ub-grey">
            {node.render()}
          </div>
        )}
      </div>
    </div>
  );
}
