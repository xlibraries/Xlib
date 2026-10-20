// Colours match the app icon. The <style> block gives the package its own slider and scrollbar looks,
// so it needs nothing from the host site's CSS.
export const ACCENT = '#F7752B';
export const ACCENT_DEEP = '#9B1D5A';
export const GRADIENT = `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`;
export const COLORS = { base: '#1d1a21', panel: '#16131a', bar: '#110e14' };

export const sliderFill = (value: number, max: number) => {
    const pct = max ? Math.min(100, (value / max) * 100) : 0;
    return { backgroundImage: `linear-gradient(to right, ${ACCENT} 0%, ${ACCENT_DEEP} ${pct}%, rgba(175, 175, 175, 0.3) ${pct}%)` };
};

export const STYLES = `
.xlib-music-slider { outline: none; -webkit-appearance: none; appearance: none; height: 6px; border-radius: 3px;
  background-position: center; background-size: 99% 3px; background-repeat: no-repeat; }
.xlib-music-slider::-webkit-slider-thumb { -webkit-appearance: none; width: 12px; height: 12px; border-radius: 50%;
  background: #fff; box-shadow: inset 0 1px 0 rgba(0, 0, 0, 0.2); }
.xlib-music-slider::-moz-range-thumb { width: 12px; height: 12px; border: 0; border-radius: 50%; background: #fff; }
.xlib-music-scroll::-webkit-scrollbar { width: 8px; }
.xlib-music-scroll::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 4px; }
.xlib-music-scroll::-webkit-scrollbar-track { background: transparent; }
`;
