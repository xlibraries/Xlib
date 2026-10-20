import { useState } from 'react';

const TRASH_ITEMS = [
    { name: "php", icon: "./themes/filetypes/php.png" },
    { name: "Angular.js", icon: "./themes/filetypes/js.png" },
    { name: "node_modules", icon: "./themes/Yaru/system/folder.png" },
    { name: "abandoned project", icon: "./themes/Yaru/system/folder.png" },
    { name: "18BCP127 assignment name.zip", icon: "./themes/filetypes/zip.png" },
    { name: "project final", icon: "./themes/Yaru/system/folder.png" },
    { name: "project ultra-final", icon: "./themes/Yaru/system/folder.png" },
];

function wasEmptied(): boolean {
    try { return localStorage.getItem("trash-empty") === "true"; } catch { return false; }
}

export default function Trash() {
    const [empty, setEmpty] = useState(wasEmptied);
    const [selected, setSelected] = useState<number | null>(null);

    const emptyTrash = () => {
        setEmpty(true);
        try { localStorage.setItem("trash-empty", "true"); } catch { /* storage blocked */ }
    };

    return (
        <div className="w-full h-full flex flex-col bg-ub-cool-grey text-white select-none">
            <div className="flex items-center justify-between w-full bg-ub-warm-grey bg-opacity-40 text-sm">
                <span className="font-bold ml-2">Trash</span>
                <div className="flex">
                    <div className="border border-black bg-black bg-opacity-50 px-3 py-1 my-1 mx-1 rounded text-gray-300">Restore</div>
                    <div onClick={emptyTrash} className="border border-black bg-black bg-opacity-50 px-3 py-1 my-1 mx-1 rounded hover:bg-opacity-80">Empty</div>
                </div>
            </div>
            {empty ? (
                <div className="flex-grow flex flex-col justify-center items-center">
                    <img className=" w-24" src="./themes/Yaru/status/user-trash-symbolic.svg" alt="Ubuntu Trash" />
                    <span className="font-bold mt-4 text-xl px-1 text-gray-400">Trash is Empty</span>
                </div>
            ) : (
                <div className="flex-grow ml-4 flex flex-wrap items-start content-start justify-start overflow-y-auto windowMainScreen">
                    {TRASH_ITEMS.map((item, index) => (
                        <div
                            key={item.name}
                            tabIndex={1}
                            onFocus={() => setSelected(index)}
                            onBlur={() => setSelected(null)}
                            className="flex flex-col items-center text-sm outline-none w-16 my-2 mx-4"
                        >
                            <div className={(selected === index ? "opacity-60 " : "") + "w-16 h-16 flex items-center justify-center"}>
                                <img src={item.icon} alt="Ubuntu File Icons" />
                            </div>
                            <span className={(selected === index ? "bg-ub-orange " : "") + "text-center rounded px-0.5"}>{item.name}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
