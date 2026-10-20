// The About app's simplified view: a sidebar of sections (a menu on small screens) and the chosen section.
import { useState, type ReactNode } from "react";
import { trackPageview } from "../../../lib/analytics";
import { About, Education, Experience, Skills } from "../../../content/about/sections";
import { Projects } from "./Projects";
import { Resume } from "./Resume";

const SECTIONS: { id: string; label: string; icon: string; alt: string; render: () => ReactNode }[] = [
  { id: "about", label: "About Me", icon: "./themes/Yaru/status/about.svg", alt: "about aman", render: () => <About /> },
  { id: "experience", label: "Experience", icon: "./themes/Yaru/status/experience.svg", alt: "aman' experience", render: () => <Experience /> },
  { id: "education", label: "Education", icon: "./themes/Yaru/status/education.svg", alt: "aman' education", render: () => <Education /> },
  { id: "skills", label: "Skills", icon: "./themes/Yaru/status/skills.svg", alt: "aman' skills", render: () => <Skills /> },
  { id: "projects", label: "Projects", icon: "./themes/Yaru/status/projects.svg", alt: "aman' projects", render: () => <Projects /> },
  { id: "resume", label: "Resume", icon: "./themes/Yaru/status/download.svg", alt: "aman's resume", render: () => <Resume /> },
];

function savedSection(): string {
  try {
    const saved = localStorage.getItem("about-section");
    return SECTIONS.some(s => s.id === saved) ? saved! : "about";
  } catch {
    return "about";
  }
}

export function SimplifiedView({ onExplorer }: { onExplorer(): void }) {
  const [active, setActive] = useState(savedSection);
  const [menuOpen, setMenuOpen] = useState(false);

  const show = (id: string) => {
    try { localStorage.setItem("about-section", id); } catch { /* storage blocked */ }
    trackPageview(`/about/${id}`);
    setActive(id);
  };

  // Rendered twice (sidebar + mobile menu); only the sidebar copy gets ids, so ids stay unique
  const navLinks = (withIds: boolean) => (
    <>
      {SECTIONS.map(section => (
        <div
          key={section.id}
          id={withIds ? section.id : undefined}
          data-screen={section.id}
          tabIndex={0}
          onFocus={() => show(section.id)}
          className={
            (active === section.id
              ? " bg-ub-orange bg-opacity-100 hover:bg-opacity-95"
              : " hover:bg-gray-50 hover:bg-opacity-5 ") +
            " w-28 md:w-full md:rounded-none rounded-sm cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center pl-2 md:pl-2.5"
          }
        >
          <img className=" w-3 md:w-4" alt={section.alt} src={section.icon} />
          <span className=" ml-1 md:ml-2 text-gray-50 ">{section.label}</span>
        </div>
      ))}
      <div className="my-1 w-28 md:w-full px-2 md:px-2.5">
        <a
          href="https://github.com/sponsors/xlibraries"
          target="_blank"
          rel="noreferrer noopener"
          className="block text-center text-xs rounded border border-white border-opacity-20 py-1 hover:bg-white hover:bg-opacity-10"
        >
          Sponsor
        </a>
      </div>
    </>
  );

  const current = SECTIONS.find(s => s.id === active) || SECTIONS[0];

  return (
    <div className="w-full h-full flex bg-ub-cool-grey text-white select-none relative">
      <button
        type="button"
        onClick={onExplorer}
        title="Explorer view"
        aria-label="Switch to explorer view"
        className="absolute top-1 right-1 z-10 w-7 h-7 flex items-center justify-center rounded hover:bg-white hover:bg-opacity-10"
      >
        <img className="w-5" src="./themes/Yaru/system/folder.png" alt="" />
      </button>
      <div className="md:flex hidden flex-col w-1/4 md:w-1/5 text-sm overflow-y-auto windowMainScreen border-r border-black">
        {navLinks(true)}
      </div>
      <div
        onClick={() => setMenuOpen(!menuOpen)}
        className="md:hidden flex flex-col items-center justify-center absolute bg-ub-cool-grey rounded w-6 h-6 top-1 left-1"
      >
        <div className=" w-3.5 border-t border-white"></div>
        <div className=" w-3.5 border-t border-white" style={{ marginTop: "2pt", marginBottom: "2pt" }}></div>
        <div className=" w-3.5 border-t border-white"></div>
        <div
          className={
            (menuOpen ? " visible animateShow z-30 " : " invisible ") +
            " md:hidden text-xs absolute bg-ub-cool-grey py-0.5 px-1 rounded-sm top-full mt-1 left-0 shadow border-black border border-opacity-20"
          }
        >
          {navLinks(false)}
        </div>
      </div>
      <div className="flex flex-col w-full md:w-4/5 pt-8 md:pt-0 justify-start items-center flex-grow bg-ub-grey overflow-y-auto windowMainScreen">
        {current.render()}
      </div>
    </div>
  );
}
