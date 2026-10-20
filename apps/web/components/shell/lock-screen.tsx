import { useEffect } from 'react';
import Clock from '../util/clock';
import { wallpaperUrl } from '../../lib/wallpapers';

export default function LockScreen(props: { isLocked: boolean; bgImgName: string; unLockScreen: () => void }) {

    useEffect(() => {
        if (!props.isLocked) return undefined;

        window.addEventListener('pointerdown', props.unLockScreen);
        window.addEventListener('keydown', props.unLockScreen);

        return () => {
            window.removeEventListener('pointerdown', props.unLockScreen);
            window.removeEventListener('keydown', props.unLockScreen);
        };
    }, [props.isLocked, props.unLockScreen]);

    return (
        <div id="ubuntu-lock-screen" style={{ zIndex: "100" }} className={(props.isLocked ? " visible translate-y-0 " : " invisible -translate-y-full ") + " absolute outline-none bg-black bg-opacity-90 transform duration-500 select-none top-0 right-0 overflow-hidden m-0 p-0 h-screen w-screen"}>
            <div style={{ backgroundImage: `url(${wallpaperUrl(props.bgImgName)})`, backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPositionX: "center" }} className="absolute top-0 left-0 w-full h-full transform z-20 blur-md "></div>
            <div className="w-full h-full z-50 overflow-hidden relative flex flex-col justify-center items-center text-white">
                <div className=" text-7xl">
                    <Clock onlyTime={true} />
                </div>
                <div className="mt-4 text-xl font-medium">
                    <Clock onlyDay={true} />
                </div>
                <div className=" mt-16 text-base">
                    Click or Press a key to unlock
                </div>
            </div>
        </div>
    )
}
