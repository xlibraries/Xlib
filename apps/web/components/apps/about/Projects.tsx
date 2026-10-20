import { PROJECTS, type Project } from "../../../content/about/projects";

const TAG_STYLES: Record<string, string> = {
  "react": "border-sky-400 text-sky-300",
  "mysql": "border-blue-500 text-blue-300",
  "ocr": "border-purple-400 text-purple-300",
  "bedrock": "border-orange-400 text-orange-300",
  "c#": "border-violet-400 text-violet-300",
  "unity": "border-gray-300 text-gray-100",
  "playfab": "border-cyan-400 text-cyan-300",
  "google play services": "border-lime-400 text-lime-300",
  "ar": "border-pink-400 text-pink-300",
  "azure": "border-blue-400 text-blue-200",
  ".net": "border-indigo-400 text-indigo-300",
  "python": "border-yellow-400 text-yellow-200",
  "xgboost": "border-emerald-400 text-emerald-300",
  "finbert": "border-amber-400 text-amber-300",
  "fastapi": "border-teal-400 text-teal-300",
  "c++": "border-blue-400 text-blue-300",
  "computer vision": "border-fuchsia-400 text-fuchsia-300",
  "flask": "border-gray-300 text-gray-100",
  "next.js": "border-gray-300 text-gray-100",
  "typescript": "border-sky-500 text-sky-300",
  "supabase": "border-green-400 text-green-300",
};

export function Projects() {
  return (
    <>
      <div className=" font-medium relative text-xl md:text-2xl mt-2 md:mt-4 mb-4">
        Projects
        <div className="absolute pt-px bg-white mt-px top-full w-full">
          <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 left-full"></div>
          <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 right-full"></div>
        </div>
      </div>
      <a
        href="https://github.com/sponsors/xlibraries"
        target="_blank"
        rel="noreferrer noopener"
        className="my-4 w-5/6 md:w-3/4 border border-white border-opacity-20 rounded py-2 text-center text-sm hover:bg-white hover:bg-opacity-10"
      >
        Support my work on GitHub Sponsors
      </a>

      {PROJECTS.map((project) => <ProjectCard key={project.name} project={project} />)}
    </>
  );
}

export function ProjectCard({ project }: { project: Project }) {
  const githubUrl = project.githubLink || (project.link.includes("github.com") ? project.link : null);
  let githubUser: string | null = null;
  let githubRepo: string | null = null;
  if (githubUrl) {
    const parsed = githubUrl.replace("https://github.com/", "").split("/");
    githubUser = parsed[0] || null;
    githubRepo = parsed[1] || null;
  }
  return (
    <a
      href={project.link}
      target="_blank"
      rel="noreferrer noopener"
      className="flex w-full flex-col px-2 md:px-4"
    >
      <div className="w-full py-1 px-2 my-2 border border-gray-50 border-opacity-10 rounded hover:bg-gray-50 hover:bg-opacity-5 cursor-pointer">
        <div className="flex flex-wrap justify-between items-start md:items-center">
          <div className="flex justify-center items-center">
            <div className=" text-base md:text-lg mr-2">
              {project.name.toLowerCase()}
            </div>
            {githubUser && githubRepo ? (
              <iframe
                src={`https://ghbtns.com/github-btn.html?user=${githubUser}&repo=${githubRepo}&type=star&count=true`}
                style={{ border: 0 }}
                scrolling="no"
                width="150"
                height="20"
                loading="lazy"
                title={project.name.toLowerCase() + "-star"}
              ></iframe>
            ) : null}
          </div>
          <div className="w-full md:w-auto mt-1 md:mt-0 text-gray-300 font-light text-sm">
            {project.date}
          </div>
        </div>
        <ul className=" tracking-normal leading-tight text-sm font-light ml-2 md:ml-4 mt-1">
          {project.description.map((desc, index) => {
            return (
              <li key={index} className="list-disc mt-1 text-gray-100">
                {desc}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap items-start justify-start text-xs py-2">
          {project.domains
            ? project.domains.map((domain, index) => {
                const styleClass = TAG_STYLES[domain.toLowerCase()] || "border-gray-400 text-gray-200";

                return (
                  <span
                    key={index}
                    className={`px-1.5 py-0.5 w-max border ${styleClass} m-1 rounded-full`}
                  >
                    {domain}
                  </span>
                );
              })
            : null}
        </div>
      </div>
    </a>
  );
}
