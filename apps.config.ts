import { displayMusic } from './components/apps/music';
import { displayVsCode } from './components/apps/vscode';
import { displayTerminal } from './components/apps/terminal';
import { displaySettings } from './components/apps/settings';
import { displayBrave } from './components/apps/brave';
import { displayTrash } from './components/apps/trash';
import { displayGedit } from './components/apps/gedit';
import { displayAboutAman } from './components/apps/aman';
import { displayTerminalCalc } from './components/apps/calc';
import { displayTodoist } from './components/apps/todoist';

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
        icon: './themes/Yaru/apps/rhythmbox.png',
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
