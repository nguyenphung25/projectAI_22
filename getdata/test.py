import os
import re
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

OLD_NODES_PATH = os.path.join(BASE_DIR, "data", "fileJs", "nodes_latlon.js")
OUT_PATH = os.path.join(BASE_DIR, "data", "fileJs", "nodes_latlon1.js")

LINE_MAP = {
    "A": {
        "route": "RED",
        "short": "R",
        "long": "Red",
        "color": "#C80F2D",
    },
    "B": {
        "route": "RED",
        "short": "R",
        "long": "Red",
        "color": "#C80F2D",
    },
    "C": {
        "route": "BLUE/ORANGE/SILVER",
        "short": "B/O/S",
        "long": "Blue/Orange/Silver",
        "color": "#009CDE",
    },
    "D": {
        "route": "BLUE/ORANGE/SILVER",
        "short": "B/O/S",
        "long": "Blue/Orange/Silver",
        "color": "#009CDE",
    },
    "E": {
        "route": "GREEN/YELLOW",
        "short": "G/Y",
        "long": "Green/Yellow",
        "color": "#00B140",
    },
    "F": {
        "route": "GREEN/YELLOW",
        "short": "G/Y",
        "long": "Green/Yellow",
        "color": "#00B140",
    },
}


def parse_nodes_js(path):
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
        raise ValueError("Không đọc được nodes_latlon.js")

    raw = m.group(1)

    raw = re.sub(
        r"(\b)(id|name|lat|lon|route|routes|route_short_name|route_short_names|route_long_name|route_long_names|route_color|route_colors)(\s*):",
        r'\1"\2"\3:',
        raw,
    )

    raw = re.sub(r",(\s*[}\]])", r"\1", raw)

    return json.loads(raw)


def get_line_letters(node_id):
    """
    Ví dụ:
    STN_A04 -> ["A"]
    STN_A01_C01 -> ["A", "C"]
    STN_D03_F03 -> ["D", "F"]
    """
    return re.findall(r"([A-F])\d{2}", node_id)


def route_info_from_id(node_id):
    letters = get_line_letters(node_id)

    routes = []
    shorts = []
    longs = []
    colors = []

    for letter in letters:
        info = LINE_MAP.get(letter)
        if not info:
            continue

        # Có thể 1 nhóm như BLUE/ORANGE/SILVER chứa nhiều tuyến
        route_parts = info["route"].split("/")
        short_parts = info["short"].split("/")
        long_parts = info["long"].split("/")
        color = info["color"]

        for i, route in enumerate(route_parts):
            short = short_parts[i] if i < len(short_parts) else route
            long = long_parts[i] if i < len(long_parts) else route

            if route not in routes:
                routes.append(route)
                shorts.append(short)
                longs.append(long)
                colors.append(color)

    return routes, shorts, longs, colors


old_nodes = parse_nodes_js(OLD_NODES_PATH)

new_nodes = []

for node in old_nodes:
    nid = str(node.get("id"))
    name = str(node.get("name", nid))
    lat = float(node["lat"])
    lon = float(node["lon"])

    routes, shorts, longs, colors = route_info_from_id(nid)

    new_nodes.append({
        "id": nid,
        "name": name,
        "lat": lat,
        "lon": lon,

        "routes": routes,
        "route_short_names": shorts,
        "route_long_names": longs,
        "route_colors": colors,

        "route": "/".join(routes),
        "route_short_name": "/".join(shorts),
        "route_long_name": "/".join(longs),
    })

os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)

js = "const nodesLatLon = "
js += json.dumps(new_nodes, ensure_ascii=False, indent=2)
js += ";\n\nwindow.nodesLatLon = nodesLatLon;\n"

with open(OUT_PATH, "w", encoding="utf-8") as f:
    f.write(js)

missing = [n for n in new_nodes if not n["route_short_name"]]

print("DONE")
print("Output:", OUT_PATH)
print("Total nodes:", len(new_nodes))
print("Missing route:", len(missing))

if missing:
    print("Ví dụ node thiếu tuyến:")
    for n in missing[:10]:
        print("-", n["id"], n["name"])