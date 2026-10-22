import dynamic from 'next/dynamic';
import { createElement, type ComponentType } from 'react';
import type { AppProps } from '@xlibraries/app-sdk';

// Every app is a component that takes { host } (see packages/app-sdk); its code is downloaded the first
// time its window opens
const AppLoading = () => createElement('div', { className: 'w-full h-full flex items-center justify-center text-gray-400 text-sm' }, 'Loading…');
const lazyApp = (load: () => Promise<{ default: ComponentType<AppProps> }>): ComponentType<AppProps> =>
    dynamic(load, { ssr: false, loading: AppLoading });

const displayTerminal = lazyApp(async () => {
    const [{ createTerminal }, { terminal }] = await Promise.all([import('@xlibraries/terminal'), import('./content/terminal')]);
    return { default: createTerminal(terminal) };
});
const displaySettings = lazyApp(() => import('./components/apps/settings'));

const displayBrave = lazyApp(async () => {
    const [{ createBrowser }, { browser }] = await Promise.all([import('@xlibraries/browser'), import('./content/browser')]);
    return { default: createBrowser(browser) };
});
const displayTerminalCalc = lazyApp(() => import('@xlibraries/terminal').then(m => ({ default: m.Calc })));
const displayAboutAman = lazyApp(() => import('./components/apps/about'));
const displaySideQuests = lazyApp(() => import('./components/apps/side-quests'));
const displayVsCode = lazyApp(() => import('./components/apps/vscode'));
const displayMusic = lazyApp(async () => {
    const [{ createMusic }, { default: playlists }] = await Promise.all([import('@xlibraries/music'), import('./data/music-playlists.json')]);
    return { default: createMusic({ playlists, snapshotUrl: './music/snapshot.json' }) };
});
const displayTodoist = lazyApp(() => import('./components/apps/todoist'));
const displayTrash = lazyApp(() => import('./components/apps/trash'));
const displayGedit = lazyApp(() => import('./components/apps/gedit'));
const displayArcade = lazyApp(() => import('@xlibraries/arcade').then(m => ({ default: m.createArcade({ baseUrl: '/arcade', leaderboardUrl: '/api/arcade/leaderboard' }) })));
const displayBotLab = lazyApp(() => Promise.all([import('@xlibraries/bot-lab'), import('./lib/bot-lab-client')]).then(([m, c]) => ({ default: m.createBotLab({ compile: c.compileSketch, compilerAvailable: c.compilerAvailable }) })));

export interface AppConfig {
    id: string;
    title: string;
    icon: string;
    disabled: boolean;
    favourite: boolean;
    desktop_shortcut: boolean;
    screen: ComponentType<AppProps>;
}

const apps: AppConfig[] = [
    {
        id: "brave",
        title: "Brave",
        icon: './themes/Yaru/apps/brave.png',
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: displayBrave,
    },
    {
        id: "calc",
        title: "Calc",
        icon: './themes/Yaru/apps/calc.png',
        disabled: false,
        favourite: true,
        desktop_shortcut: false,
        screen: displayTerminalCalc,
    },
    {
        id: "about-aman",
        title: "About Aman",
        icon: './themes/Yaru/system/user-home.png',
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: displayAboutAman,
    },
    {
        id: "side-quests",
        title: "Side Quests",
        icon: './themes/Yaru/apps/side-quests.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: displaySideQuests, // Life outside work: travel map, quests, hobbies
    },
    {
        id: "vscode",
        title: "Visual Studio Code",
        icon: './themes/Yaru/apps/vscode.png',
        disabled: false,
        favourite: true,
        desktop_shortcut: false,
        screen: displayVsCode,
    },
    {
        id: "terminal",
        title: "Terminal",
        icon: './themes/Yaru/apps/bash.png',
        disabled: false,
        favourite: true,
        desktop_shortcut: false,
        screen: displayTerminal,
    },
    {
        id: "music",
        title: "Music",
        icon: './themes/Yaru/apps/music.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: false,
        screen: displayMusic, // Ad-free SomaFM radio, no signup
    },
    {
        id: "settings",
        title: "Settings",
        icon: './themes/Yaru/apps/gnome-control-center.png',
        disabled: false,
        favourite: true,
        desktop_shortcut: false,
        screen: displaySettings,
    },
    {
        id: "todoist",
        title: "Todoist",
        icon: './themes/Yaru/apps/todoist.png',
        disabled: false,
        favourite: false,
        desktop_shortcut: false,
        screen: displayTodoist,
    },
    {
        id: "trash",
        title: "Trash",
        icon: './themes/Yaru/system/user-trash-full.png',
        disabled: false,
        favourite: false,
        desktop_shortcut: true,
        screen: displayTrash,
    },
    {
        id: "arcade",
        title: "Arcade",
        icon: './themes/Yaru/apps/arcade.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: displayArcade,
    },
    {
        id: "bot-lab",
        title: "Bot Lab",
        icon: './themes/Yaru/apps/bot-lab.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: displayBotLab,
    },
    {
        id: "gedit",
        title: "Contact Me",
        icon: './themes/Yaru/apps/gedit.png',
        disabled: false,
        favourite: false,
        desktop_shortcut: true,
        screen: displayGedit,
    },
]

// Shown only on /xlib after the admin passcode (components/shell/ubuntu.tsx)
const displayAdminAnalytics = lazyApp(() => import('./components/admin/analytics'));
const displayAdminPhotoDrop = lazyApp(() => import('./components/admin/photo-drop'));
const displayAdminSettings = lazyApp(() => import('./components/admin/site-settings'));

export const adminApps: AppConfig[] = [
    {
        id: "admin-analytics",
        title: "Analytics",
        icon: './themes/Yaru/apps/analytics.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: displayAdminAnalytics,
    },
    {
        id: "admin-photo-drop",
        title: "Photo Drop",
        icon: './themes/Yaru/apps/photo-drop.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: displayAdminPhotoDrop,
    },
    {
        id: "admin-settings",
        title: "Site Settings",
        icon: './themes/Yaru/apps/site-settings.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: displayAdminSettings,
    },
];

export default apps;
