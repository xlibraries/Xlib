// @ts-nocheck
import { Component } from "react";
import ReactGA from "react-ga4";
import React from "react";
import pdfjsPackage from "pdfjs-dist/package.json";

const PDFJS_VERSION = pdfjsPackage.version;

export class AboutAman extends Component {
  constructor() {
    super();
    this.screens = {};
    this.state = {
      screen: () => {},
      active_screen: "about", // by default 'about' screen is active
      navbar: false,
    };
  }

  componentDidMount() {
    this.screens = {
      about: <About />,
      experience: <Experience />,
      education: <Education />,
      skills: <Skills />,
      projects: <Projects />,
      resume: <Resume />,
    };

    let lastVisitedScreen = localStorage.getItem("about-section");
    if (lastVisitedScreen === null || lastVisitedScreen === undefined) {
      lastVisitedScreen = "about";
    }

    // focus last visited screen
    this.changeScreen(document.getElementById(lastVisitedScreen));
  }

  changeScreen = (e) => {
    const screen = e.id || e.target.id;

    // store this state
    localStorage.setItem("about-section", screen);

    // google analytics
    ReactGA.send({
      hitType: "pageview",
      page: `/${screen}`,
      title: "Custom Title",
    });

    this.setState({
      screen: this.screens[screen],
      active_screen: screen,
    });
  };

  showNavBar = () => {
    this.setState({ navbar: !this.state.navbar });
  };

