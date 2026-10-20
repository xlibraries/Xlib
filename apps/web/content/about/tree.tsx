// The folders and files the About explorer shows, built from the sections and projects.
import type { ReactNode } from "react";
import { folder, textFile, type TreeNode } from "../../lib/file-tree";
import { ProjectCard } from "../../components/apps/about/Projects";
import { Resume } from "../../components/apps/about/Resume";
import { PROJECT_CATEGORIES, PROJECTS } from "./projects";
import {
  About, Certifications, FlamOverview, FlamReconstruction, FlamStack, FlamTalkingAvatar, FlamTracking, FrameworkBadges,
  GameDevelopment, LanguageBadges, PersistentSystems, Rcoem, Skills,
} from "./sections";

const ExperienceDoc = ({ children }: { children: ReactNode }) => (
  <ul className="w-10/12 mt-6 ml-0 md:ml-4">
    <li className="list-disc">{children}</li>
  </ul>
);

const FlamProjectDoc = ({ role, period, children }: { role: string; period: string; children: ReactNode }) => (
  <ExperienceDoc>
    <div className="text-lg md:text-xl font-bold">Flam (Flying Flamingos)</div>
    <div className="text-sm md:text-base">{role}</div>
    <div className="text-sm text-gray-400">{period}</div>
    {children}
  </ExperienceDoc>
);

const SkillsGroupDoc = ({ title, children }: { title: string; children: ReactNode }) => (
  <>
    <div className="font-medium text-xl md:text-2xl mt-6 mb-2">{title}</div>
    <div className="w-full md:w-10/12 flex flex-wrap justify-center items-start font-bold text-center px-2 mt-2">{children}</div>
  </>
);

export const fileTree: TreeNode = folder("Home", [
  folder("Experience", [
    folder("Flam", [
      textFile("Overview.md", () => (
        <ExperienceDoc>
          <FlamOverview />
          <FlamStack />
        </ExperienceDoc>
      )),
      textFile("Talking Avatar.md", () => (
        <FlamProjectDoc role="Senior Research & Development Engineer" period="Jan 2026 - Present"><FlamTalkingAvatar /></FlamProjectDoc>
      )),
      textFile("3D Reconstruction.md", () => (
        <FlamProjectDoc role="Research & Development Engineer" period="Jun 2025 - Aug 2025"><FlamReconstruction /></FlamProjectDoc>
      )),
      textFile("6-DoF Tracking (Patent Filed).md", () => (
        <FlamProjectDoc role="Research & Development Engineer - Visual Computing & AR" period="Jul 2024 - Dec 2025"><FlamTracking /></FlamProjectDoc>
      )),
    ]),
    textFile("Persistent Systems.md", () => <ExperienceDoc><PersistentSystems /></ExperienceDoc>),
    textFile("Game Development.md", () => <ExperienceDoc><GameDevelopment /></ExperienceDoc>),
  ], "./themes/Yaru/status/experience.svg"),
  folder("Education", [
    textFile("RCOEM.md", () => <ExperienceDoc><Rcoem /></ExperienceDoc>),
    textFile("Certifications.md", () => <ExperienceDoc><Certifications /></ExperienceDoc>),
  ], "./themes/Yaru/status/education.svg"),
  folder("Skills", [
    textFile("Overview.md", () => <Skills />),
    textFile("Languages & Core Tools.md", () => <SkillsGroupDoc title="Languages & Core Tools"><LanguageBadges /></SkillsGroupDoc>),
    textFile("Frameworks, Infra & Systems.md", () => <SkillsGroupDoc title="Frameworks, Infra & Systems"><FrameworkBadges /></SkillsGroupDoc>),
  ], "./themes/Yaru/status/skills.svg"),
  folder("Projects", PROJECT_CATEGORIES.map(category => folder(category,
    PROJECTS.filter(p => p.category === category).map(project =>
      textFile(project.name + ".md", () => <div className="w-full mt-4"><ProjectCard project={project} /></div>)
    )
  )), "./themes/Yaru/status/projects.svg"),
  { ...textFile("About Me.txt", () => <About />), sidebarIcon: "./themes/Yaru/status/about.svg" },
  { name: "Resume.pdf", kind: "pdf", render: () => <Resume />, sidebarIcon: "./themes/Yaru/status/download.svg" },
]);
