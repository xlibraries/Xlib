// @ts-nocheck
import { Component } from "react";
import ReactGA from "react-ga4";
import React from "react";

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
          At Flam, I work on <span className=" font-medium">Visual Computing and AR systems </span>
          that run across web, mobile, and desktop.
        </li>
        <li className=" mt-3 list-building">
          {" "}
          I enjoy owning the full journey: framing the challenge, shaping the architecture, and shipping the solution.
        </li>
        <li className=" mt-3 list-time">
          {" "}
          I care about speed, reliability, and making hard technology simple for users and teams.
        </li>
        <li className=" mt-3 list-star">
          {" "}
          I spend my spare time prototyping interactive experiences in XR, games, and robotics.
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
            Flam
          </div>
          <div className="text-sm md:text-base">
            Full-time · 1 yr 9 mos
          </div>
          <div className="text-sm md:text-base">
            Bengaluru, Karnataka, India · On-site
          </div>
          <div className="text-sm text-gray-300">
            LinkedIn helped me get this job.
          </div>

          <div className="text-sm md:text-base mt-2">
            Senior Research Engineer / Systems Developer / AI Engineer - Visual Computing & AR
          </div>
          <div className="text-sm text-gray-400">
            Jan 2026 - Present · 3 mos
          </div>

          <div className="text-sm md:text-base mt-2">
            Research Engineer / Systems Developer / AI Engineer - Visual Computing & AR
          </div>
          <div className="text-sm text-gray-400">
            Jul 2024 - Jan 2026 · 1 yr 7 mos
          </div>

          <div className="text-sm md:text-base mt-2">
            Research Engineer / Systems Developer - Visual Computing & AR
          </div>
          <div className="text-sm text-gray-400">
            Flam | Jul 2024 - Present | Bengaluru
          </div>

          <ul className="list-disc pl-5 mt-2">
            <li>
              Led the design and implementation of a modular real-time Visual SLAM and tracking engine in modern C++23, with deterministic state machines (IDLE / TRACKING / LOST), RAII-based resource management, and low-latency execution.
            </li>
            <li>
              Built end-to-end multi-view 3D reconstruction pipelines, integrating feature matching, PnP pose estimation, homography refinement, and sparse/dense reconstruction to generate high-fidelity scene geometry.
            </li>
            <li>
              Researched and prototyped Gaussian splatting pipelines for neural and implicit scene representations, optimizing memory layout, parameterization, and real-time rendering.
            </li>
            <li>
              Designed and shipped a cross-platform visual SDK targeting Web (WASM/WebGPU), Android, iOS, macOS, and Linux, all powered by a single C++ core engine and packaged under 100 KB per platform for fast load times and minimal integration overhead.
            </li>
            <li>
              Implemented platform bindings (JNI, iOS native, WebAssembly, desktop) enabling identical tracking, geometry, and optimization logic to run consistently across all devices.
            </li>
            <li>
              Engineered GPU-accelerated image processing pipelines (BRISK/ORB keypoints, custom shaders, compute kernels) for real-time tracking and feature extraction on mobile, browser, and desktop.
            </li>
            <li>
              Ported native research code to the browser using Emscripten, WebAssembly, WebGPU, and WebGL2, enabling interactive demos, reproducible experiments, and production-grade web deployments.
            </li>
            <li>
              Built extensible tooling and experiment frameworks to ensure reproducibility, benchmarking, and easy transition from research to product.
            </li>
            <li>
              Tech stack: C++23, OpenCV, PnP solvers, Gauss-Newton, Gaussian splatting, WebGPU, WebAssembly (WASM), Emscripten, WebGL2, TypeScript, BRISK/ORB, RAII, smart pointers.
            </li>
          </ul>
        </li>

        {/* PERSISTENT — PREVIOUS ROLE */}

        <li className="list-disc">
          <div className="text-lg md:text-xl text-left font-bold leading-tight">
            Persistent Systems
          </div>
          <div className="text-sm md:text-base">FullStack Developer</div>
          <div className="text-sm text-gray-400 mt-0.5">
            2021 - current, Pune, India
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
              application which reduced 150k bugs reported every week. This
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
              Solved all the Checkmarks High and improved the security. This
              involved addressing all high-priority issues identified by
              Checkmarx, implementing necessary fixes, and enhancing the
              overall security of the application.
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
            Co-President: Technical Club RCOEM
          </div>
          <div className="text-sm md:text-base">
            Member: Robotics Club RCOEM
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
          I build <strong className="text-ubt-gedit-orange">performance-critical systems</strong> 
          across Web, AR, and real-time environments.
        </li>
        <li className="list-arrow mt-4">
          My expertise lies in{" "}
          <strong className="text-ubt-gedit-orange">
            Computer Vision, WebAR Infrastructure, and Full-Stack Architecture
          </strong>
        </li>
        <li className="list-arrow mt-4">
          Strong focus on scalability, memory efficiency, and production reliability.
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
            <img className="m-1" src="https://img.shields.io/badge/C++-00599C?style=for-the-badge&logo=c%2B%2B&logoColor=white" alt="c++" />
            <img className="m-1" src="https://img.shields.io/badge/JavaScript-323330?style=for-the-badge&logo=javascript&logoColor=F7DF1E" alt="javascript" />
            <img className="m-1" src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="typescript" />
            <img className="m-1" src="https://img.shields.io/badge/PHP-777BB4?style=for-the-badge&logo=php&logoColor=white" alt="php" />
            <img className="m-1" src="https://img.shields.io/badge/C%23-239120?style=for-the-badge&logo=c-sharp&logoColor=white" alt="c#" />
            <img className="m-1" src="https://img.shields.io/badge/MySQL-005C84?style=for-the-badge&logo=mysql&logoColor=white" alt="mysql" />
            <img className="m-1" src="https://img.shields.io/badge/Git-F05033?style=for-the-badge&logo=git&logoColor=white" alt="git" />

          </div>
        </div>

        <div className="px-2 flex flex-wrap items-start w-1/2">
          <div className="flex flex-wrap justify-center items-start w-full mt-2">

            {/* Infra & Systems */}
            <img className="m-1" src="https://img.shields.io/badge/WebAR-000000?style=for-the-badge" alt="webar" />
            <img className="m-1" src="https://img.shields.io/badge/Computer%20Vision-8A2BE2?style=for-the-badge" alt="computer vision" />
            <img className="m-1" src="https://img.shields.io/badge/Unity-000000?style=for-the-badge&logo=unity&logoColor=white" alt="unity" />
            <img className="m-1" src="https://img.shields.io/badge/.NET-5C2D91?style=for-the-badge&logo=.net&logoColor=white" alt=".net" />
            <img className="m-1" src="https://img.shields.io/badge/Angular-DD0031?style=for-the-badge&logo=angular&logoColor=white" alt="angular" />
            <img className="m-1" src="https://img.shields.io/badge/Symfony-000000?style=for-the-badge&logo=symfony&logoColor=white" alt="symfony" />
            <img className="m-1" src="https://img.shields.io/badge/Azure-0072C6?style=for-the-badge&logo=microsoftazure&logoColor=white" alt="azure" />
            <img className="m-1" src="https://img.shields.io/badge/Performance%20Engineering-FF6F00?style=for-the-badge" alt="performance engineering" />

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
      name: "Auction Duniya",
      date: "2026 - Present",
      link: "https://auction-duniya.vercel.app/",
      description: [
        "Live deployment of Auction Duniya.",
      ],
      domains: ["Next.js", "TypeScript", "Marketplace"],
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
  return (
    <div className="w-full h-[82vh] md:h-full">
      <object
        data="./files/Aman-Agrawal-Resume.pdf#view=FitH"
        type="application/pdf"
        className="w-full h-full"
        aria-label="Aman Agrawal resume"
      >
        <iframe
          className="w-full h-full"
          src="./files/Aman-Agrawal-Resume.pdf#view=FitH"
          title="Aman Agrawal resume"
          frameBorder="0"
          loading="lazy"
        ></iframe>
      </object>
    </div>
  );
}
