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
              ? " text-ubt-blue bg-ub-orange bg-opacity-100 border-b-2 border-orange-500 "
              : " hover:bg-ub-warm-grey hover:bg-opacity-5 ") +
            " w-28 md:w-full md:pl-3 cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center"
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
              ? " text-ubt-blue bg-ub-orange bg-opacity-100 border-b-2 border-orange-500 "
              : " hover:bg-ub-warm-grey hover:bg-opacity-5 ") +
            " w-28 md:w-full md:pl-3 cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center"
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
              ? " text-ubt-blue bg-ub-orange bg-opacity-100 border-b-2 border-orange-500 "
              : " hover:bg-ub-warm-grey hover:bg-opacity-5 ") +
            " w-28 md:w-full md:pl-3 cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center"
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
              ? " text-ubt-blue bg-ub-orange bg-opacity-100 border-b-2 border-orange-500 "
              : " hover:bg-ub-warm-grey hover:bg-opacity-5 ") +
            " w-28 md:w-full md:pl-3 cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center"
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
              ? " text-ubt-blue bg-ub-orange bg-opacity-100 border-b-2 border-orange-500 "
              : " hover:bg-ub-warm-grey hover:bg-opacity-5 ") +
            " w-28 md:w-full md:pl-3 cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center"
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
              ? " text-ubt-blue bg-ub-orange bg-opacity-100 border-b-2 border-orange-500 "
              : " hover:bg-ub-warm-grey hover:bg-opacity-5 ") +
            " w-28 md:w-full md:pl-3 cursor-default outline-none py-1.5 focus:outline-none duration-100 my-0.5 flex justify-start items-center"
          }
        >
          <img
            className=" w-3 md:w-4"
            alt="aman's resume"
            src="./themes/Yaru/status/download.svg"
          />
          <span className=" ml-1 md:ml-2 text-gray-50 ">Resume</span>
        </div>
        <div className="my-0.5 w-28 md:w-full md:pl-3 py-1.5 flex justify-start items-center hover:bg-ub-warm-grey hover:bg-opacity-5 cursor-pointer">
          <img
            className="w-3 md:w-4"
            alt="aman's resume"
            src="./themes/Yaru/status/sponsor.svg"
          />
          <a
            rel="noreferrer"
            noopener="true"
            href="https://github.com/sponsors/xlibraries"
            target="_blank"
            className=" ml-1 md:ml-2 text-gray-50 "
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
        <div className="md:flex hidden flex-col w-1/4 md:w-1/5 text-sm overflow-y-auto window-sidebar">
          {this.renderNavLinks()}
        </div>
        <div onClick={this.showNavBar} className="md:hidden flex flex-col items-center justify-center absolute bg-ub-warm-grey rounded-full h-6 w-6 z-50 top-1 left-1">
          <div className=" w-3.5 border-t border-white"></div>
          <div className=" w-3.5 border-t border-white mt-1"></div>
          <div className=" w-3.5 border-t border-white mt-1"></div>
        </div>
        <div className={(this.state.navbar ? "  visible animate-sidebar-fade-in " : " invisible ") + " md:hidden flex flex-col w-2/3 bg-ub-cool-grey absolute z-40 text-sm overflow-y-auto window-sidebar"}>
          {this.renderNavLinks()}
        </div>
        <div className="flex-grow h-full overflow-y-auto bg-ub-grey">
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
          I'm a{" "}
          <span className="text-ubt-blue font-bold">Senior Research Engineer!</span>
        </div>
      </div>
      <div className=" mt-4 relative md:my-8 pt-px bg-white w-32 md:w-48">
        <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 left-0"></div>
        <div className="bg-white absolute rounded-full p-0.5 md:p-1 top-0 transform -translate-y-1/2 right-0"></div>
      </div>
      <ul className=" mt-4 leading-tight tracking-tight text-sm md:text-base w-5/6 md:w-3/4">
        <li className=" list-inside list-disc">
          I'm a <span className=" font-medium">Senior Research Engineer</span> at{" "}
          <a rel="noreferrer" target="_blank" href="https://flamapp.com/">
            Flam
          </a>
          , specializing in Visual Computing and AI. (Hit me up{" "}
          <a className=" underline" href="mailto:aman989308964@gmail.com">
            aman989308964@gmail.com
          </a>{" "}
          :) )
        </li>
        <li className=" list-inside list-disc mt-5">
          {" "}
          I focus on designing and implementing real-time visual perception platforms, specializing in visual SLAM, 3D reconstruction, and GPU-accelerated pipelines.
        </li>
        <li className=" list-inside list-disc mt-5">
          {" "}
          When I am not coding my next project, I like to go out for treks and play City Skylines.
        </li>
        <li className=" list-inside list-disc mt-5">
          {" "}
          I also have an interest in building games, extended reality applications, and robotics.
        </li>
      </ul>
    </>
  );
}

