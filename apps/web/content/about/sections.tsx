// Aman's write-ups for the About app: each section is shown in the simplified view and as files in the
// explorer (see tree.tsx). Edit the text here; the layout code lives in components/apps/about/.

export function About() {
  return (
    <>
      <div className="w-20 md:w-28 my-4 bg-white rounded-full">
        <img
          className="w-full"
          src="./images/logos/bitmoji.png"
          alt="Aman Agrawal Logo"
        />
      </div>
      <div className=" mt-4 md:mt-8 text-lg md:text-2xl text-center px-1">
        <div>
          my name is <span className="font-bold">Aman Agrawal</span> ,
        </div>
        <div className="font-normal ml-1">
          I turn{" "}
          <span className="text-pink-600 font-bold">complex technical ideas into usable products.</span>
        </div>
      </div>
      <div className=" mt-4 relative md:my-8 pt-px bg-white w-32 md:w-48">
        <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 left-0"></div>
        <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 right-0"></div>
      </div>
      <ul className=" mt-4 leading-tight tracking-tight text-sm md:text-base w-5/6 md:w-3/4 emoji-list">
        <li className=" list-pc">
          At Flam, I build <span className=" font-medium">generative AI and computer vision systems</span>{" "}
          (real-time talking avatars, 3D reconstruction, 6-DoF tracking) used by brands like Google, Samsung, YouTube, and Emirates.
        </li>
        <li className=" mt-3 list-building">
          {" "}
          I enjoy owning the full journey, from research and model work to distributed inference and cross-platform SDKs, with a patent filed along the way.
        </li>
        <li className=" mt-3 list-time">
          {" "}
          I care about speed and reliability: sub-1.2s avatar first frames, tracking SDKs under 260 KB, hard tech made simple to use.
        </li>
        <li className=" mt-3 list-star">
          {" "}
          Outside work I build ML trading systems, panorama tools, games, and AI agents. I started out in robotics (ABU Robocon 2020, top 16 in India).
        </li>
      </ul>
    </>
  );
}
export function Experience() {
  return (
    <>
      <div className=" font-medium relative text-xl md:text-2xl mt-4 mb-4">
        Experience
      </div>

      <ul className="w-10/12 mt-4 ml-0 md:ml-4">
        <li className="list-disc mb-6">
          <FlamOverview />
          <FlamTalkingAvatar />
          <FlamReconstruction />
          <FlamTracking />
          <FlamStack />
        </li>
        <li className="list-disc mb-6">
          <PersistentSystems />
        </li>
        <li className="list-disc">
          <GameDevelopment />
        </li>
      </ul>
    </>
  );
}

// Experience pieces, shared by the simplified view and the file explorer

export function FlamOverview() {
  return (
    <>
      <div className="text-lg md:text-xl font-bold">
        Flam (Flying Flamingos)
      </div>
      <div className="text-sm md:text-base">
        Founding Engineer · Full-time · Bengaluru, Karnataka, India · On-site
      </div>

      <div className="text-sm md:text-base mt-2">
        Senior Research &amp; Development Engineer
      </div>
      <div className="text-sm text-gray-400">
        Jan 2026 - Present
      </div>

      <div className="text-sm md:text-base mt-2">
        Research &amp; Development Engineer - Visual Computing &amp; AR
      </div>
      <div className="text-sm text-gray-400">
        Jul 2024 - Dec 2025
      </div>

      <div className="text-sm text-gray-300 mt-2">
        Systems deployed for global brands including Google, Samsung, Hyundai, YouTube, and Emirates, and used by a large share of Fortune 500 companies.
      </div>
    </>
  );
}

export function FlamTalkingAvatar() {
  return (
    <>
      <div className="text-sm md:text-base font-bold mt-3">Talking Avatar · 2026</div>
      <ul className="list-disc pl-5 mt-1">
        <li>
          Architected and deployed the end-to-end infrastructure for a real-time talking avatar system, built on gRPC-based distributed inference.
        </li>
        <li>
          Fine-tuned and productionized the models, reaching under 1.2 s time-to-first-frame on dual RTX 4090s with scalable 1080p-4K output.
        </li>
        <li>
          Designed a multi-model batching pipeline that raised throughput and brought generation cost below $0.26 per minute.
        </li>
      </ul>
    </>
  );
}

