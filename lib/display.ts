// Brightness slider (0-100) -> CSS filter. Linear from 0.25 to 1, so the screen never goes fully black.
export const screenBrightness = (level: number) => `brightness(${3 / 400 * level + 0.25})`;
