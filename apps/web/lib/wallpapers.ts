// The desktop wallpapers, by name (the name is what Settings saves).
export const WALLPAPERS: Record<string, string> = Object.fromEntries(
    Array.from({ length: 8 }, (_, i) => [`wall-${i + 1}`, `./images/wallpapers/wall-${i + 1}.webp`]),
);

export const DEFAULT_WALLPAPER = 'wall-2';

export const wallpaperUrl = (name: string) => WALLPAPERS[name] ?? WALLPAPERS[DEFAULT_WALLPAPER];
