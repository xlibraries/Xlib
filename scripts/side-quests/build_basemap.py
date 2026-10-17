"""Builds public/side-quests/basemap.json: the Side Quests map's base layer, drawn with India's
official boundaries (all of Jammu & Kashmir, Ladakh, Gilgit-Baltistan, Aksai Chin and Shaksgam
inside India), instead of map tiles that show de facto lines.

Sources (public domain, from https://github.com/nvkelso/natural-earth-vector/tree/master/geojson):
  ne_10m_admin_0_countries_ind.geojson   countries from India's point of view
  ne_10m_admin_1_states_provinces.geojson states (J&K and Ladakh are rebuilt to the official extent)
  ne_10m_populated_places_simple.geojson city labels

Usage (needs shapely):
  python3 scripts/side-quests/build_basemap.py --natural-earth /path/to/folder
"""
import argparse
import json

from shapely.geometry import box, mapping, shape
from shapely.ops import unary_union

REGION = box(55, -2, 105, 42)  # South Asia and neighbours
NEIGHBOUR_CAPITALS = {"Kathmandu", "Thimphu", "Dhaka", "Colombo", "Islamabad", "Male", "Naypyidaw", "Kabul"}


def rounded(geom, digits=3):
    def walk(coords):
        if isinstance(coords[0], (float, int)):
            return [round(coords[0], digits), round(coords[1], digits)]
        return [walk(c) for c in coords]
    g = mapping(geom)
    return {"type": g["type"], "coordinates": walk(g["coordinates"])}


def feature(geom, tolerance, **props):
    geom = geom.simplify(tolerance, preserve_topology=True)
    return {"type": "Feature", "properties": props, "geometry": rounded(geom)}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--natural-earth", required=True)
    parser.add_argument("--out", default="public/side-quests/basemap.json")
    args = parser.parse_args()
    folder = args.natural_earth

    countries = json.load(open(f"{folder}/ne_10m_admin_0_countries_ind.geojson"))["features"]
    india = next(shape(f["geometry"]) for f in countries if f["properties"]["ADM0_A3"] == "IND")

    # Land underlay (same detail as India) so no sea shows through where neighbours are simplified more
    land = unary_union([shape(f["geometry"]).intersection(REGION) for f in countries if shape(f["geometry"]).intersects(REGION)])
    country_features = [feature(land, 0.004, name="land", land=True, india=False)]
    for f in countries:
        geom = shape(f["geometry"])
        if not geom.intersects(REGION):
            continue
        is_india = f["properties"]["ADM0_A3"] == "IND"
        clipped = geom if is_india else geom.intersection(REGION)
        country_features.append(feature(clipped, 0.004 if is_india else 0.02,
                                        name=f["properties"]["NAME"], india=is_india))

    # States: Natural Earth's J&K/Ladakh follow the line of control, so rebuild them:
    #   J&K    = Natural Earth J&K + PoK ("Azad Kashmir")
    #   Ladakh = the rest of India's official northern territory (Gilgit-Baltistan, Aksai Chin, Shaksgam)
    provinces = json.load(open(f"{folder}/ne_10m_admin_1_states_provinces.geojson"))["features"]
    states = {f["properties"]["name"]: shape(f["geometry"]) for f in provinces if f["properties"].get("adm0_a3") == "IND"}
    pok = next(shape(f["geometry"]) for f in provinces if f["properties"].get("name") == "Azad Kashmir")
    jk = unary_union([states.pop("Jammu and Kashmir"), pok]).intersection(india)
    states.pop("Ladakh")
    others = unary_union(list(states.values()))
    ladakh = india.difference(unary_union([others, jk]))
    # keep only the northern piece (drop slivers left along coastlines and other borders)
    if ladakh.geom_type == "MultiPolygon":
        ladakh = unary_union([p for p in ladakh.geoms if p.centroid.y > 32])
    states["Jammu and Kashmir"] = jk
    states["Ladakh"] = ladakh
    state_features = [feature(geom.intersection(india), 0.006, name=name) for name, geom in sorted(states.items())]

    places = json.load(open(f"{folder}/ne_10m_populated_places_simple.geojson"))["features"]
    cities = []
    for f in places:
        p = f["properties"]
        in_india = p.get("adm0_a3") == "IND" and (p.get("pop_max", 0) >= 1_000_000 or p.get("featurecla") == "Admin-1 capital")
        neighbour = p.get("featurecla") == "Admin-0 capital" and p.get("name") in NEIGHBOUR_CAPITALS
        if in_india or neighbour:
            cities.append([p["name"], round(p["latitude"], 3), round(p["longitude"], 3), p.get("pop_max", 0), bool(in_india)])
    cities.sort(key=lambda c: -c[3])

    out = {
        "countries": {"type": "FeatureCollection", "features": country_features},
        "states": {"type": "FeatureCollection", "features": state_features},
        "cities": cities,
    }
    with open(args.out, "w") as fh:
        json.dump(out, fh, separators=(",", ":"))
    print(f"{len(country_features)} countries, {len(state_features)} states, {len(cities)} cities -> {args.out}")


if __name__ == "__main__":
    main()