  renderNavLinks = () => {
    return (
      <>
        <div
          id="about"
          tabIndex="0"
          onFocus={this.changeScreen}
          className={
            (this.state.active_screen === "about"
              ? " bg-ub-orange bg-opacity-100 hover:bg-opacity-95"
              : " hover:bg-gray-50 hover:bg-opacity-5 ") +
            " w-28 md:w-full md:rounded-none rounded-sm cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center pl-2 md:pl-2.5"
          }
        >
          <img
            className=" w-3 md:w-4"
            alt="about aman"
            src="./themes/Yaru/status/about.svg"
          />
          <span className=" ml-1 md:ml-2 text-gray-50 ">About Me</span>
        </div>
        <div
          id="experience"
          tabIndex="0"
          onFocus={this.changeScreen}
          className={
            (this.state.active_screen === "experience"
              ? " bg-ub-orange bg-opacity-100 hover:bg-opacity-95"
              : " hover:bg-gray-50 hover:bg-opacity-5 ") +
            " w-28 md:w-full md:rounded-none rounded-sm cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center pl-2 md:pl-2.5"
          }
        >
          <img
            className=" w-3 md:w-4"
            alt="aman' experience"
            src="./themes/Yaru/status/experience.svg"
          />
          <span className=" ml-1 md:ml-2 text-gray-50 ">Experience</span>
        </div>
        <div
          id="education"
          tabIndex="0"
          onFocus={this.changeScreen}
          className={
            (this.state.active_screen === "education"
              ? " bg-ub-orange bg-opacity-100 hover:bg-opacity-95"
              : " hover:bg-gray-50 hover:bg-opacity-5 ") +
            " w-28 md:w-full md:rounded-none rounded-sm cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center pl-2 md:pl-2.5"
          }
        >
          <img
            className=" w-3 md:w-4"
            alt="aman' education"
            src="./themes/Yaru/status/education.svg"
          />
          <span className=" ml-1 md:ml-2 text-gray-50 ">Education</span>
        </div>
        <div
          id="skills"
          tabIndex="0"
          onFocus={this.changeScreen}
          className={
            (this.state.active_screen === "skills"
              ? " bg-ub-orange bg-opacity-100 hover:bg-opacity-95"
              : " hover:bg-gray-50 hover:bg-opacity-5 ") +
            " w-28 md:w-full md:rounded-none rounded-sm cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center pl-2 md:pl-2.5"
          }
        >
          <img
            className=" w-3 md:w-4"
            alt="aman' skills"
            src="./themes/Yaru/status/skills.svg"
          />
          <span className=" ml-1 md:ml-2 text-gray-50 ">Skills</span>
        </div>
        <div
          id="projects"
          tabIndex="0"
          onFocus={this.changeScreen}
          className={
            (this.state.active_screen === "projects"
              ? " bg-ub-orange bg-opacity-100 hover:bg-opacity-95"
              : " hover:bg-gray-50 hover:bg-opacity-5 ") +
            " w-28 md:w-full md:rounded-none rounded-sm cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center pl-2 md:pl-2.5"
          }
        >
          <img
            className=" w-3 md:w-4"
            alt="aman' projects"
            src="./themes/Yaru/status/projects.svg"
          />
          <span className=" ml-1 md:ml-2 text-gray-50 ">Projects</span>
        </div>
        <div
          id="resume"
          tabIndex="0"
          onFocus={this.changeScreen}
          className={
            (this.state.active_screen === "resume"
              ? " bg-ub-orange bg-opacity-100 hover:bg-opacity-95"
              : " hover:bg-gray-50 hover:bg-opacity-5 ") +
            " w-28 md:w-full md:rounded-none rounded-sm cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center pl-2 md:pl-2.5"
          }
        >
          <img
            className=" w-3 md:w-4"
            alt="aman's resume"
            src="./themes/Yaru/status/download.svg"
          />
          <span className=" ml-1 md:ml-2 text-gray-50 ">Resume</span>
        </div>
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
  };

  render() {
    return (
      <div className="w-full h-full flex bg-ub-cool-grey text-white select-none relative">
        <div className="md:flex hidden flex-col w-1/4 md:w-1/5 text-sm overflow-y-auto windowMainScreen border-r border-black">
          {this.renderNavLinks()}
        </div>
        <div
          onClick={this.showNavBar}
          className="md:hidden flex flex-col items-center justify-center absolute bg-ub-cool-grey rounded w-6 h-6 top-1 left-1"
        >
          <div className=" w-3.5 border-t border-white"></div>
          <div
            className=" w-3.5 border-t border-white"
            style={{ marginTop: "2pt", marginBottom: "2pt" }}
          ></div>
          <div className=" w-3.5 border-t border-white"></div>
          <div
            className={
              (this.state.navbar
                ? " visible animateShow z-30 "
                : " invisible ") +
              " md:hidden text-xs absolute bg-ub-cool-grey py-0.5 px-1 rounded-sm top-full mt-1 left-0 shadow border-black border border-opacity-20"
            }
          >
            {this.renderNavLinks()}
          </div>
        </div>
        <div className="flex flex-col w-full md:w-4/5 pt-8 md:pt-0 justify-start items-center flex-grow bg-ub-grey overflow-y-auto windowMainScreen">
          {this.state.screen}
        </div>
      </div>
    );
  }
}

export default AboutAman;

export const displayAboutAman = () => {
  return <AboutAman />;
};

function About() {
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
function Experience() {
  return (
    <>
      <div className=" font-medium relative text-xl md:text-2xl mt-4 mb-4">
        Experience
      </div>

      <ul className="w-10/12 mt-4 ml-0 md:ml-4">

        {/* FLAM — CURRENT ROLE */}

        <li className="list-disc mb-6">
          <div className="text-lg md:text-xl font-bold">
            Flam (Flamapp.ai)
          </div>
          <div className="text-sm md:text-base">
            Full-time · Bengaluru, Karnataka, India · On-site
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

          <div className="text-sm md:text-base font-bold mt-3">3D Reconstruction via Non-Markovian Process · 2025</div>
          <ul className="list-disc pl-5 mt-1">
            <li>
              Engineered the core multi-view reconstruction system, with a differentiable rendering pipeline for faster, more stable camera estimation and single-pass joint geometry and texture generation.
            </li>
            <li>
              Improved fidelity with a pretrained VAE and custom losses, reaching 0.3 px reprojection error and over 95% text recovery accuracy.
            </li>
          </ul>

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

          <ul className="list-disc pl-5 mt-2">
            <li>
              Tech stack: C++23, Python, CUDA, gRPC, OpenCV, differentiable rendering, Gaussian splatting, NeRF, WebGPU, WebAssembly, Emscripten, TypeScript.
            </li>
          </ul>
        </li>

        {/* FLYING FLAMINGOS — SIDE VENTURE */}

        <li className="list-disc mb-6">
          <div className="text-lg md:text-xl text-left font-bold leading-tight">
            Flying Flamingos
          </div>
          <div className="text-sm md:text-base">Founding Engineer · Advertising &amp; creative tech company</div>
          <div className="text-sm text-gray-400 mt-0.5">
            2024 - Present
          </div>
        </li>

        {/* PERSISTENT — PREVIOUS ROLE */}

        <li className="list-disc mb-6">
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
        </li>

        {/* GAME DEVELOPMENT — EARLY CAREER */}

        <li className="list-disc">
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
        </li>

      </ul>
    </>
  );
}
function Education() {
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
          <div className=" text-lg md:text-xl text-left font-bold leading-tight">
            Shri Ramdeobaba College of Engineering and Management - RCOEM
          </div>
          <div className=" text-sm text-gray-400 mt-0.5">2018 - 2022</div>
          <div className=" text-sm md:text-base">
            Bachelor's of Engineering in Electronics
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
        </li>
        <li className="list-disc mt-6">
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
        </li>
      </ul>
    </>
  );
}
function Skills() {
  return (
    <>
      <div className=" font-medium relative text-xl md:text-2xl mt-2 md:mt-4 mb-4">
        Technical Skills
        <div className="absolute pt-px bg-white mt-px top-full w-full">
          <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 left-full"></div>
          <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 right-full"></div>
        </div>
      </div>

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

            {/* Core Languages */}
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

          </div>
        </div>

        <div className="px-2 flex flex-wrap items-start w-1/2">
          <div className="flex flex-wrap justify-center items-start w-full mt-2">

            {/* Infra & Systems */}
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

function Projects() {
  const project_list = [
    {
      name: "Nifty 50 Direction Predictor",
      date: "Mar 2026 - Present",
      link: "https://xlibraries.github.io/algo-trading/",
      githubLink: "https://github.com/xlibraries/algo-trading",
      description: [
        "ML trading system that predicts whether each Nifty 50 stock closes up or down the next day, combining FinBERT news sentiment with technical indicators, with backtesting and a live dashboard.",
      ],
      domains: ["Python", "XGBoost", "FinBERT", "FastAPI", "React"],
    },
    {
      name: "OpenPano Studio",
      date: "Mar 2026 - Jun 2026",
      link: "https://github.com/xlibraries/OpenPano",
      description: [
        "Video-to-panorama app built on the open-source OpenPano C++ stitching engine (feature matching, homography estimation, blending), with a Flask backend, Hugin support, and a web viewer.",
      ],
      domains: ["C++", "Computer Vision", "Flask"],
    },
    {
      name: "Auction Duniya",
      date: "Feb 2026 - Present",
      link: "https://auction-duniya.vercel.app/",
      githubLink: "https://github.com/xlibraries/auction-duniya",
      description: [
        "Marketplace for verified bank-auction (SARFAESI) properties across India, with immersive panoramic property views.",
      ],
      domains: ["Next.js", "TypeScript", "Marketplace"],
    },
    {
      name: "Mundika",
      date: "Apr 2026 - Present",
      link: "https://xlibraries.github.io/Mundika/",
      githubLink: "https://github.com/xlibraries/Mundika",
      description: [
        "Local-first inventory, billing, and ledger app inspired by the Mundi script traders have used for generations.",
      ],
      domains: ["Next.js", "TypeScript", "Supabase"],
    },
    {
      name: "Smart Onboarders",
      date: "Feb 2024 - Feb 2024",
      link: "https://github.com/xlibraries/SmartOnboaders",
      description: [
        "End-to-End Onboarding Platform made for SemiColons(Annual Hackathon of Persistent Systems) for new hires, with Gen-AI powered document processing and HRMS integration.",
      ],
      domains: ["React", "MySQL", "OCR", "Bedrock"],
    },
    {
      name: "Turbo Trails",
      date: "Apr 2023 - Present",
      link: "https://github.com/xlibraries/funny-Racing",
      description: [
        "The game I am creating is an immersive journey through the evolution of vehicles across different eras and regions."+
        " Players assume the role of various vehicles, starting as a simple cart in ancient Mesopotamia and progressing through history as new vehicles are invented.",
      ],
      domains: ["C#", "Unity", "Playfab", "Google Play Services"],
    },
    {
      name: "Pact and Promise: The Arcane Door",
      date: "Nov 2023 - Dec 2023",
      link: "https://github.com/xlibraries/FairyTail-VN-Jam",
      description: [
        "A Visual Novel game made for FairyTail Visual novel game jam hostel on itch.io",
      ],
      domains: ["C#", "Unity"],
    },
    {
      name: "SAPA (Software As Product Augmentations)", //Software as product augmentations
      date: "Apr 2023 - Apr 2023",
      link: "https://github.com/xlibraries/Technothon-AR_marker",
      description: [
        "An augmented reality application developed for simulating environment for sales pitch, where 3D models stored in cloud storage.",
      ],
      domains: ["AR", "Azure", ".NET"],
    },
    {
      name: "The Lone Ember",
      date: "Jul 2021 - Jul 2021",
      link: "https://xlibraries.itch.io/the-lone-ember",
      description: [
        "The Lone Ember is a game of lone chances: each key you press can only be used once. Can you guide your little ember back home?",
      ],
      domains: ["Unity", "C#"],
    },
  ];

  const tag_styles = {
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

      {project_list.map((project, index) => {
        const githubUrl = project.githubLink || (project.link.includes("github.com") ? project.link : null);
        let githubUser = null;
        let githubRepo = null;
        if (githubUrl) {
          const parsed = githubUrl.replace("https://github.com/", "").split("/");
          githubUser = parsed[0] || null;
          githubRepo = parsed[1] || null;
        }
        return (
          <a
            key={index}
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
                      frameBorder="0"
                      scrolling="0"
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
                      const styleClass = tag_styles[domain.toLowerCase()] || "border-gray-400 text-gray-200";

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
      })}
    </>
  );
}
function Resume() {
  const containerRef = React.useRef(null);
  const canvasRefs = React.useRef([]);
  const pdfRef = React.useRef(null);
  const renderTokenRef = React.useRef(0);
  const [numPages, setNumPages] = React.useState(0);
  const [loadError, setLoadError] = React.useState(false);

  const renderAllPages = React.useCallback(async () => {
    if (!pdfRef.current || !containerRef.current || numPages === 0) return;

    const token = ++renderTokenRef.current;
    const containerWidth = Math.max((containerRef.current.clientWidth || 800) - 16, 280);
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
      if (token !== renderTokenRef.current) return;
      const page = await pdfRef.current.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRefs.current[pageNumber - 1];
      if (!canvas) continue;

      const context = canvas.getContext("2d");
      if (!context) continue;

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: context, viewport }).promise;
    }
  }, [numPages]);

  React.useEffect(() => {
    let mounted = true;

    const loadPdf = async () => {
      try {
        // Load pdf.js as a native module (same CDN as its worker): bundling its prebuilt
        // file through Next's dev webpack crashes with "defineProperty called on non-object"
        const pdfjsBase = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}`;
        const pdfjs = await import(/* webpackIgnore: true */ `${pdfjsBase}/legacy/build/pdf.min.mjs`);
        pdfjs.GlobalWorkerOptions.workerSrc = `${pdfjsBase}/build/pdf.worker.min.mjs`;
        const task = pdfjs.getDocument("./files/Aman-Agrawal-Resume.pdf");
        const pdf = await task.promise;
        if (!mounted) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
      } catch (error) {
        console.error("Resume preview failed:", error);
        setLoadError(true);
      }
    };

    loadPdf();
    return () => {
      mounted = false;
      renderTokenRef.current++;
    };
  }, []);

  React.useEffect(() => {
    renderAllPages();
  }, [numPages, renderAllPages]);

  React.useEffect(() => {
    const onResize = () => {
      renderAllPages();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderAllPages]);

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center px-4 text-center text-sm md:text-base">
        Unable to render resume preview.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto px-2 md:px-4 py-3">
      {Array.from({ length: numPages || 1 }).map((_, index) => (
        <canvas
          key={index}
          ref={(el) => {
            canvasRefs.current[index] = el;
          }}
          className="block w-full max-w-4xl mx-auto mb-4 bg-white rounded-sm"
          aria-label={`Resume page ${index + 1}`}
        />
      ))}
    </div>
  );
}
