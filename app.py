import copy
import json
import os
import re
import time
from typing import Dict, List, Optional, Tuple

from flask import Flask, jsonify, request
from flask_cors import CORS

from algorithm.bfs import bfs
from algorithm.dfs import dfs
from algorithm.dijkstra import dijkstra
from algorithm.iterative_deepening_dfs import iddfs
from algorithm.uniform_cost_search import uniform_cost_search

app = Flask(__name__)
CORS(app)

ALGORITHMS = {
    "Dijkstra": dijkstra,
    "BFS": bfs,
    "DFS": dfs,
    "IDDFS": iddfs,
    "UCS": uniform_cost_search,
}
DEFAULT_SPEED_KMH = 35.0  # subway-ish

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ADJ_JS_PATH = os.path.join(BASE_DIR, "data", "fileJs", "adj_list_with_weights.js")
NODES_JS_PATH = os.path.join(BASE_DIR, "data", "fileJs", "nodes_latlon1.js")


def _load_adjacency(path: str) -> Dict[str, Dict[str, float]]:
    text = open(path, "r", encoding="utf-8").read()
    m = re.search(r"const\s+adjListWithWeights\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not m:
        raise ValueError(f"Cannot parse {path}")
    raw = json.loads(m.group(1))
    adj: Dict[str, Dict[str, float]] = {}
    for u, neighbors in raw.items():
        adj[str(u)] = {}
        for item in neighbors or []:
            v = item.get("node") or item.get("node_neighbor") or item.get("to")
            if not v:
                continue
            adj[str(u)][str(v)] = float(item.get("weight", 1)) * 1000  # km → m
    return adj


def _load_nodes(path: str) -> Dict[str, Dict[str, float]]:
    text = open(path, "r", encoding="utf-8").read()

    patterns = [
        r"const\s+nodesLatLon\s*=\s*(\[.*?\])\s*;",
        r"let\s+nodesLatLon\s*=\s*(\[.*?\])\s*;",
        r"var\s+nodesLatLon\s*=\s*(\[.*?\])\s*;",
        r"window\.nodesLatLon\s*=\s*(\[.*?\])\s*;",
        r"nodesLatLon\s*=\s*(\[.*?\])\s*;",
    ]
    m = None
    for p in patterns:
        m = re.search(p, text, re.S)
        if m:
            break

    if not m:
        raise ValueError(
            f"Cannot parse {path}. Expected one of: "
            "window.nodesLatLon = [...], const nodesLatLon = [...], "
            "let nodesLatLon = [...], var nodesLatLon = [...]"
        )

    raw_text = m.group(1)

    # JS uses unquoted keys; convert id:, name:, lat:, lon: to quoted form
    raw_text = re.sub(
        r"(\b)(id|name|lat|lon|route|routes|route_short_name|route_short_names|route_long_name|route_long_names|route_color|route_colors)(\s*):",
        r'\1"\2"\3:',
        raw_text
    )

    # Strip trailing commas before } or ]
    raw_text = re.sub(r",(\s*[}\]])", r"\1", raw_text)

    raw = json.loads(raw_text)

    nodes: Dict[str, Dict[str, float]] = {}
    for n in raw:
        nid = str(n.get("id"))
        nodes[nid] = {
            "id": nid,
            "name": n.get("name") or nid,
            "lat": float(n["lat"]),
            "lon": float(n["lon"]),
            "route": str(n.get("route", "")),
            "route_short_name": str(n.get("route_short_name", "")),
            "routes": n.get("routes", []),
            "route_short_names": n.get("route_short_names", []),
            "route_colors": n.get("route_colors", []),
        }

    return nodes

ADJACENCY = _load_adjacency(ADJ_JS_PATH)
NODES = _load_nodes(NODES_JS_PATH)
_ORIGINAL_ADJACENCY = copy.deepcopy(ADJACENCY)
SETUPS: List[dict] = []  # [{type, start, end, severity, label, edges:[(a,b,w)], coords:[[]]}]

print(f"Loaded {len(NODES)} nodes, {sum(len(v) for v in ADJACENCY.values())} edges")


def _public_setups() -> List[dict]:
    return [
        {
            "type": s["type"],
            "label": s["label"],
            "coords": s.get("coords", []),
            "polygon": s.get("polygon"),
            "direction": s.get("direction"),
            "factor": s.get("factor"),
            "start_id": s.get("start_id"),
            "end_id": s.get("end_id"),
        }
        for s in SETUPS
    ]

def _point_in_polygon(lat: float, lon: float, polygon: List[List[float]]) -> bool:
    """Ray-cast point-in-polygon. Polygon is a list of [lat, lon]."""
    n = len(polygon)
    if n < 3:
        return False
    inside = False
    j = n - 1
    for i in range(n):
        yi, xi = polygon[i][0], polygon[i][1]
        yj, xj = polygon[j][0], polygon[j][1]
        if ((yi > lat) != (yj > lat)) and (
            lon < (xj - xi) * (lat - yi) / ((yj - yi) or 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def _segments_intersect(
    p1: List[float], p2: List[float], p3: List[float], p4: List[float]
) -> bool:
    """True if segment p1-p2 properly crosses segment p3-p4. Points are [lat, lon]."""
    def ccw(a, b, c):
        return (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])

    d1 = ccw(p3, p4, p1)
    d2 = ccw(p3, p4, p2)
    d3 = ccw(p1, p2, p3)
    d4 = ccw(p1, p2, p4)
    return (
        ((d1 > 0 and d2 < 0) or (d1 < 0 and d2 > 0))
        and ((d3 > 0 and d4 < 0) or (d3 < 0 and d4 > 0))
    )


def _segment_crosses_polygon(
    a: List[float], b: List[float], polygon: List[List[float]]
) -> bool:
    """True if segment a-b crosses ANY edge of the polygon, OR lies entirely inside it."""
    n = len(polygon)
    for i in range(n):
        if _segments_intersect(a, b, polygon[i], polygon[(i + 1) % n]):
            return True
    mid_lat = (a[0] + b[0]) / 2
    mid_lon = (a[1] + b[1]) / 2
    return _point_in_polygon(mid_lat, mid_lon, polygon)


def _point_to_segment_distance_sq(
    px: float, py: float, ax: float, ay: float, bx: float, by: float
) -> float:
    """Squared distance from P to segment AB (flat-plane approx in lat/lon degrees)."""
    dx, dy = bx - ax, by - ay
    seg_len_sq = dx * dx + dy * dy
    if seg_len_sq == 0:
        ex, ey = px - ax, py - ay
        return ex * ex + ey * ey
    t = ((px - ax) * dx + (py - ay) * dy) / seg_len_sq
    if t < 0.0:
        t = 0.0
    elif t > 1.0:
        t = 1.0
    cx, cy = ax + t * dx, ay + t * dy
    ex, ey = px - cx, py - cy
    return ex * ex + ey * ey


def _restore_edges(edges):
    for a, b, w in edges:
        ADJACENCY.setdefault(a, {})[b] = w


def _nearest_node(lat: float, lon: float) -> Optional[str]:
    best, best_d = None, float("inf")
    for nid, n in NODES.items():
        d = (n["lat"] - lat) ** 2 + (n["lon"] - lon) ** 2
        if d < best_d:
            best, best_d = nid, d
    return best


def _nearest_edge(lat: float, lon: float) -> Optional[Tuple[str, str]]:
    """Endpoints (u, v) of the railway edge whose segment is closest to (lat, lon)."""
    best: Optional[Tuple[str, str]] = None
    best_d = float("inf")
    for u, neighbors in ADJACENCY.items():
        if u not in NODES:
            continue
        un = NODES[u]
        for v in neighbors:
            if v not in NODES:
                continue
            vn = NODES[v]
            d = _point_to_segment_distance_sq(
                lat, lon, un["lat"], un["lon"], vn["lat"], vn["lon"]
            )
            if d < best_d:
                best_d = d
                best = (u, v)
    return best


def _resolve_edge(start_value, end_value) -> Optional[Tuple[str, str]]:
    """Snap two clicks to the nearest edge using their midpoint, then orient so the
    endpoint closer to the FIRST click is `src`. This makes 'forward' = first→second."""
    if (not isinstance(start_value, list) or len(start_value) != 2
            or not isinstance(end_value, list) or len(end_value) != 2):
        return None
    lat1, lon1 = float(start_value[0]), float(start_value[1])
    lat2, lon2 = float(end_value[0]), float(end_value[1])
    edge = _nearest_edge((lat1 + lat2) / 2, (lon1 + lon2) / 2)
    if not edge:
        return None
    u, v = edge
    du = (NODES[u]["lat"] - lat1) ** 2 + (NODES[u]["lon"] - lon1) ** 2
    dv = (NODES[v]["lat"] - lat1) ** 2 + (NODES[v]["lon"] - lon1) ** 2
    return (u, v) if du <= dv else (v, u)


def _resolve_node(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, list) and len(value) == 2:
        return _nearest_node(float(value[0]), float(value[1]))
    return str(value)


def _click_latlon(value, resolved_id: Optional[str]) -> Optional[List[float]]:
    """Return the original click coords if value was [lat,lng], else the station's coords."""
    if isinstance(value, list) and len(value) == 2:
        return [float(value[0]), float(value[1])]
    if resolved_id and resolved_id in NODES:
        return [NODES[resolved_id]["lat"], NODES[resolved_id]["lon"]]
    return None


def _run(algo: str, src: str, tgt: str) -> Tuple[Optional[List[str]], List[str], Optional[float]]:
    fn = ALGORITHMS[algo]
    if algo == "IDDFS":
        return fn(ADJACENCY, src, tgt, max_depth=10000)
    return fn(ADJACENCY, src, tgt)


def _path_coords(path: List[str]) -> List[List[float]]:
    return [[NODES[n]["lat"], NODES[n]["lon"]] for n in path if n in NODES]
def _path_segments(path: List[str]) -> List[List[List[float]]]:
    segs = []

    for i in range(len(path) - 1):
        u, v = path[i], path[i + 1]

        if u in NODES and v in NODES:
            segs.append([
                [NODES[u]["lat"], NODES[u]["lon"]],
                [NODES[v]["lat"], NODES[v]["lon"]],
            ])

    return segs

def _route_set(route_short_name: str) -> set:
    if not route_short_name:
        return set()
    return set(str(route_short_name).split("/"))


def _waypoints(path: List[str]) -> List[dict]:
    out = []
    prev_route_short = ""

    for i, n in enumerate(path):
        if n not in NODES:
            continue

        node = NODES[n]

        route_short_names = node.get("route_short_names", [])
        routes = node.get("routes", [])

        if isinstance(route_short_names, list) and route_short_names:
            route_short_name = "/".join([str(x) for x in route_short_names if str(x)])
        else:
            route_short_name = str(node.get("route_short_name", "") or node.get("route", ""))

        if isinstance(routes, list) and routes:
            route = "/".join([str(x) for x in routes if str(x)])
        else:
            route = str(node.get("route", ""))

        prev_set = _route_set(prev_route_short)
        curr_set = _route_set(route_short_name)

        transfer = (
            i > 0
            and prev_set
            and curr_set
            and prev_set.isdisjoint(curr_set)
        )

        out.append({
            "id": n,
            "name": node["name"],
            "lat": node["lat"],
            "lon": node["lon"],
            "route": route,
            "route_short_name": route_short_name,
            "transfer": transfer,
            "from_route": prev_route_short if transfer else "",
            "to_route": route_short_name if transfer else "",
        })

        if route_short_name:
            prev_route_short = route_short_name

    return out


@app.route("/stations", methods=["GET"])
def stations():
    return jsonify(sorted(
        [{
            "id": nid,
            "name": n["name"],
            "lat": n["lat"],
            "lon": n["lon"],
            "route": n.get("route", ""),
            "route_short_name": n.get("route_short_name", ""),
            "routes": n.get("routes", []),
            "route_short_names": n.get("route_short_names", []),
            "route_colors": n.get("route_colors", []),
        }
        for nid, n in NODES.items()],
        key=lambda x: x["name"],
    ))


def _railway_edges() -> List[List[List[float]]]:
    seen = set()
    out = []
    for u, nbrs in _ORIGINAL_ADJACENCY.items():
        if u not in NODES:
            continue
        for v in nbrs:
            if v not in NODES:
                continue
            key = (u, v) if u < v else (v, u)
            if key in seen:
                continue
            seen.add(key)
            out.append([
                [NODES[u]["lat"], NODES[u]["lon"]],
                [NODES[v]["lat"], NODES[v]["lon"]],
            ])
    return out


@app.route("/state", methods=["GET"])
def state():
    return jsonify({
        "stations": [
            {
                "id": nid,
                "name": n["name"],
                "lat": n["lat"],
                "lon": n["lon"],
                "route": n.get("route", ""),
                "route_short_name": n.get("route_short_name", ""),
                "routes": n.get("routes", []),
                "route_short_names": n.get("route_short_names", []),
                "route_colors": n.get("route_colors", []),
            }
            for nid, n in NODES.items()
        ],
        "railway": _railway_edges(),
        "setups": _public_setups(),
    })


@app.route("/find_path", methods=["POST"])
def find_path():
    data = request.get_json() or {}
    algo = data.get("algorithm", "Dijkstra")
    if algo not in ALGORITHMS:
        return jsonify({"error": f"Unknown algorithm: {algo}"}), 400

    src = _resolve_node(data.get("start"))
    tgt = _resolve_node(data.get("end"))
    if not src or not tgt:
        return jsonify({"error": "Missing start or end"}), 400
    if src == tgt:
        return jsonify({"error": "Start and end must differ"}), 400
    if src not in NODES or tgt not in NODES:
        return jsonify({"error": "Unknown station id"}), 400

    t0 = time.perf_counter()
    try:
        path, explored, cost = _run(algo, src, tgt)
    except Exception as e:
        return jsonify({"error": f"{algo} failed: {e}"}), 500
    elapsed = (time.perf_counter() - t0) * 1000

    if not path:
        return jsonify({"error": f"No path from {src} to {tgt}"}), 404

    cost_m = float(cost) if cost not in (None, float("inf")) else 0.0
    cost_km = round(cost_m / 1000, 3)
    travel_min = round(cost_km / DEFAULT_SPEED_KMH * 60, 1)

    start_click = _click_latlon(data.get("start"), src)
    end_click = _click_latlon(data.get("end"), tgt)
    start_station = [NODES[src]["lat"], NODES[src]["lon"]]
    end_station = [NODES[tgt]["lat"], NODES[tgt]["lon"]]

    return jsonify({
        "path": path,
        "path_coords": _path_coords(path),
        "segments": _path_segments(path),
        "waypoints": _waypoints(path),
        "start_path": [start_click, start_station] if start_click else None,
        "end_path": [end_click, end_station] if end_click else None,
        "start_station": start_station,
        "end_station": end_station,
        "algorithm": algo,
        "cost_km": cost_km,
        "travel_min": travel_min,
        "nodes_in_path": len(path),
        "nodes_expanded": len(explored or []),
        "elapsed_ms": round(elapsed, 1),
    })


@app.route("/compare_path", methods=["POST"])
def compare_path():
    data = request.get_json() or {}
    src = _resolve_node(data.get("start"))
    tgt = _resolve_node(data.get("end"))
    if not src or not tgt or src == tgt:
        return jsonify({"error": "Invalid start/end"}), 400

    results = []
    for algo in ALGORITHMS.keys():
        t0 = time.perf_counter()
        try:
            path, explored, cost = _run(algo, src, tgt)
            elapsed = (time.perf_counter() - t0) * 1000
            if path:
                cost_m = float(cost) if cost not in (None, float("inf")) else 0.0
                results.append({
                    "algorithm": algo,
                    "cost_km": round(cost_m / 1000, 3),
                    "travel_min": round(cost_m / 1000 / DEFAULT_SPEED_KMH * 60, 1),
                    "nodes_in_path": len(path),
                    "nodes_expanded": len(explored or []),
                    "elapsed_ms": round(elapsed, 1),
                    "path": path,
                    "path_coords": _path_coords(path),
                })
            else:
                results.append({"algorithm": algo, "error": "No path"})
        except Exception as e:
            results.append({"algorithm": algo, "error": str(e)})
    return jsonify(results)


@app.route("/setup_road", methods=["POST"])
def setup_road():
    """Block the railway edge nearest to the line the user drew.
    direction: forward (first→second click) | backward | both."""
    data = request.get_json() or {}
    direction = (data.get("direction") or "both").lower()
    if direction not in ("forward", "backward", "both"):
        return jsonify({"error": "direction must be forward|backward|both"}), 400

    edge = _resolve_edge(data.get("start"), data.get("end"))
    if not edge:
        return jsonify({"error": "Need start and end as [lat, lng] coords near a railway"}), 400
    src, tgt = edge

    targets = []
    if direction in ("forward", "both") and tgt in ADJACENCY.get(src, {}):
        targets.append((src, tgt))
    if direction in ("backward", "both") and src in ADJACENCY.get(tgt, {}):
        targets.append((tgt, src))
    if not targets:
        return jsonify({"error": "Edge already blocked in that direction"}), 400

    saved = []
    for a, b in targets:
        saved.append((a, b, ADJACENCY[a][b]))
        del ADJACENCY[a][b]

    arrow = {"forward": "→", "backward": "←", "both": "↔"}[direction]
    SETUPS.append({
        "type": "road",
        "direction": direction,
        "label": f"🚫 {NODES[src]['name']} {arrow} {NODES[tgt]['name']}",
        "edges": saved,
        "start_id": src,
        "end_id": tgt,
        "coords": [[
            [NODES[src]["lat"], NODES[src]["lon"]],
            [NODES[tgt]["lat"], NODES[tgt]["lon"]],
        ]],
    })
    return jsonify({"setups": _public_setups()})


@app.route("/setup_area", methods=["POST"])
def setup_area():
    """Block every edge that touches a station inside the given polygon."""
    data = request.get_json() or {}
    polygon = data.get("polygon") or []
    if len(polygon) < 3:
        return jsonify({"error": "Polygon needs at least 3 points"}), 400

    inside_nodes = {
        nid for nid, n in NODES.items() if _point_in_polygon(n["lat"], n["lon"], polygon)
    }

    saved = []
    # 1) Edges with at least one endpoint inside the polygon.
    for a in list(inside_nodes):
        for b in list(ADJACENCY.get(a, {}).keys()):
            saved.append((a, b, ADJACENCY[a][b]))
            del ADJACENCY[a][b]
    for a in list(ADJACENCY.keys()):
        if a in inside_nodes:
            continue
        for b in list(ADJACENCY[a].keys()):
            if b in inside_nodes:
                saved.append((a, b, ADJACENCY[a][b]))
                del ADJACENCY[a][b]

    # 2) Edges between two outside stations whose straight segment crosses the polygon.
    #    Without this, long edges (e.g. express segments) can tunnel through the area.
    for a in list(ADJACENCY.keys()):
        if a in inside_nodes or a not in NODES:
            continue
        a_pt = [NODES[a]["lat"], NODES[a]["lon"]]
        for b in list(ADJACENCY[a].keys()):
            if b in inside_nodes or b not in NODES:
                continue
            b_pt = [NODES[b]["lat"], NODES[b]["lon"]]
            if _segment_crosses_polygon(a_pt, b_pt, polygon):
                saved.append((a, b, ADJACENCY[a][b]))
                del ADJACENCY[a][b]

    if not saved:
        return jsonify({"error": "No edges fall inside or cross the selected area"}), 400

    SETUPS.append({
        "type": "area",
        "label": f"🛑 Area ({len(inside_nodes)} stations, {len(saved)} edges)",
        "edges": saved,
        "polygon": polygon,
        "coords": [],
    })
    return jsonify({"setups": _public_setups()})


@app.route("/setup_congestion", methods=["POST"])
def setup_congestion():
    """Multiply the weight of the railway edge nearest to the user's drawn line by `factor`."""
    data = request.get_json() or {}
    try:
        factor = float(data.get("factor", 2.0))
    except (TypeError, ValueError):
        return jsonify({"error": "Invalid factor"}), 400
    if factor <= 1.0:
        return jsonify({"error": "Factor must be greater than 1"}), 400

    edge = _resolve_edge(data.get("start"), data.get("end"))
    if not edge:
        return jsonify({"error": "Need start and end as [lat, lng] coords near a railway"}), 400
    src, tgt = edge

    saved = []
    for a, b in [(src, tgt), (tgt, src)]:
        if b in ADJACENCY.get(a, {}):
            saved.append((a, b, ADJACENCY[a][b]))
            ADJACENCY[a][b] *= factor
    if not saved:
        return jsonify({"error": "No edge between the selected stations"}), 400

    SETUPS.append({
        "type": "congestion",
        "factor": factor,
        "label": f"🚦 {NODES[src]['name']} ↔ {NODES[tgt]['name']} ×{factor:g}",
        "edges": saved,
        "start_id": src,
        "end_id": tgt,
        "coords": [[
            [NODES[src]["lat"], NODES[src]["lon"]],
            [NODES[tgt]["lat"], NODES[tgt]["lon"]],
        ]],
    })
    return jsonify({"setups": _public_setups()})


@app.route("/restore_last_setup", methods=["POST"])
def restore_last_setup():
    """Pop the most recent setup of the given type (or any type if not provided)."""
    stype = (request.get_json() or {}).get("type")
    for i in range(len(SETUPS) - 1, -1, -1):
        if stype is None or SETUPS[i]["type"] == stype:
            s = SETUPS.pop(i)
            _restore_edges(s["edges"])
            return jsonify({"setups": _public_setups()})
    return jsonify({"error": f"No {stype or 'any'} setup to restore"}), 404


@app.route("/delete_setup", methods=["POST"])
def delete_setup():
    idx = (request.get_json() or {}).get("index")
    if not isinstance(idx, int) or idx < 0 or idx >= len(SETUPS):
        return jsonify({"error": "Invalid index"}), 400
    s = SETUPS.pop(idx)
    _restore_edges(s["edges"])
    return jsonify({"setups": _public_setups()})


@app.route("/reset_setup", methods=["POST"])
def reset_setup():
    global SETUPS, ADJACENCY
    ADJACENCY = copy.deepcopy(_ORIGINAL_ADJACENCY)
    SETUPS = []
    return jsonify({"setups": []})


if __name__ == "__main__":
    app.run(debug=True, use_reloader=False, port=5000)