function Experience() {
  return (
    <>
      <div className=" font-medium relative text-2xl mt-2 md:mt-4 mb-4">
        Experience
        <div className="absolute pt-px bg-white w-full top-full"></div>
      </div>
      <ul className=" w-10/12  mt-4 ml-4 px-2  border-l-2 border-white">
        <li className="relative flex flex-col gap-y-1.5 mb-10">
          <div className="absolute h-3 w-3 -left-3.5 bg-white rounded-full top-1"></div>
          <div className="text-lg font-semibold text-gray-100">Flam</div>
          <div className="text-sm font-medium text-gray-300">Senior Research Engineer / Systems Developer / AI Engineer</div>
          <div className="text-xs text-gray-400">Jan 2026 - Present, Bengaluru, India</div>
          <div className="text-sm text-gray-200 mt-2">
            <ul className="list-disc list-inside space-y-1">
              <li>Leading the design and implementation of a modular real-time Visual SLAM and tracking engine in modern C++23.</li>
              <li>Engineered GPU-accelerated image processing pipelines for real-time tracking on mobile, browser, and desktop.</li>
              <li>Developed cross-platform visual SDKs (WASM, Android, iOS, macOS, Linux) under 100 KB per platform.</li>
            </ul>
          </div>
        </li>
        <li className="relative flex flex-col gap-y-1.5 mb-10">
          <div className="absolute h-3 w-3 -left-3.5 bg-white rounded-full top-1"></div>
          <div className="text-lg font-semibold text-gray-100">Flam</div>
          <div className="text-sm font-medium text-gray-300">Research Engineer / Systems Developer / AI Engineer</div>
          <div className="text-xs text-gray-400">Jul 2024 - Jan 2026, Bengaluru, India</div>
          <div className="text-sm text-gray-200 mt-2">
            <ul className="list-disc list-inside space-y-1">
              <li>Built end-to-end multi-view 3D reconstruction pipelines integrating feature matching and PnP pose estimation.</li>
              <li>Prototyped Gaussian splatting pipelines for neural scene representations with real-time rendering optimizations.</li>
              <li>Implemented platform bindings (JNI, iOS, WebAssembly) for consistent tracking logic across all devices.</li>
            </ul>
          </div>
        </li>
        <li className="relative flex flex-col gap-y-1.5 mb-10">
          <div className="absolute h-3 w-3 -left-3.5 bg-white rounded-full top-1"></div>
          <div className="text-lg font-semibold text-gray-100">Persistent Systems</div>
          <div className="text-sm font-medium text-gray-300">Software Engineer</div>
          <div className="text-xs text-gray-400">Jun 2022 - Sep 2024, Pune, India</div>
          <div className="text-sm text-gray-200 mt-2">
            <ul className="list-disc list-inside space-y-1">
              <li>Migrating the platform from legacy code (PHP5, Angular Js) to updated code (PHP8, Symfony, Angular13).</li>
              <li>Assisting the team in migration from AWS infrastructure to Azure, reducing cost per server by 20%.</li>
              <li>Improved angular routing and error log handling which reduced 150k bugs reported every week.</li>
            </ul>
          </div>
        </li>
      </ul>
    </>
  );
}

