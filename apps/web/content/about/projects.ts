// Side projects, shown in About → Projects (grouped by category in the explorer).

export interface Project {
  name: string;
  category: (typeof PROJECT_CATEGORIES)[number];
  date: string;
  link: string;
  githubLink?: string;
  description: string[];
  domains: string[];
}

export const PROJECT_CATEGORIES = ["AI & Data", "Computer Vision & AR", "Web Apps", "Games"] as const;

export const PROJECTS: Project[] = [
  {
    name: "Nifty 50 Direction Predictor",
    category: "AI & Data",
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
    category: "Computer Vision & AR",
    date: "Mar 2026 - Jun 2026",
    link: "https://github.com/xlibraries/OpenPano",
    description: [
      "Video-to-panorama app built on the open-source OpenPano C++ stitching engine (feature matching, homography estimation, blending), with a Flask backend, Hugin support, and a web viewer.",
    ],
    domains: ["C++", "Computer Vision", "Flask"],
  },
  {
    name: "Auction Duniya",
    category: "Web Apps",
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
    category: "Web Apps",
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
    category: "AI & Data",
    date: "Feb 2024 - Feb 2024",
    link: "https://github.com/xlibraries/SmartOnboaders",
    description: [
      "End-to-End Onboarding Platform made for SemiColons(Annual Hackathon of Persistent Systems) for new hires, with Gen-AI powered document processing and HRMS integration.",
    ],
    domains: ["React", "MySQL", "OCR", "Bedrock"],
  },
  {
    name: "Turbo Trails",
    category: "Games",
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
    category: "Games",
    date: "Nov 2023 - Dec 2023",
    link: "https://github.com/xlibraries/FairyTail-VN-Jam",
    description: [
      "A Visual Novel game made for FairyTail Visual novel game jam hostel on itch.io",
    ],
    domains: ["C#", "Unity"],
  },
  {
    name: "SAPA (Software As Product Augmentations)",
    category: "Computer Vision & AR", //Software as product augmentations
    date: "Apr 2023 - Apr 2023",
    link: "https://github.com/xlibraries/Technothon-AR_marker",
    description: [
      "An augmented reality application developed for simulating environment for sales pitch, where 3D models stored in cloud storage.",
    ],
    domains: ["AR", "Azure", ".NET"],
  },
  {
    name: "The Lone Ember",
    category: "Games",
    date: "Jul 2021 - Jul 2021",
    link: "https://xlibraries.itch.io/the-lone-ember",
    description: [
      "The Lone Ember is a game of lone chances: each key you press can only be used once. Can you guide your little ember back home?",
    ],
    domains: ["Unity", "C#"],
  },
];
