"""Tests for scripts/side-quests/build_travel_data.py using a tiny synthetic Timeline and GeoNames set.

The important guarantees: nothing near home/work/long-stay places is published, places are snapped to
town centres (never visit coordinates), and distance totals add up.
"""
import json
import math
import os
import subprocess
import sys
import tempfile
import unittest

SCRIPT = os.path.join(os.path.dirname(__file__), "..", "..", "scripts", "side-quests", "build_travel_data.py")

HOME = (12.90, 77.60)          # inside Bengaluru
LONG_STAY = (21.77, 79.80)     # a "family home" visited for weeks
JAIPUR = (26.92, 75.79)
AJMER = (26.45, 74.64)


def km(a, b):
    r = math.radians
    h = math.sin(r(b[0] - a[0]) / 2) ** 2 + math.cos(r(a[0])) * math.cos(r(b[0])) * math.sin(r(b[1] - a[1]) / 2) ** 2
    return 12742 * math.asin(math.sqrt(h))


def ll(p):
    return f"{p[0]}°, {p[1]}°"


def visit(start, end, point, kind="UNKNOWN"):
    return {"startTime": start, "endTime": end, "visit": {"topCandidate": {"semanticType": kind, "placeLocation": {"latLng": ll(point)}}}}


def activity(start, end, mode, meters):
    return {"startTime": start, "endTime": end, "activity": {"topCandidate": {"type": mode}, "distanceMeters": meters}}


def path(points):
    return {"startTime": points[0][0], "endTime": points[-1][0], "timelinePath": [{"time": t, "point": ll(p)} for t, p in points]}


def timeline():
    segs = [
        visit("2026-01-01T00:00:00+05:30", "2026-01-01T10:00:00+05:30", HOME, "INFERRED_HOME"),
        visit("2026-02-01T00:00:00+05:30", "2026-02-20T00:00:00+05:30", LONG_STAY),   # 19 days -> private
        visit("2026-03-01T10:00:00+05:30", "2026-03-01T12:00:00+05:30", (26.93, 75.80)),   # near Jaipur centre
        activity("2026-03-02T08:00:00+05:30", "2026-03-02T11:00:00+05:30", "IN_PASSENGER_VEHICLE", 135000),
        # GPS fixes every ~25 km (gaps over 60 km are treated as missing data, not drawn)
        path([("2026-03-02T08:00:00+05:30", JAIPUR), ("2026-03-02T08:30:00+05:30", (26.85, 75.55)),
              ("2026-03-02T09:00:00+05:30", (26.75, 75.30)), ("2026-03-02T09:30:00+05:30", (26.65, 75.05)),
              ("2026-03-02T10:15:00+05:30", (26.55, 74.85)), ("2026-03-02T11:00:00+05:30", AJMER)]),
        activity("2026-03-05T08:00:00+05:30", "2026-03-05T09:00:00+05:30", "MOTORCYCLING", 40000),
        # a drive around home: must never become a public route
        activity("2026-04-01T08:00:00+05:30", "2026-04-01T09:00:00+05:30", "IN_PASSENGER_VEHICLE", 20000),
        path([("2026-04-01T08:00:00+05:30", HOME), ("2026-04-01T08:30:00+05:30", (12.95, 77.65)), ("2026-04-01T09:00:00+05:30", (12.99, 77.70))]),
        # movement near the long-stay place: must be clipped
        activity("2026-02-05T08:00:00+05:30", "2026-02-05T09:00:00+05:30", "IN_PASSENGER_VEHICLE", 30000),
        path([("2026-02-05T08:00:00+05:30", LONG_STAY), ("2026-02-05T09:00:00+05:30", (21.90, 79.90))]),
    ]
    return {"semanticSegments": segs}


GEONAMES = [
    # geonameid, name, asciiname, alt, lat, lng, fclass, fcode, country, cc2, admin1, ..., population(14)
    ("1", "Jaipur", "Jaipur", 26.9124, 75.7873, "IN", "24", 3000000),
    ("2", "Ajmer", "Ajmer", 26.4499, 74.6399, "IN", "24", 500000),
    ("3", "Bengaluru", "Bengaluru", 12.9716, 77.5946, "IN", "19", 8000000),
    ("4", "Katangi", "Katangi", 21.7700, 79.8000, "IN", "35", 15000),
    ("5", "Tiny Village", "Tiny Village", 26.9300, 75.8000, "IN", "24", 500),
]


class BuildTravelDataTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        with open(os.path.join(cls.tmp, "timeline.json"), "w") as f:
            json.dump(timeline(), f)
        with open(os.path.join(cls.tmp, "cities1000.txt"), "w") as f:
            for gid, name, ascii_, lat, lng, cc, admin1, pop in GEONAMES:
                row = [gid, name, ascii_, "", str(lat), str(lng), "P", "PPL", cc, "", admin1, "", "", "", str(pop), "", "", "", ""]
                f.write("\t".join(row) + "\n")
        with open(os.path.join(cls.tmp, "admin1CodesASCII.txt"), "w") as f:
            f.write("IN.24\tRajasthan\tRajasthan\t1\nIN.19\tKarnataka\tKarnataka\t2\nIN.35\tMadhya Pradesh\tMadhya Pradesh\t3\n")
        cls.out = os.path.join(cls.tmp, "travel.json")
        subprocess.run([sys.executable, "-I", SCRIPT, "--timeline", os.path.join(cls.tmp, "timeline.json"),
                        "--geonames", cls.tmp, "--out", cls.out], check=True, capture_output=True)
        with open(cls.out) as f:
            cls.data = json.load(f)

    def all_points(self):
        pts = [(p["lat"], p["lng"]) for p in self.data["places"]]
        return pts + [tuple(x) for r in self.data["routes"] for x in r["points"]]

    def test_places_are_town_centres_not_visit_points(self):
        self.assertEqual([p["name"] for p in self.data["places"]], ["Jaipur"])
        jaipur = self.data["places"][0]
        self.assertEqual((jaipur["lat"], jaipur["lng"]), (26.91, 75.79))   # GeoNames centre, rounded
        self.assertEqual(jaipur["state"], "Rajasthan")
        self.assertEqual(jaipur["months"], ["2026-03"])

    def test_nothing_near_home_or_long_stay_places(self):
        for p in self.all_points():
            self.assertGreaterEqual(km(p, (12.9716, 77.5946)), 40, p)
            self.assertGreaterEqual(km(p, LONG_STAY), 30, p)

    def test_road_trip_route_is_kept_and_simplified(self):
        self.assertEqual(len(self.data["routes"]), 1)
        route = self.data["routes"][0]
        self.assertEqual(route["mode"], "car")
        self.assertGreaterEqual(len(route["points"]), 2)
        for lat, lng in route["points"]:
            self.assertEqual(round(lat, 2), lat)
            self.assertEqual(round(lng, 2), lng)

    def test_distance_totals(self):
        self.assertEqual(self.data["km"]["car"], 185)
        self.assertEqual(self.data["km"]["motorcycle"], 40)
        self.assertGreaterEqual(self.data["km"]["road"], 225)
        self.assertEqual(self.data["states"], ["Rajasthan"])
        self.assertEqual(self.data["period"], {"from": "2026-01", "to": "2026-04"})


if __name__ == "__main__":
    unittest.main()
