"""Builds public/side-quests/travel.json for the Side Quests app from a Google Maps Timeline export.

Only coarse, public-safe data leaves this script:
  * places at town level (10k+ people), using the town's GeoNames centre (never the actual visit location)
  * simplified road-trip routes (~1 km precision)
  * total distance per travel mode, plus "road" = car + motorcycle + bus + unlabelled movement at road speeds
Everything near private places is dropped: Bengaluru (home/work), Google's inferred home/work
places, and any place with more than PRIVATE_DWELL_DAYS of total stays (e.g. family homes).

Usage:
  python3 scripts/side-quests/build_travel_data.py --timeline ~/Downloads/Timeline.json --geonames /path/to/geonames
where the geonames folder holds cities1000.txt and admin1CodesASCII.txt from
https://download.geonames.org/export/dump/ (matching is done offline).
"""
import argparse
import bisect
import collections
import json
import math
from datetime import datetime

BENGALURU = (12.9716, 77.5946)
CITY_RADIUS_KM = 40          # no places or routes inside Bengaluru
PRIVATE_RADIUS_KM = 30       # around inferred homes and long-stay places
PRIVATE_DWELL_DAYS = 15
ROUTE_MODES = {"IN_PASSENGER_VEHICLE": "car", "MOTORCYCLING": "motorcycle", "IN_BUS": "bus", "IN_TRAIN": "train"}
STAT_MODES = {"MOTORCYCLING": "motorcycle", "IN_PASSENGER_VEHICLE": "car", "IN_TRAIN": "train", "FLYING": "flight",
              "IN_BUS": "bus", "WALKING": "walk", "CYCLING": "cycle", "IN_SUBWAY": "metro"}


def parse_latlng(text):
    lat, lng = text.replace("°", "").split(",")
    return float(lat), float(lng)