function Education() {
  return (
    <>
      <div className=" font-medium relative text-2xl mt-2 md:mt-4 mb-4">
        Education
        <div className="absolute pt-px bg-white w-full top-full"></div>
      </div>
      <ul className=" w-10/12  mt-4 ml-4 px-2  border-l-2 border-white">
        <li className="relative flex flex-col gap-y-1.5 mb-10">
          <div className="absolute h-3 w-3 -left-3.5 bg-white rounded-full top-1"></div>
          <div className="text-lg font-semibold text-gray-100">
            Shri Ramdeobaba College of Engineering and Management - RCOEM
          </div>
          <div className="text-sm font-medium text-gray-300">2018 - 2022</div>
          <div className="text-sm text-gray-200">
            Bachelor's of Engineering in Electronics
          </div>
          <div className="text-sm text-gray-200">CGPA &nbsp; 7.63/10.0</div>
          <div className="text-sm text-gray-200">Co-President: Technical Club RCOEM</div>
          <div className="text-sm text-gray-200">Member: Robotics Club RCOEM</div>
        </li>
      </ul>
    </>
  );
}

function Skills() {
  return (
    <>
      <div className=" font-medium relative text-2xl mt-2 md:mt-4 mb-4">
        Technical Skills
        <div className="absolute pt-px bg-white w-full top-full"></div>
      </div>
      <ul className=" tracking-tight text-sm md:text-base w-10/12 pt-px list-disc list-inside">
        <li className=" list-item text-ubt-blue font-medium mt-4">
          I've worked with a wide variety of programming languages & frameworks.
        </li>
        <li className=" list-item text-ubt-blue font-medium mt-4">
          {" "}
          My areas of expertise are{" "}
          <span className="text-white">
            Visual SLAM, 3D Reconstruction, C++23 & WebGPU!
          </span>
        </li>
      </ul>
      <div className=" w-full md:w-10/12 flex mt-4">
        <div className=" text-sm text-center w-1/2 font-bold border-r border-white">
          Languages & Tools
        </div>
        <div className=" text-sm text-center w-1/2 font-bold">
          Frameworks & Libraries
        </div>
      </div>
      <div className=" w-full md:w-10/12 flex justify-center mt-4">
        <div className=" flex flex-wrap justify-center items-start w-1/2 px-1">
          <img className="m-1" src="https://img.shields.io/badge/C%2B%2B-00599C?style=flat&logo=c%2B%2B&logoColor=white" alt="aman c++" />
          <img className="m-1" src="https://img.shields.io/badge/-C%23-239120?style=flat&logo=c-sharp&logoColor=white" alt="aman c-sharp" />
          <img className="m-1" src="https://img.shields.io/badge/-JavaScript-%23F7DF1C?style=flat&logo=javascript&logoColor=000" alt="aman javascript" />
          <img className="m-1" src="https://img.shields.io/badge/-TypeScript-007ACC?style=flat&logo=typescript&logoColor=white" alt="aman typescript" />
          <img className="m-1" src="https://img.shields.io/badge/-Python-3776AB?style=flat&logo=python&logoColor=white" alt="aman python" />
          <img className="m-1" src="https://img.shields.io/badge/-Git-F05032?style=flat&logo=git&logoColor=white" alt="aman git" />
          <img className="m-1" src="https://img.shields.io/badge/-OpenCV-5C3EE8?style=flat&logo=opencv&logoColor=white" alt="aman opencv" />
        </div>
        <div className=" flex flex-wrap justify-center items-start w-1/2 px-1">
          <img className="m-1" src="https://img.shields.io/badge/-Unity-000000?style=flat&logo=unity&logoColor=white" alt="aman unity" />
          <img className="m-1" src="https://img.shields.io/badge/-WebAssembly-654FF0?style=flat&logo=webassembly&logoColor=white" alt="aman wasm" />
          <img className="m-1" src="https://img.shields.io/badge/-WebGPU-red?style=flat" alt="aman webgpu" />
          <img className="m-1" src="https://img.shields.io/badge/-React-61DAFB?style=flat&logo=react&logoColor=black" alt="aman react" />
          <img className="m-1" src="https://img.shields.io/badge/-Node.js-339933?style=flat&logo=node.js&logoColor=white" alt="aman node" />
          <img className="m-1" src="https://img.shields.io/badge/-Azure-0089D6?style=flat&logo=microsoft-azure&logoColor=white" alt="aman azure" />
        </div>
      </div>
      <ul className=" tracking-tight text-sm md:text-base w-10/12 pt-px list-disc list-inside mt-4">
        <li className=" list-item text-ubt-blue font-medium mt-4">
          {" "}
          And of course, <span className="text-white">Linux</span> !{" "}
        </li>
      </ul>
    </>
  );
}

