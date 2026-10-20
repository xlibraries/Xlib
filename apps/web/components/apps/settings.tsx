import React from 'react';
import type { AppProps } from '@xlibraries/app-sdk';
import { WALLPAPERS } from '../../lib/wallpapers';

export function Settings({ host }: AppProps) {
    const changeBackgroundImage = (e: React.FocusEvent<HTMLDivElement>) => {
        host.setWallpaper(e.currentTarget.dataset.path!);
    }

    return (
        <div className={"w-full flex-col flex-grow z-20 max-h-full overflow-y-auto windowMainScreen select-none bg-ub-cool-grey"}>
            <div className=" md:w-2/5 w-2/3 h-1/3 m-auto my-4" style={{ backgroundImage: `url(${WALLPAPERS[host.wallpaper]})`, backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPosition: "center center" }}>
            </div>
            <div className="flex flex-wrap justify-center items-center border-t border-gray-900">
                {
                    Object.keys(WALLPAPERS).map((name, index) => {
                        return (
                            <div key={index} tabIndex={1} onFocus={changeBackgroundImage} data-path={name} className={((name === host.wallpaper) ? " border-yellow-700 " : " border-transparent ") + " md:px-28 md:py-20 md:m-4 m-2 px-14 py-10 outline-none border-4 border-opacity-80"} style={{ backgroundImage: `url(${WALLPAPERS[name]})`, backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPosition: "center center" }}></div>
                        );
                    })
                }
            </div>
        </div>
    )
}

export default Settings

