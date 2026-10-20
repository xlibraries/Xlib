import { useEffect, useState, type FormEvent } from 'react';
import Clock from '../util/clock';
import { wallpaperUrl } from '../../lib/wallpapers';

export interface LockScreenProps {
    isLocked: boolean;
    bgImgName: string;
    unLockScreen: () => void;
    /** Admin login (/xlib): ask for the passcode instead of unlocking on any key. */
    login?: { configured: boolean; onLogin: (passcode: string) => Promise<string | null> };
}

export default function LockScreen({ isLocked, bgImgName, unLockScreen, login }: LockScreenProps) {
    useEffect(() => {
        if (!isLocked || login) return undefined;
        window.addEventListener('pointerdown', unLockScreen);
        window.addEventListener('keydown', unLockScreen);
        return () => {
            window.removeEventListener('pointerdown', unLockScreen);
            window.removeEventListener('keydown', unLockScreen);
        };
    }, [isLocked, unLockScreen, login]);

    return (
        <div id="ubuntu-lock-screen" style={{ zIndex: "100" }} className={(isLocked ? " visible translate-y-0 " : " invisible -translate-y-full ") + " absolute outline-none bg-black bg-opacity-90 transform duration-500 select-none top-0 right-0 overflow-hidden m-0 p-0 h-screen w-screen"}>
            <div style={{ backgroundImage: `url(${wallpaperUrl(bgImgName)})`, backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPositionX: "center" }} className="absolute top-0 left-0 w-full h-full transform z-20 blur-md "></div>
            <div className="w-full h-full z-50 overflow-hidden relative flex flex-col justify-center items-center text-white">
                <div className=" text-7xl">
                    <Clock onlyTime={true} />
                </div>
                <div className="mt-4 text-xl font-medium">
                    <Clock onlyDay={true} />
                </div>
                {login
                    ? <AdminLogin {...login} />
                    : <div className=" mt-16 text-base">Click or Press a key to unlock</div>}
            </div>
        </div>
    );
}

function AdminLogin({ configured, onLogin }: { configured: boolean; onLogin: (passcode: string) => Promise<string | null> }) {
    const [passcode, setPasscode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    if (!configured) return <div className="mt-16 text-base text-gray-300">Admin isn&apos;t set up on this site yet.</div>;

    const submit = async (e: FormEvent) => {
        e.preventDefault();
        if (!passcode || busy) return;
        setBusy(true);
        const problem = await onLogin(passcode);
        setBusy(false);
        if (problem) {
            setError(problem);
            setPasscode('');
        }
    };

    return (
        <form onSubmit={submit} className="mt-12 flex flex-col items-center select-text">
            <img src="./images/logos/bitmoji.png" alt="" className="w-16 h-16 rounded-full bg-white mb-3" />
            <div className="mb-3 font-medium">aman (admin)</div>
            <input
                id="admin-passcode"
                type="password"
                value={passcode}
                onChange={(e) => { setPasscode(e.target.value); setError(null); }}
                placeholder="Passcode"
                aria-label="Admin passcode"
                autoFocus
                autoComplete="current-password"
                className="w-64 px-3 py-1.5 rounded bg-black bg-opacity-50 border border-white border-opacity-30 focus:border-ub-orange outline-none text-center"
            />
            <button type="submit" disabled={busy} className="mt-3 px-5 py-1 rounded bg-ub-orange hover:bg-opacity-90 disabled:opacity-50 text-sm">
                {busy ? 'Checking…' : 'Unlock'}
            </button>
            <div role="alert" className="mt-3 h-5 text-sm text-red-300">{error}</div>
        </form>
    );
}