function Projects() {
  const project_list = [
    {
      name: "Xlib - Portfolio",
      date: "2021 - Present",
      link: "https://github.com/xlibraries/Xlib",
      description: [
        "A personal portfolio website simulating an Ubuntu desktop environment, built with React, Tailwind CSS, and Next.js.",
      ],
      domains: ["React", "Tailwind", "Next.js"],
    },
    {
      name: "Smart Onboarders",
      date: "Feb 2024",
      link: "https://github.com/xlibraries/SmartOnboaders",
      description: [
        "End-to-End Onboarding Platform with Gen-AI powered document processing and HRMS integration.",
      ],
      domains: ["React", "MySQL", "Bedrock"],
    },
    {
      name: "Pact and Promise: The Arcane Door",
      date: "Oct 2023 - Present",
      link: "https://github.com/xlibraries/FairyTail-VN-Jam",
      description: [
        "A Visual novel game with In-house text engine developed inside Unity.",
      ],
      domains: ["C#", "Unity"],
    },
    {
      name: "Lego Mini World",
      date: "Feb 2021",
      link: "https://xlibraries.itch.io/lego-mini-world",
      description: [
        "Explore the Lego World with various tasks and hidden levels.",
      ],
      domains: ["Unity", "C#"],
    },
  ];

  const tag_styles = {
    react: "border-sky-400 text-sky-300",
    mysql: "border-blue-500 text-blue-300",
    bedrock: "border-orange-400 text-orange-300",
    "c#": "border-violet-400 text-violet-300",
    unity: "border-gray-300 text-gray-100",
    tailwind: "border-teal-400 text-teal-300",
    "next.js": "border-gray-200 text-white",
  };

  return (
    <>
      <div className=" font-medium relative text-2xl mt-2 md:mt-4 mb-4">
        Projects
        <div className="absolute pt-px bg-white w-full top-full"></div>
      </div>
      <div className="flex flex-col gap-4">
        {project_list.map((project, index) => (
          <a
            key={index}
            href={project.link}
            target="_blank"
            rel="noreferrer"
            className="flex w-full flex-col px-4 py-2 border border-white border-opacity-20 hover:bg-white hover:bg-opacity-5 transition-all duration-300 rounded"
          >
            <div className="flex justify-between items-center">
              <span className="font-bold text-ubt-blue">{project.name}</span>
              <span className="text-xs text-gray-400">{project.date}</span>
            </div>
            <div className="text-sm text-gray-300 mt-1">
              {project.description.map((desc, i) => (
                <p key={i}>{desc}</p>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {project.domains.map((domain, i) => (
                <span
                  key={i}
                  className={`text-xs px-1.5 py-0.5 border rounded ${
                    tag_styles[domain.toLowerCase()] || "border-gray-500 text-gray-400"
                  }`}
                >
                  {domain}
                </span>
              ))}
            </div>
          </a>
        ))}
      </div>
    </>
  );
}

function Resume() {
  return (
    <iframe
      className="h-full w-full"
      src="./files/Aman-Agrawal-Resume.pdf"
      title="Aman Agrawal resume"
      frameBorder="0"
    ></iframe>
  );
}
