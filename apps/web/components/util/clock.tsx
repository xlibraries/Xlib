import { useEffect, useState } from 'react';
import { formatClock } from '../../lib/clock';

export default function Clock({ onlyTime, onlyDay }: { onlyTime?: boolean; onlyDay?: boolean }) {
    // Set after mount: a time rendered on the server never matches the browser's (hydration error)
    const [now, setNow] = useState<Date | null>(null);

    useEffect(() => {
        const tick = () => setNow(new Date());
        tick();
        const timer = setInterval(tick, 10 * 1000);
        return () => clearInterval(timer);
    }, []);

    if (!now) return <span>&nbsp;</span>;
    return <span>{formatClock(now, { hour12: true, onlyTime, onlyDay })}</span>;
}
