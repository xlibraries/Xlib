import { useState } from 'react';
import DesktopIcon from './desktop-icon';

type GridApp = { id: string; title: string; icon: string };

function frequentApps(apps: GridApp[]): GridApp[] {
    try {
        const info: { id: string }[] = JSON.parse(localStorage.getItem("frequentApps") || "[]");
        return info.map(({ id }) => apps.find(app => app.id === id)).filter((app): app is GridApp => !!app);
    } catch {
        return [];
    }
}

export default function AppGrid({ apps, openApp }: { apps: GridApp[]; openApp: (id: string) => void }) {
    const [query, setQuery] = useState("");
    const [frequent, setFrequent] = useState(false);

    const shown = frequent
        ? frequentApps(apps)
        : apps.filter(app => app.title.toLowerCase().includes(query.trim().toLowerCase()));

    const tab = (label: string, active: boolean, onClick: () => void) => (
        <div className="w-1/4 text-center group text-white bg-transparent cursor-pointer items-center" onClick={onClick}>
            <h4>{label}</h4>
            <div className={"h-1 mt-1 " + (active ? "bg-ub-orange self-center" : "bg-transparent group-hover:bg-white")} />
        </div>
    );

    return (
        <div className="absolute h-full top-7 w-full z-20 pl-12 justify-center md:pl-20 border-black border-opacity-60 bg-black bg-opacity-70">
            <div className="flex md:pr-20 pt-5 align-center justify-center">
                <div className="flex w-2/3 h-full items-center pl-2 pr-2 bg-white border-black border-width-2 rounded-xl overflow-hidden md:w-1/3 ">
                    <img className="w-5 h-5" alt="search icon" src="./images/logos/search.png" />
                    <input className="w-3/4 p-1 bg-transparent focus:outline-none" placeholder="Type to Search " value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
            </div>
            <div className="grid md:grid-cols-6 md:grid-rows-3 grid-cols-3 grid-rows-6 md:gap-4 gap-1 md:px-20 px-5 pt-10 justify-center">
                {shown.map(app => <DesktopIcon key={app.id} id={app.id} name={app.title} icon={app.icon} openApp={openApp} />)}
            </div>
            <div className="flex align-center justify-center w-full fixed bottom-0 mb-15 pr-20  md:pr-20 ">
                {tab("Frequent", frequent, () => setFrequent(true))}
                {tab("All", !frequent, () => setFrequent(false))}
            </div>
        </div>
    );
}
