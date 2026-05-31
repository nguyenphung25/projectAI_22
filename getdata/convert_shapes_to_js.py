import csv
import json
from collections import defaultdict

input_file = "data/fileTxt/shapes.txt"
output_file = "data/fileJs/metro_shapes.js"

shapes = defaultdict(list)

with open(input_file, "r", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)

    for row in reader:
        shape_id = row["shape_id"]
        lat = float(row["shape_pt_lat"])
        lon = float(row["shape_pt_lon"])
        sequence = int(row["shape_pt_sequence"])

        shapes[shape_id].append({
            "sequence": sequence,
            "coord": [lat, lon]
        })

# Sắp xếp điểm theo shape_pt_sequence
metro_shapes = {}

for shape_id, points in shapes.items():
    points.sort(key=lambda x: x["sequence"])
    metro_shapes[shape_id] = [p["coord"] for p in points]

with open(output_file, "w", encoding="utf-8") as f:
    f.write("window.metroShapes = ")
    json.dump(metro_shapes, f, ensure_ascii=False, indent=2)
    f.write(";")

print(f"Đã tạo file: {output_file}")