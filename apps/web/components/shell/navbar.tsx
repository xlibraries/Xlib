import { useCallback, useState } from 'react';
import Clock from '../util/clock';
import Status from '../util/status';
import StatusCard from '../util/status-card';

export default function Navbar({ lockScreen, shutDown, onOpenSettings }: { lockScreen: () => void; shutDown: () => void; onOpenSettings: () => void }) {
	const [statusCard, setStatusCard] = useState(false);
	const hideStatusCard = useCallback(() => setStatusCard(false), []);

	return (
		<div className="main-navbar-vp absolute top-0 right-0 w-screen shadow-md flex flex-nowrap justify-between items-center bg-ub-grey text-ubt-grey text-sm select-none z-50">
			<div tabIndex={0} className="pl-3 pr-3 outline-none transition duration-100 ease-in-out border-b-2 border-transparent focus:border-ubb-orange py-1 ">
				Activities
			</div>
			<div tabIndex={0} className="pl-2 pr-2 text-xs md:text-sm outline-none transition duration-100 ease-in-out border-b-2 border-transparent focus:border-ubb-orange py-1">
				<Clock />
			</div>
			<div
				id="status-bar"
				tabIndex={0}
				onFocus={() => setStatusCard(true)}
				className="relative pr-3 pl-3 outline-none transition duration-100 ease-in-out border-b-2 border-transparent focus:border-ubb-orange py-1 "
			>
				<Status />
				<StatusCard shutDown={shutDown} lockScreen={lockScreen} onOpenSettings={onOpenSettings} visible={statusCard} toggleVisible={hideStatusCard} />
			</div>
		</div>
	);
}
