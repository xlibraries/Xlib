import { useCallback, useEffect, useRef, useState } from 'react';
import { trackEvent, trackPageview } from '../../lib/analytics';
import { DEFAULT_WALLPAPER } from '../../lib/wallpapers';
import BootingScreen from './boot-screen';
import Desktop, { type DesktopHandle } from './desktop';
import LockScreen from './lock-screen';
import Navbar from './navbar';

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } };
const blurStatusBar = () => document.getElementById('status-bar')?.blur();

export default function Ubuntu() {
	const [locked, setLocked] = useState(false);
	const [wallpaper, setWallpaperState] = useState(DEFAULT_WALLPAPER);
	const [booting, setBooting] = useState(true);
	const [shutDown, setShutDown] = useState(false);
	const desktop = useRef<DesktopHandle>(null);

	const bootFor2s = () => setTimeout(() => setBooting(false), 2000);

	// Restore the last visit: wallpaper, lock and power state; the boot animation only plays on the first visit
	useEffect(() => {
		/* eslint-disable react-hooks/set-state-in-effect -- localStorage is only readable after mount (not during SSR) */
		const saved = read('bg-image');
		if (saved) setWallpaperState(saved);
		if (read('booting_screen') !== null) setBooting(false);
		else {
			write('booting_screen', 'false');
			bootFor2s();
		}
		if (read('shut-down') === 'true') setShutDown(true);
		else setLocked(read('screen-locked') === 'true');
		/* eslint-enable react-hooks/set-state-in-effect */
	}, []);

	const lockScreen = () => {
		trackPageview("/lock-screen", "Lock Screen");
		trackEvent({ category: `Screen Change`, action: `Set Screen to Locked` });
		blurStatusBar();
		setTimeout(() => setLocked(true), 100);   // waiting for all windows to close (transition-duration)
		write('screen-locked', 'true');
	};

	const unLockScreen = useCallback(() => {
		trackPageview("/desktop");
		setLocked(false);
		write('screen-locked', 'false');
	}, []);

	const setWallpaper = useCallback((name: string) => {
		setWallpaperState(name);
		write('bg-image', name);
	}, []);

	const powerOff = () => {
		trackPageview("/switch-off");
		trackEvent({ category: `Screen Change`, action: `Switched off the Ubuntu` });
		blurStatusBar();
		setShutDown(true);
		write('shut-down', 'true');
	};

	const turnOn = () => {
		trackPageview("/desktop");
		setShutDown(false);
		setBooting(true);
		bootFor2s();
		write('shut-down', 'false');
	};

	return (
		<div className="w-screen h-screen overflow-hidden" id="monitor-screen">
			<LockScreen isLocked={locked} bgImgName={wallpaper} unLockScreen={unLockScreen} />
			<BootingScreen visible={booting} isShutDown={shutDown} turnOn={turnOn} />
			<Navbar lockScreen={lockScreen} shutDown={powerOff} onOpenSettings={() => desktop.current?.openApp('settings')} />
			<Desktop ref={desktop} wallpaper={wallpaper} setWallpaper={setWallpaper} />
		</div>
	);
}
