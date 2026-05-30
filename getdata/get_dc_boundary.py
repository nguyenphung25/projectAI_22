import requests
import json
import os

def get_dc_boundary():
    """
    Tải boundary Washington DC từ Nominatim OSM
    dùng osm_id cố định = 162069 (Washington DC)
    """

    url = (
        "https://nominatim.openstreetmap.org/lookup"
        "?osm_ids=R162069"
        "&format=json"
        "&polygon_geojson=1"
    )
    headers = {"User-Agent": "dc-metro-project/1.0"}

    print("⏳ Đang tải boundary Washington DC...")

    try:
        response = requests.get(url, headers=headers, timeout=15)

        # In ra để debug nếu có lỗi
        print(f"   Status code : {response.status_code}")
        print(f"   Response    : {response.text[:200]}")

        data = response.json()

    except requests.exceptions.Timeout:
        print("❌ Timeout — server không phản hồi. Thử lại sau.")
        return
    except requests.exceptions.JSONDecodeError:
        print("❌ Server trả về dữ liệu lỗi:")
        print(response.text[:500])
        return

    if not data:
        print("❌ Không có dữ liệu trả về.")
        return

    item = data[0]
    boundary = item['geojson']

    # Tạo GeoJSON chuẩn
    geojson = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "@id"        : "relation/162069",
                    "admin_level": "4",
                    "boundary"   : "administrative",
                    "name"       : item.get("display_name", "Washington, D.C."),
                    "name:en"    : "Washington, D.C.",
                    "type"       : "boundary"
                },
                "geometry": boundary
            }
        ]
    }

    # Lưu file
    os.makedirs('data/fileCSV', exist_ok=True)
    output_path = 'data/fileCSV/dc_boundary.geojson'

    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(geojson, f, indent=2)

    coords = boundary['coordinates'][0]
    print(f"✅ Đã lưu vào {output_path}")
    print(f"   Số tọa độ : {len(coords)} điểm")
    print(f"   Kiểm tra  : lon={coords[0][0]:.4f}, lat={coords[0][1]:.4f}")
    print(f"   (DC đúng  : lon ≈ -77.xxxx, lat ≈ 38.xxxx)")


if __name__ == "__main__":
    get_dc_boundary()