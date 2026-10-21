import { useEffect, useRef, useState } from 'react';
import SmallArrow from './small-arrow';
import { screenBrightness } from '../../lib/display';
import { readSoundLevel, writeSoundLevel } from '../../lib/sound-level';

type StatusCardProps = {
	visible: boolean;
	toggleVisible: () => void;
	lockScreen: () => void;
	shutDown: () => void;
	onOpenSettings: () => void;
};

const setScreenBrightness = (level: number) => {
	const screen = document.getElementById('monitor-screen');
	if (screen) screen.style.filter = screenBrightness(level);
};

const stored = (key: string, fallback: number) => {
	try { return Number(localStorage.getItem(key) ?? fallback); } catch { return fallback; }
};

export default function StatusCard({ visible, toggleVisible, lockScreen, shutDown, onOpenSettings }: StatusCardProps) {
	const wrapper = useRef<HTMLDivElement>(null);
	// The desktop only renders in the browser after the boot screen, but keep SSR-safe defaults
	const [sound, setSoundState] = useState(75);
	const [brightness, setBrightnessState] = useState(100);

	useEffect(() => {
		/* eslint-disable react-hooks/set-state-in-effect -- localStorage is only readable after mount (not during SSR) */
		setSoundState(readSoundLevel());
		const level = stored('brightness-level', 100);
		setBrightnessState(level);
		/* eslint-enable react-hooks/set-state-in-effect */
		setScreenBrightness(level);
	}, []);

	// Clicking outside the open card closes it
	useEffect(() => {
		const onOutside = (event: MouseEvent | TouchEvent) => {
			if (!visible || !wrapper.current || wrapper.current.contains(event.target as Node)) return;
			toggleVisible();
		};
		document.addEventListener('mousedown', onOutside);
		document.addEventListener('touchstart', onOutside);
		return () => {
			document.removeEventListener('mousedown', onOutside);
			document.removeEventListener('touchstart', onOutside);
		};
	}, [visible, toggleVisible]);

	const setBrightness = (level: number) => {
		setBrightnessState(level);
		try { localStorage.setItem('brightness-level', String(level)); } catch { /* storage blocked */ }
		setScreenBrightness(level);
	};

	const setSound = (level: number) => {
		setSoundState(level);
		writeSoundLevel(level);   // every open app follows (host.volume)
	};

	return (
			<div
				ref={wrapper}
				className={
					'absolute bg-ub-cool-grey rounded-md py-4 top-9 right-3 shadow border-black border border-opacity-20 status-card' +
					(visible ? ' visible animateShow' : ' invisible')
				}
			>
				{' '}
				{/* Status Card */}
				<div className="absolute w-0 h-0 -top-1 right-6 top-arrow-up" />
				<div className="w-64 py-1.5 flex items-center justify-center bg-ub-cool-grey hover:bg-ub-warm-grey hover:bg-opacity-20">
					<div className="w-8">
						<img width="16px" height="16px" src="./themes/Yaru/status/audio-headphones-symbolic.svg" alt="ubuntu headphone" />
					</div>
					<input type="range" min="0" max="100" step="1"
						onChange={(e) => setSound(Number(e.target.value))}
						className="ubuntu-slider w-2/3"
						value={sound}
						name="headphone_range"
					/>
				</div>
				<div className="w-64 py-1.5 flex items-center justify-center bg-ub-cool-grey hover:bg-ub-warm-grey hover:bg-opacity-20">
					<div className="w-8">
						<img width="16px" height="16px" src="./themes/Yaru/status/display-brightness-symbolic.svg" alt="ubuntu brightness" />
					</div>
					<input type="range" min="0" max="100" step="1"
						onChange={(e) => setBrightness(Number(e.target.value))}
						className="ubuntu-slider w-2/3"
						name="brightness_range"
						value={brightness}
					/>
				</div>
				<div className="w-64 flex content-center justify-center">
					<div className="w-2/4 border-black border-opacity-50 border-b my-2 border-solid" />
				</div>
				<div className="w-64 py-1.5 flex items-center justify-center bg-ub-cool-grey hover:bg-ub-warm-grey hover:bg-opacity-20">
					<div className="w-8">
						<img width="16px" height="16px" src="./themes/Yaru/status/network-wireless-signal-good-symbolic.svg" alt="ubuntu wifi" />
					</div>
					<div className="w-2/3 flex items-center justify-between text-gray-400">
						<span>Product X.0</span>
						<SmallArrow angle="right" />
					</div>
				</div>
				<div className="w-64 py-1.5 flex items-center justify-center bg-ub-cool-grey hover:bg-ub-warm-grey hover:bg-opacity-20">
					<div className="w-8">
						<img width="16px" height="16px" src="./themes/Yaru/status/bluetooth-symbolic.svg" alt="ubuntu bluetooth" />
					</div>
					<div className="w-2/3 flex items-center justify-between text-gray-400">
						<span>Off</span>
						<SmallArrow angle="right" />
					</div>
				</div>
				<div className="w-64 py-1.5 flex items-center justify-center bg-ub-cool-grey hover:bg-ub-warm-grey hover:bg-opacity-20">
					<div className="w-8">
						<img width="16px" height="16px" src="./themes/Yaru/status/battery-good-symbolic.svg" alt="ubuntu battery" />
					</div>
					<div className="w-2/3 flex items-center justify-between text-gray-400">
						<span>2:40 Remaining (75%)</span>
						<SmallArrow angle="right" />
					</div>
				</div>
				<div className="w-64 flex content-center justify-center">
					<div className="w-2/4 border-black border-opacity-50 border-b my-2 border-solid" />
				</div>
				<div
					id="open-settings"
					onClick={onOpenSettings}
					className="w-64 py-1.5 flex items-center justify-center bg-ub-cool-grey hover:bg-ub-warm-grey hover:bg-opacity-20"
				>
					<div className="w-8">
						<img width="16px" height="16px" src="./themes/Yaru/status/emblem-system-symbolic.svg" alt="ubuntu settings" />
					</div>
					<div className="w-2/3 flex items-center justify-between">
						<span>Settings</span>
					</div>
				</div>
				<div
					onClick={lockScreen}
					className="w-64 py-1.5 flex items-center justify-center bg-ub-cool-grey hover:bg-ub-warm-grey hover:bg-opacity-20"
				>
					<div className="w-8">
						<img width="16px" height="16px" src="./themes/Yaru/status/changes-prevent-symbolic.svg" alt="ubuntu lock" />
					</div>
					<div className="w-2/3 flex items-center justify-between">
						<span>Lock</span>
					</div>
				</div>
				<div
					onClick={shutDown}
					className="w-64 py-1.5 flex items-center justify-center bg-ub-cool-grey hover:bg-ub-warm-grey hover:bg-opacity-20"
				>
					<div className="w-8">
						<img width="16px" height="16px" src="./themes/Yaru/status/system-shutdown-symbolic.svg" alt="ubuntu power" />
					</div>
					<div className="w-2/3 flex items-center justify-between">
						<span>Power Off / Log Out</span>
						<SmallArrow angle="right" />
					</div>
				</div>
			</div>
);
}
