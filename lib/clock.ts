// Text for the desktop clock (components/util components/clock.tsx).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type ClockFormat = { hour12?: boolean; onlyTime?: boolean; onlyDay?: boolean };

export function formatClock(date: Date, { hour12 = true, onlyTime = false, onlyDay = false }: ClockFormat = {}): string {
    let hour = date.getHours();
    const minute = String(date.getMinutes()).padStart(2, "0");
    const meridiem = hour < 12 ? "AM" : "PM";
    if (hour12) hour = hour % 12 || 12;
    const day = `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${date.getDate()}`;
    const time = `${hour}:${minute} ${meridiem}`;
    if (onlyTime) return time;
    if (onlyDay) return day;
    return `${day} ${time}`;
}
