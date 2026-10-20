// About Aman: an Ubuntu Files-style explorer of Aman's experience, education, skills, projects and resume,
// with a simplified sidebar view one click away. The text lives in content/about/.
import { useState } from "react";
import { Explorer } from "./Explorer";
import { SimplifiedView } from "./SimplifiedView";

type View = "explorer" | "simple";

function savedView(): View {
  try { return localStorage.getItem("about-view") === "simple" ? "simple" : "explorer"; } catch { return "explorer"; }
}

export default function AboutAman() {
  const [view, setView] = useState<View>(savedView);

  const choose = (next: View) => {
    try { localStorage.setItem("about-view", next); } catch { /* storage blocked */ }
    setView(next);
  };

  return view === "explorer"
    ? <Explorer onSimplify={() => choose("simple")} />
    : <SimplifiedView onExplorer={() => choose("explorer")} />;
}
