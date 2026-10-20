// Pure helpers for the Side Quests app (components/apps/side-quests.tsx).

export type RoadTrip = { name: string; km: number; stops: string[]; points: [number, number][] };

// 12345 -> "12,345" (Indian grouping: 1,23,456)
export const formatKm = (n: number | null | undefined) => (n || 0).toLocaleString("en-IN");

// "2026-10" -> "Oct 2026"
export const monthLabel = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleString("en-US", { month: "short", year: "numeric" });

// Earlier road trips are stored one way unless they're loops; count the drive back too
export const roadTripKm = (trips: Pick<RoadTrip, "km" | "stops">[] | null | undefined) =>
    (trips || []).reduce((sum, t) => sum + (t.stops[0] === t.stops[t.stops.length - 1] ? t.km : 2 * t.km), 0);

// Total "on the road": tracked road km (car + bike + bus + unlabelled drives) + earlier road trips, rounded to 100
export const onTheRoadKm = (trackedRoadKm: number | undefined, trips: Pick<RoadTrip, "km" | "stops">[] | null | undefined) =>
    Math.round(((trackedRoadKm || 0) + roadTripKm(trips)) / 100) * 100;
