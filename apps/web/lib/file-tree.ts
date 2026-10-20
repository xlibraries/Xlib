// The About app's explorer: a tree of folders and files, addressed by a path of names.
import type { ReactNode } from 'react';

export type TreeNode =
    | { name: string; kind: 'folder'; children: TreeNode[]; icon?: string; sidebarIcon?: string }
    | { name: string; kind: 'text' | 'pdf'; render: () => ReactNode; sidebarIcon?: string };

export const folder = (name: string, children: TreeNode[], icon?: string): TreeNode => ({ name, kind: 'folder', children, icon });
export const textFile = (name: string, render: () => ReactNode): TreeNode => ({ name, kind: 'text', render });

/** The node at `path` (a list of names from the root), or null if there's none. */
export function resolvePath(root: TreeNode, path: string[]): TreeNode | null {
    let node: TreeNode = root;
    for (const name of path) {
        const next: TreeNode | undefined = node.kind === 'folder' ? node.children.find((child) => child.name === name) : undefined;
        if (!next) return null;
        node = next;
    }
    return node;
}

/** A saved path, if it still exists in the tree. */
export function validPath(root: TreeNode, saved: unknown): string[] {
    return Array.isArray(saved) && saved.every((x) => typeof x === 'string') && resolvePath(root, saved) ? saved : [];
}
