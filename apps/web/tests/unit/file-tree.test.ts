import { describe, expect, it } from 'vitest';
import { folder, resolvePath, textFile, validPath } from '../../lib/file-tree';
import { fileTree } from '../../content/about/tree';

const tree = folder('Home', [
    folder('Experience', [textFile('Flam.md', () => 'flam')]),
    textFile('About.txt', () => 'about'),
]);

describe('resolvePath', () => {
    it('walks folders by name', () => {
        expect(resolvePath(tree, [])).toBe(tree);
        expect(resolvePath(tree, ['Experience', 'Flam.md'])).toMatchObject({ name: 'Flam.md', kind: 'text' });
    });

    it('returns null for missing names and paths through files', () => {
        expect(resolvePath(tree, ['Nope'])).toBeNull();
        expect(resolvePath(tree, ['About.txt', 'x'])).toBeNull();
    });
});

describe('validPath', () => {
    it('keeps saved paths that still exist and drops anything else', () => {
        expect(validPath(tree, ['Experience'])).toEqual(['Experience']);
        expect(validPath(tree, ['Gone'])).toEqual([]);
        expect(validPath(tree, 'Experience')).toEqual([]);
        expect(validPath(tree, [1, 2])).toEqual([]);
    });
});

describe('About tree', () => {
    it('has the top-level places the explorer sidebar shows', () => {
        expect(fileTree.kind === 'folder' && fileTree.children.map((c) => c.name)).toEqual(
            ['Experience', 'Education', 'Skills', 'Projects', 'About Me.txt', 'Resume.pdf']);
    });

    it('files every project under its category', () => {
        const projects = resolvePath(fileTree, ['Projects']);
        const count = projects?.kind === 'folder' ? projects.children.reduce((n, c) => n + (c.kind === 'folder' ? c.children.length : 0), 0) : 0;
        expect(count).toBeGreaterThanOrEqual(9);
        expect(resolvePath(fileTree, ['Experience', 'Flam', 'Talking Avatar.md'])).not.toBeNull();
    });
});