export function FlamReconstruction() {
  return (
    <>
      <div className="text-sm md:text-base font-bold mt-3">3D Reconstruction via Non-Markovian Process · 2025</div>
      <ul className="list-disc pl-5 mt-1">
        <li>
          Engineered the core multi-view reconstruction system, with a differentiable rendering pipeline for faster, more stable camera estimation and single-pass joint geometry and texture generation.
        </li>
        <li>
          Improved fidelity with a pretrained VAE and custom losses, reaching 0.3 px reprojection error and over 95% text recovery accuracy.
        </li>
      </ul>
    </>
  );
}

export function FlamTracking() {
  return (
    <>
      <div className="text-sm md:text-base font-bold mt-3">Differentiable Keypoints &amp; 6-DoF Tracking (Patent Filed) · 2024-2025</div>
      <ul className="list-disc pl-5 mt-1">
        <li>
          Co-developed (equal ownership) a production SDK for real-time 6-DoF pose estimation, with a differentiable keypoint pipeline that outperforms ORB, SIFT, and BRISK, plus ICP-based refinement.
        </li>
        <li>
          Built the modular C++23 Visual SLAM and tracking engine behind it, with deterministic tracking states, SIMD-optimized paths, and low-latency execution.
        </li>
        <li>
          Shipped it cross-platform from one C++ core: Web (WASM/WebGPU), Android, iOS, macOS, and Linux, optimized for edge deployment under 260 KB.
        </li>
      </ul>
    </>
  );
}

export function FlamStack() {
  return (
    <>
      <ul className="list-disc pl-5 mt-2">
        <li>
          Tech stack: C++23, Python, CUDA, gRPC, OpenCV, differentiable rendering, Gaussian splatting, NeRF, WebGPU, WebAssembly, Emscripten, TypeScript.
        </li>
      </ul>
    </>
  );
}

export function PersistentSystems() {
  return (
    <>
      <div className="text-lg md:text-xl text-left font-bold leading-tight">
        Persistent Systems
      </div>
      <div className="text-sm md:text-base">Full Stack Developer</div>
      <div className="text-sm text-gray-400 mt-0.5">
        Dec 2021 - Sep 2024, Pune, India
      </div>
      <div className="text-sm md:text-base font-bold mt-1">CCH-CPELink</div>

      <ul className="list-disc pl-5">
        <li>
          Migrating the platform from legacy code (PHP5, Angular Js) to
          updated code (PHP8, Symfony, Angular13). This involves
          leveraging the new features and optimizations in PHP8 such as
          named arguments, union types, attributes, constructor property
          promotion, match expression, nullsafe operator, and JIT. The
          frontend is refactored with Angular13, taking advantage of its
          advancements in Typescript, NodeJs, and Angular CLI versions.
          Symfony is integrated for better web application development,
          utilizing its set of reusable PHP components.
        </li>
        <li>
          Assisting the team in migration from AWS infrastructure to Azure.
          This includes planning the migration strategy, setting up the
          Azure environment, and transferring data securely and efficiently.
          A significant contribution was the migration from MySQL Single
          server to flexible server, which allowed for the configuration of
          I/Os and other parameters, resulting in reducing the cost per
          server by 20%.
        </li>
        <li>
          Improved angular routing and error log handling throughout the
          application, cutting around 150k error logs every week. This
          involved optimizing the routing logic and implementing a robust
          error handling mechanism to reduce the load on db servers. Also,
          fixed code structure and introduced practice to improve the code
          quality resulting in Sonarlint and Checkmarks rating from E to B
          in a single quarter.
        </li>
        <li>
          Improved the efficiency of the reports in the application. This
          involved analyzing the existing reports, identifying areas for
          improvement, and implementing optimizations to enhance report
          generation speed and accuracy. Techniques such as establishing a
          consistent reporting schedule, working on data visualization,
          automating data collection, starting with some goal metrics, and
          centralizing data were used to improve the reporting process.
        </li>
        <li>
          Wrote a custom bash script for cleaning up old unused Bitbucket
          branches. This script automates the process of identifying and
          deleting branches that are no longer in use, keeping the
          repository clean and manageable. As an active code reviewer, I
          examine the code changes made by peers, provide constructive
          feedback, and ensure the code adheres to the project&apos;s coding
          standards and guidelines.
        </li>
        <li>
          Solved all the Checkmarx High issues and improved security,
          replaced hardcoded configuration with an environment-driven
          setup, and resolved multiple Severity-1 production incidents in
          enterprise systems.
        </li>
        <li>
          Led Unity/XR prototypes in internal hackathons (Technothon,
          SemiColons) to support sales initiatives.
        </li>
      </ul>
    </>
  );
}

