import { useCallback, useEffect, useRef, useState } from 'react';
import { trackEvent } from '../../lib/analytics';
import { DEFAULT_WALLPAPER } from '../../lib/wallpapers';
import BootingScreen from './boot-screen';
import { adminApps } from '../../apps.config';
import Desktop, { type DesktopHandle } from './desktop';
import LockScreen from './lock-screen';
import Navbar from './navbar';

const read = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage blocked */ } };
const blurStatusBar = () => document.getElementById('status-bar')?.blur();
const noop = () => { };

type AdminState = 'checking' | 'unconfigured' | 'out' | 'in';

async function adminRequest(path: string, body?: unknown): Promise<Response> {
	return fetch(path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
}

/** `admin`: the /xlib page — locked until the admin passcode is entered, then the desktop gains admin apps. */
export default function Ubuntu({ admin = false }: { admin?: boolean }) {
	const [locked, setLocked] = useState(false);
	const [wallpaper, setWallpaperState] = useState(DEFAULT_WALLPAPER);
	const [booting, setBooting] = useState(true);
	const [shutDown, setShutDown] = useState(false);
	const desktop = useRef<DesktopHandle>(null);
	const [adminState, setAdminState] = useState<AdminState>(admin ? 'checking' : 'out');

	useEffect(() => {
		if (!admin) return;
		adminRequest('/api/admin/session')
			.then(r => r.json())
			.then((s: { configured: boolean; admin: boolean }) => setAdminState(!s.configured ? 'unconfigured' : s.admin ? 'in' : 'out'))
			.catch(() => setAdminState('out'));
	}, [admin]);

	const adminLogin = async (passcode: string): Promise<string | null> => {
		try {
			const res = await adminRequest('/api/admin/login', { passcode });
			if (res.ok) { setAdminState('in'); return null; }
			return (await res.json()).error || "Couldn't log in.";
		} catch {
			return "Couldn't reach the site. Check your connection.";
		}
	};

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
		trackEvent({ category: `Screen Change`, action: `Set Screen to Locked` });
		blurStatusBar();
		setTimeout(() => setLocked(true), 100);   // waiting for all windows to close (transition-duration)
		write('screen-locked', 'true');
	};

	const unLockScreen = useCallback(() => {
		setLocked(false);
		write('screen-locked', 'false');
	}, []);

	const setWallpaper = useCallback((name: string) => {
		setWallpaperState(name);
		write('bg-image', name);
	}, []);

	const powerOff = () => {
		trackEvent({ category: `Screen Change`, action: `Switched off the Ubuntu` });
		blurStatusBar();
		setShutDown(true);
		write('shut-down', 'true');
	};

	const turnOn = () => {
		setShutDown(false);
		setBooting(true);
		bootFor2s();
		write('shut-down', 'false');
	};

	return (
		<div className="w-screen h-screen overflow-hidden" id="monitor-screen">
			{admin && adminState !== 'in'
				? <LockScreen isLocked bgImgName={wallpaper} unLockScreen={noop} login={adminState === 'checking' ? undefined : { configured: adminState !== 'unconfigured', onLogin: adminLogin }} />
				: <LockScreen isLocked={locked} bgImgName={wallpaper} unLockScreen={unLockScreen} />}
			<BootingScreen visible={booting} isShutDown={shutDown} turnOn={turnOn} />
			<Navbar lockScreen={lockScreen} shutDown={powerOff} onOpenSettings={() => desktop.current?.openApp('settings')} />
			<Desktop ref={desktop} wallpaper={wallpaper} setWallpaper={setWallpaper} extraApps={adminState === 'in' ? adminApps : undefined} />
		</div>
	);
}
