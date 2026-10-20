import dynamic from 'next/dynamic';
import { createElement, type ComponentType } from 'react';
import type { AppProps } from '@xlibraries/app-sdk';

// Every app is a component that takes { host } (see packages/app-sdk); its code is downloaded the first
// time its window opens
const AppLoading = () => createElement('div', { className: 'w-full h-full flex items-center justify-center text-gray-400 text-sm' }, 'Loading…');
const lazyApp = (load: () => Promise<{ default: ComponentType<AppProps> }>): ComponentType<AppProps> =>
    dynamic(load, { ssr: false, loading: AppLoading });

const displayTerminal = lazyApp(() => import('./components/apps/terminal'));
const displaySettings = lazyApp(() => import('./components/apps/settings'));

const displayBrave = lazyApp(() => import('./components/apps/brave'));
const displayTerminalCalc = lazyApp(() => import('./components/apps/calc'));
const displayAboutAman = lazyApp(() => import('./components/apps/aman'));
const displaySideQuests = lazyApp(() => import('./components/apps/side-quests'));
const displayVsCode = lazyApp(() => import('./components/apps/vscode'));
const displayMusic = lazyApp(() => import('./components/apps/music'));
const displayTodoist = lazyApp(() => import('./components/apps/todoist'));
const displayTrash = lazyApp(() => import('./components/apps/trash'));
const displayGedit = lazyApp(() => import('./components/apps/gedit'));

const apps = [
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
        id: "gedit",
        title: "Contact Me",
        icon: './themes/Yaru/apps/gedit.png',
        disabled: false,
        favourite: false,
        desktop_shortcut: true,
        screen: displayGedit,
    },
]

export default apps;