export function GameDevelopment() {
  return (
    <>
      <div className="text-lg md:text-xl text-left font-bold leading-tight">
        Game Developer &amp; Level Designer
      </div>
      <div className="text-sm md:text-base">Multiple studios</div>
      <div className="text-sm text-gray-400 mt-0.5">
        Mar 2021 - Feb 2022
      </div>
      <ul className="list-disc pl-5">
        <li>
          Bharatiya Gaming Company: designed game levels and mechanics for mobile games.
        </li>
        <li>
          GamerGage Studio &amp; Chessegy: developed hyper-casual and chess games in Unity3D.
        </li>
      </ul>
    </>
  );
}

export function Education() {
  return (
    <>
      <div className=" font-medium relative text-xl md:text-2xl mt-2 md:mt-4 mb-4">
        Education
        <div className="absolute pt-px bg-white mt-px top-full w-full">
          <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 left-full"></div>
          <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 right-full"></div>
        </div>
      </div>
      <ul className=" w-10/12 mt-4 ml-0 md:ml-4 px-0 md:px-1">
        <li className="list-disc">
          <Rcoem />
        </li>
        <li className="list-disc mt-6">
          <Certifications />
        </li>
      </ul>
    </>
  );
}

export function Rcoem() {
  return (
    <>
      <div className=" text-lg md:text-xl text-left font-bold leading-tight">
        Shri Ramdeobaba College of Engineering and Management - RCOEM
      </div>
      <div className=" text-sm text-gray-400 mt-0.5">2018 - 2022</div>
      <div className=" text-sm md:text-base">
        Bachelor of Engineering in Electronics Engineering
      </div>
      <div className="text-sm text-gray-300 font-bold mt-1">
        CGPA &nbsp; 7.63/10.0
      </div>
      <div className="text-sm md:text-base">
        President: Technical Club RCOEM (2020 - 2022)
      </div>
      <div className="text-sm md:text-base">
        Member: Robotics Club RCOEM (2019 - 2022)
      </div>
      <div className="text-sm md:text-base">
        16th in India: ABU Robocon 2020 (national virtual ranking)
      </div>
      <div className="text-sm md:text-base">
        Third place: Autobot Robotics Competition 2020
      </div>
      <div className="text-sm md:text-base">
        Member: .NET Foundation (2021)
      </div>
    </>
  );
}

export function Certifications() {
  return (
    <>
      <div className=" text-lg md:text-xl text-left font-bold leading-tight">
        Certifications
      </div>
      <div className="text-sm md:text-base mt-1">
        Microsoft Identity Platform: Workshop Champ 2022 (Microsoft)
      </div>
      <div className="text-sm md:text-base">
        Developing Microsoft Azure Solutions (Microsoft, 2022)
      </div>
      <div className="text-sm md:text-base">
        Game Design and Development Specialization (Michigan State University, 2020)
      </div>
      <div className="text-sm md:text-base">
        Rapid Gameplay Prototyping (Unity Technologies, 2020)
      </div>
    </>
  );
}

export function Skills() {
  return (
    <>
      <div className=" font-medium relative text-xl md:text-2xl mt-2 md:mt-4 mb-4">
        Technical Skills
        <div className="absolute pt-px bg-white mt-px top-full w-full">
          <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 left-full"></div>
          <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 right-full"></div>
        </div>
      </div>

      <SkillsIntro />

      <div className="w-full md:w-10/12 flex mt-6">
        <div className=" text-sm text-center md:text-base w-1/2 font-bold">
          Languages & Core Tools
        </div>
        <div className=" text-sm text-center md:text-base w-1/2 font-bold">
          Frameworks, Infra & Systems
        </div>
      </div>

      <div className="w-full md:w-10/12 flex justify-center items-start font-bold text-center">
        <div className="px-2 w-1/2">
          <div className="flex flex-wrap justify-center items-start w-full mt-2">

            <LanguageBadges />
          </div>
        </div>

        <div className="px-2 flex flex-wrap items-start w-1/2">
          <div className="flex flex-wrap justify-center items-start w-full mt-2">

            <FrameworkBadges />
          </div>
        </div>
      </div>

      <ul className=" tracking-tight text-sm md:text-base w-10/12 emoji-list mt-4">
        <li className="list-arrow mt-4">
          Comfortable operating at the intersection of product thinking, deep tech, and system design.
        </li>
      </ul>
    </>
  );
}