def distance_km(a, b):
    r = math.radians
    h = math.sin(r(b[0] - a[0]) / 2) ** 2 + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(r(b[1] - a[1]) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def parse_time(text):
    return datetime.fromisoformat(text)


class Gazetteer:
    """Nearest-town lookup over GeoNames cities1000, bucketed by whole degrees."""

    def __init__(self, folder):
        admin1 = {}
        for line in open(f"{folder}/admin1CodesASCII.txt", encoding="utf8"):
            code, name = line.split("\t")[:2]
            admin1[code] = name
        self.grid = collections.defaultdict(list)
        for line in open(f"{folder}/cities1000.txt", encoding="utf8"):
            f = line.split("\t")
            lat, lng, population = float(f[4]), float(f[5]), int(f[14] or 0)
            state = admin1.get(f"{f[8]}.{f[10]}", "")
            self.grid[(math.floor(lat), math.floor(lng))].append((f[2] or f[1], state, f[8], lat, lng, population))

    def nearest(self, point, min_population=10000, max_km=30, merge_km=15):
        """Town to pin a visit to: the largest town within merge_km (so suburbs and airports fold
        into their city), else the nearest town of min_population+ within max_km, else None.
        Snapping to real towns keeps pins coarse (no villages or neighbourhoods)."""
        largest = nearest = None
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for town in self.grid[(math.floor(point[0]) + dy, math.floor(point[1]) + dx)]:
                    if town[5] < min_population:
                        continue
                    d = distance_km(point, town[3:5])
                    if d <= merge_km and (largest is None or town[5] > largest[5]):
                        largest = town
                    if d <= max_km and (nearest is None or d < nearest[0]):
                        nearest = (d, town)
        return largest or (nearest[1] if nearest else None)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--timeline", required=True)
    parser.add_argument("--geonames", required=True)
    parser.add_argument("--out", default="public/side-quests/travel.json")
    args = parser.parse_args()

    segments = json.load(open(args.timeline))["semanticSegments"]
    gazetteer = Gazetteer(args.geonames)

    # ---- private zones: inferred home/work + long total stays ----
    visits = []
    for s in segments:
        if "visit" not in s:
            continue
        candidate = s["visit"]["topCandidate"]
        visits.append({
            "point": parse_latlng(candidate["placeLocation"]["latLng"]),
            "type": candidate.get("semanticType", "UNKNOWN"),
            "start": parse_time(s["startTime"]),
            "end": parse_time(s["endTime"]),
        })

    private = [BENGALURU]
    clusters = []  # [centre, dwell_days]
    for v in visits:
        if v["type"] in ("INFERRED_HOME", "INFERRED_WORK") and not any(distance_km(v["point"], p) < 5 for p in private):
            private.append(v["point"])
        for c in clusters:
            if distance_km(v["point"], c[0]) < 10:
                c[1] += (v["end"] - v["start"]).total_seconds() / 86400
                break
        else:
            clusters.append([v["point"], (v["end"] - v["start"]).total_seconds() / 86400])
    private += [c[0] for c in clusters if c[1] > PRIVATE_DWELL_DAYS]

    def is_private(point):
        return distance_km(point, BENGALURU) < CITY_RADIUS_KM or any(distance_km(point, p) < PRIVATE_RADIUS_KM for p in private)

    # ---- places ----
    places = {}
    for v in visits:
        if v["type"] in ("INFERRED_HOME", "INFERRED_WORK") or is_private(v["point"]):
            continue
        town = gazetteer.nearest(v["point"])
        if not town or is_private(town[3:5]):
            continue
        key = (town[0], town[1])
        place = places.setdefault(key, {"name": town[0], "state": town[1], "country": town[2],
                                        "lat": round(town[3], 2), "lng": round(town[4], 2), "months": set()})
        place["months"].add(v["start"].strftime("%Y-%m"))

    # ---- routes from the GPS path, only for ground travel between towns ----
    path = []
    for s in segments:
        for p in s.get("timelinePath", []):
            path.append((parse_time(p["time"]), parse_latlng(p["point"])))
    path.sort(key=lambda x: x[0])

    routes = []
    for s in segments:
        activity = s.get("activity")
        if not activity:
            continue
        mode = ROUTE_MODES.get(activity["topCandidate"].get("type"))
        if not mode or activity.get("distanceMeters", 0) < 15000:
            continue
        start, end = parse_time(s["startTime"]), parse_time(s["endTime"])
        line = []
        for t, point in path:
            if t < start or t > end:
                continue
            if is_private(point):
                if len(line) > 1:
                    routes.append({"mode": mode, "points": line})
                line = []
                continue
            rounded = [round(point[0], 2), round(point[1], 2)]
            if line and distance_km(line[-1], rounded) > 60:   # data gap: don't draw a straight jump
                if len(line) > 1:
                    routes.append({"mode": mode, "points": line})
                line = []
            if not line or distance_km(line[-1], rounded) >= 1.5:
                line.append(rounded)
        if len(line) > 1:
            routes.append({"mode": mode, "points": line})

    # ---- stats ----
    km = collections.Counter()
    activity_windows = []
    for s in segments:
        activity = s.get("activity")
        if activity:
            activity_windows.append((parse_time(s["startTime"]), parse_time(s["endTime"])))
            mode = STAT_MODES.get(activity["topCandidate"].get("type"))
            if mode:
                km[mode] += activity.get("distanceMeters", 0) / 1000

    # Google leaves some trips unlabelled (GPS track but no activity). Count the parts moving at road
    # speeds (15-90 km/h); slower movement is mostly GPS jitter and walking, so it's left out.
    activity_windows.sort()
    window_starts = [a for a, _ in activity_windows]
    unlabelled_road = 0
    for (t1, p1), (t2, p2) in zip(path, path[1:]):
        hours = (t2 - t1).total_seconds() / 3600
        i = bisect.bisect_right(window_starts, t1) - 1
        if hours <= 0 or hours >= 3 or (i >= 0 and activity_windows[i][0] <= t1 <= activity_windows[i][1]):
            continue
        d = distance_km(p1, p2)
        if d > 0.3 and 15 <= d / hours < 90:
            unlabelled_road += d
    km["unlabelled_road"] = unlabelled_road
    km["road"] = km["car"] + km["motorcycle"] + km["bus"] + unlabelled_road
    dates = sorted(s["startTime"][:10] for s in segments)

    place_list = sorted(places.values(), key=lambda p: min(p["months"]))
    for p in place_list:
        p["months"] = sorted(p["months"])
    out = {
        "period": {"from": dates[0][:7], "to": dates[-1][:7]},
        "km": {k: round(v) for k, v in km.most_common()},
        "states": sorted({p["state"] for p in place_list if p["state"]}),
        "places": place_list,
        "routes": routes,
    }
    with open(args.out, "w") as f:
        json.dump(out, f, separators=(",", ":"), ensure_ascii=False)
    print(f"{len(place_list)} places, {len(routes)} routes ({sum(len(r['points']) for r in routes)} points), "
          f"{len(out['states'])} states, private zones: {len(private)} -> {args.out}")


if __name__ == "__main__":
    main()
