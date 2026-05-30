import os
import json
import math
import pandas as pd
from collections import defaultdict

BASE_DIR = os.path.dirname(os.path.dirname(__file__))

GTFS_DIR = os.path.join(BASE_DIR, "data", "fileTxt")
OUT_JS_DIR = os.path.join(BASE_DIR, "data", "fileJs")

os.makedirs(OUT_JS_DIR, exist_ok=True)


def haversine(lat1, lon1, lat2, lon2):
    R = 6371

    lat1, lon1, lat2, lon2 = map(
        math.radians,
        [lat1, lon1, lat2, lon2]
    )

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2)
        * math.sin(dlon / 2) ** 2
    )

    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def write_js(filename, variable_name, data):
    path = os.path.join(OUT_JS_DIR, filename)

    with open(path, "w", encoding="utf-8") as f:
        f.write(f"const {variable_name} = ")
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write(";\n")


stops = pd.read_csv(os.path.join(GTFS_DIR, "stops.txt"))
trips = pd.read_csv(os.path.join(GTFS_DIR, "trips.txt"))
stop_times = pd.read_csv(os.path.join(GTFS_DIR, "stop_times.txt"))

# =========================
# 1. Lấy danh sách ga
# =========================

if "location_type" in stops.columns:
    stations = stops[stops["location_type"] == 1].copy()
else:
    stations = stops.copy()

stations = stations[
    ["stop_id", "stop_name", "stop_lat", "stop_lon"]
].drop_duplicates()

# nodes.js
nodes = {}

for _, row in stations.iterrows():
    nodes[row["stop_id"]] = row["stop_name"]

write_js("nodes.js", "nodes", nodes)

# nodes_latlon.js
nodes_latlon = []

for _, row in stations.iterrows():
    nodes_latlon.append({
        "id": row["stop_id"],
        "name": row["stop_name"],
        "lat": float(row["stop_lat"]),
        "lon": float(row["stop_lon"])
    })

write_js("nodes_latlon.js", "nodesLatLon", nodes_latlon)

# =========================
# 2. Map stop con về ga cha
# =========================

stop_to_station = {}

for _, row in stops.iterrows():
    stop_id = row["stop_id"]
    parent_station = row.get("parent_station", None)

    if pd.notna(parent_station):
        stop_to_station[stop_id] = parent_station
    else:
        stop_to_station[stop_id] = stop_id

# =========================
# 3. Tạo cạnh giữa các ga liên tiếp
# =========================

stop_times = stop_times.merge(
    trips[["trip_id", "route_id"]],
    on="trip_id",
    how="left"
)

stop_times["station_id"] = stop_times["stop_id"].map(stop_to_station)

edges = set()

for trip_id, group in stop_times.groupby("trip_id"):
    group = group.sort_values("stop_sequence")
    station_list = group["station_id"].dropna().tolist()

    for a, b in zip(station_list, station_list[1:]):
        if a != b:
            edges.add((a, b))
            edges.add((b, a))

# =========================
# 4. adj_list.js
# =========================

adj_list = defaultdict(list)

for a, b in edges:
    adj_list[a].append(b)

adj_list = {
    node: sorted(list(set(neighbors)))
    for node, neighbors in adj_list.items()
}

write_js("adj_list.js", "adjList", adj_list)

# =========================
# 5. adj_list_with_weights.js
# =========================

station_pos = {}

for _, row in stations.iterrows():
    station_pos[row["stop_id"]] = (
        float(row["stop_lat"]),
        float(row["stop_lon"])
    )

adj_list_with_weights = defaultdict(list)

for a, b in edges:
    if a not in station_pos or b not in station_pos:
        continue

    lat1, lon1 = station_pos[a]
    lat2, lon2 = station_pos[b]

    weight = haversine(lat1, lon1, lat2, lon2)

    adj_list_with_weights[a].append({
        "node": b,
        "weight": round(weight, 3)
    })

adj_list_with_weights = dict(adj_list_with_weights)

write_js(
    "adj_list_with_weights.js",
    "adjListWithWeights",
    adj_list_with_weights
)

print("Done! Created JS files in data/fileJs")