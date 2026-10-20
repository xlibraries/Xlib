// What the terminal app shows on this site: the folders `ls` lists, which commands open which apps, and the
// site-only commands. The terminal itself is the @xlibraries/terminal package.
import type { ShellConfig } from '@xlibraries/terminal';

const APPS = ['vscode', 'music', 'brave', 'todoist', 'trash', 'about-aman', 'terminal', 'settings'];

export const terminal: ShellConfig = {
    user: 'aman',
    home: '/home/aman',
    files: {
        root: ['projects', 'personal-documents', 'skills', 'languages', 'interests'],
        skills: ['Full Stack Sevelopment', 'Mobile Development', 'Azure', 'Game Development', 'Robotics', 'XR-Development', 'Git'],
        projects: ['Xlib-personal-portfolio', 'SmartOnboaders', 'Turbo Trails', 'Lone Ember'],
        interests: ['Software Development', 'Game Development', 'Robotics', 'XR-Development', 'Art & Creativity'],
        languages: ['Angular', 'React', 'Node.js', '.NET', 'C#', 'MySql', 'MongoDB'],
    },
    privateDirs: ['personal-documents'],
    apps: {
        ...Object.fromEntries(APPS.map((id) => [id, id])),
        code: 'vscode',
        sendmsg: 'gedit',
    },
    commands: {
        // hidden: opens the Photo Drop uploader
        upload: {
            hidden: true,
            run: () => ({ output: { kind: 'text', text: 'Opening Photo Drop in a new tab…' }, effects: [{ type: 'openUrl', url: './drop/' }] }),
        },
        sudo: {
            hidden: true,
            run: () => ({
                output: { kind: 'image', src: './images/memes/used-sudo-command.webp', alt: 'Nice try' },
                effects: [{ type: 'track', event: { category: 'Sudo Access', action: 'lol' } }],
            }),
        },
    },
};