export function SkillsIntro() {
  return (
    <>
      <ul className=" tracking-tight text-sm md:text-base w-10/12 emoji-list">
        <li className="list-arrow mt-4">
          I build <strong className="text-ubt-gedit-orange">performance-critical systems</strong>{" "}
          across generative AI, AR, and real-time environments.
        </li>
        <li className="list-arrow mt-4">
          My expertise lies in{" "}
          <strong className="text-ubt-gedit-orange">
            Computer Vision, 3D Reconstruction &amp; SLAM, Generative AI Infrastructure, and Full-Stack Architecture
          </strong>
        </li>
        <li className="list-arrow mt-4">
          Strong focus on GPU performance, scalability, memory efficiency, and production reliability.
        </li>
      </ul>
    </>
  );
}

export function LanguageBadges() {
  return (
    <>
      <img className="m-1" src="https://img.shields.io/badge/C++23-00599C?style=for-the-badge&logo=c%2B%2B&logoColor=white" alt="c++" />
      <img className="m-1" src="https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="python" />
      <img className="m-1" src="https://img.shields.io/badge/CUDA-76B900?style=for-the-badge&logo=nvidia&logoColor=white" alt="cuda" />
      <img className="m-1" src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="typescript" />
      <img className="m-1" src="https://img.shields.io/badge/JavaScript-323330?style=for-the-badge&logo=javascript&logoColor=F7DF1E" alt="javascript" />
      <img className="m-1" src="https://img.shields.io/badge/C%23-239120?style=for-the-badge&logo=c-sharp&logoColor=white" alt="c#" />
      <img className="m-1" src="https://img.shields.io/badge/PHP-777BB4?style=for-the-badge&logo=php&logoColor=white" alt="php" />
      <img className="m-1" src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="docker" />
      <img className="m-1" src="https://img.shields.io/badge/Linux-FCC624?style=for-the-badge&logo=linux&logoColor=black" alt="linux" />
      <img className="m-1" src="https://img.shields.io/badge/Git-F05033?style=for-the-badge&logo=git&logoColor=white" alt="git" />
    </>
  );
}

export function FrameworkBadges() {
  return (
    <>
      <img className="m-1" src="https://img.shields.io/badge/OpenCV-5C3EE8?style=for-the-badge&logo=opencv&logoColor=white" alt="opencv" />
      <img className="m-1" src="https://img.shields.io/badge/Computer%20Vision-8A2BE2?style=for-the-badge" alt="computer vision" />
      <img className="m-1" src="https://img.shields.io/badge/SLAM%20%26%203D%20Reconstruction-0F766E?style=for-the-badge" alt="slam and 3d reconstruction" />
      <img className="m-1" src="https://img.shields.io/badge/WebGPU-005A9C?style=for-the-badge" alt="webgpu" />
      <img className="m-1" src="https://img.shields.io/badge/WebAssembly-654FF0?style=for-the-badge&logo=webassembly&logoColor=white" alt="webassembly" />
      <img className="m-1" src="https://img.shields.io/badge/gRPC-244C5A?style=for-the-badge" alt="grpc" />
      <img className="m-1" src="https://img.shields.io/badge/Next.js-000000?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="next.js" />
      <img className="m-1" src="https://img.shields.io/badge/Unity-000000?style=for-the-badge&logo=unity&logoColor=white" alt="unity" />
      <img className="m-1" src="https://img.shields.io/badge/.NET-5C2D91?style=for-the-badge&logo=.net&logoColor=white" alt=".net" />
      <img className="m-1" src="https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white" alt="angular" />
      <img className="m-1" src="https://img.shields.io/badge/Azure-0072C6?style=for-the-badge&logo=microsoftazure&logoColor=white" alt="azure" />
    </>
  );
}
