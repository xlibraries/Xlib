export interface DesktopIconProps {
    id: string;
    name: string;
    icon: string;
    openApp: (id: string) => void;
}

export default function DesktopIcon({ id, name, icon, openApp }: DesktopIconProps) {
    return (
        <div
            className="p-1 m-px z-10 bg-white bg-opacity-0 hover:bg-opacity-20 focus:bg-ub-orange focus:bg-opacity-50 focus:border-yellow-700 focus:border-opacity-100 border border-transparent outline-none rounded select-none w-24 h-20 flex flex-col justify-start items-center text-center text-xs font-normal text-white "
            id={"app-" + id}
            onDoubleClick={() => openApp(id)}
            tabIndex={0}
        >
            <img width="40px" height="40px" className="mb-1 w-10" src={icon} alt={"Ubuntu " + name} />
            {name}
        </div>
    );
}
