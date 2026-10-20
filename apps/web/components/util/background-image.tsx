import { wallpaperUrl } from '../../lib/wallpapers';

export default function BackgroundImage({ img }: { img: string }) {
    return (
        <div style={{ backgroundImage: `url(${wallpaperUrl(img)})`, backgroundSize: "cover", backgroundRepeat: "no-repeat", backgroundPositionX: "center" }} className="bg-ubuntu-img absolute -z-10 top-0 right-0 overflow-hidden h-full w-full">
        </div>
    );
}
