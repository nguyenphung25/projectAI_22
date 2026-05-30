import csv
import json
import os
import re
from flask import Flask, request, jsonify
from flask_cors import CORS
from typing import Dict, List, Optional

# Import các thuật toán của bạn
from algorithm.dijkstra import dijkstra
from algorithm.bfs import bfs
from algorithm.dfs import dfs
from algorithm.iterative_deepening_dfs import iddfs
from algorithm.uniform_cost_search import uniform_cost_search

app = Flask(__name__)
CORS(app)

# Dữ liệu frontend đang dùng ID dạng chuỗi: "STN_N06", "STN_K05", ...
# Vì vậy backend cũng phải dùng string, KHÔNG ép int.
adj_dict_original: Dict[str, Dict[str, float]] = {}
DEFAULT_SPEED_MPS: float = 9.72


def _load_graph_from_js(js_path: str) -> Dict[str, Dict[str, float]]:
    """Đọc file adj_list_with_weights.js dạng: const adjListWithWeights = { ... };"""
    text = open(js_path, "r", encoding="utf-8").read()
    match = re.search(r"const\s+adjListWithWeights\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)

    if not match:
        raise ValueError(f"Không parse được object adjListWithWeights trong {js_path}")

    raw = json.loads(match.group(1))
    graph: Dict[str, Dict[str, float]] = {}

    for node_id, neighbors in raw.items():
        u = str(node_id)
        graph[u] = {}

        for item in neighbors or []:
            v = str(item.get("node") or item.get("node_neighbor") or item.get("to"))
            if not v or v == "None":
                continue

            graph[u][v] = float(item.get("weight", 1)) * 1000

    return graph


def _load_graph_from_csv(csv_path: str) -> Dict[str, Dict[str, float]]:
    """Fallback nếu bạn vẫn muốn dùng CSV. Node ID được giữ nguyên dạng string."""
    import ast

    graph: Dict[str, Dict[str, float]] = {}

    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.reader(f)
        next(reader, None)

        for row in reader:
            if not row or len(row) < 2:
                continue

            u = row[0].strip()
            if not u:
                continue

            graph[u] = {}
            neighbors_str = row[1].strip()

            if not neighbors_str or neighbors_str == "[]":
                continue

            cleaned = neighbors_str.replace("np.float64(", "").replace(")", "")

            try:
                parsed = ast.literal_eval(cleaned)

                for item in parsed:
                    if isinstance(item, (list, tuple)) and len(item) == 2:
                        v, w = item
                        graph[u][str(v)] = float(w) * 1000

            except Exception:
                # Nếu CSV format lỗi thì bỏ qua dòng đó, tránh crash server.
                pass

    return graph


# Ưu tiên đọc đúng file JS đang dùng ở frontend.
try:
    base_dir = os.path.dirname(os.path.abspath(__file__))

    candidate_paths = [
        os.path.join(base_dir, "data", "fileJs", "adj_list_with_weights.js"),
        os.path.join(base_dir, "adj_list_with_weights.js"),
        os.path.join(base_dir, "data", "adj_list_with_weights.js"),
        os.path.join(base_dir, "data", "fileCsv", "adj_list_with_weights.csv"),
    ]
    for path in candidate_paths:
        if os.path.exists(path):
            if path.endswith(".js"):
                adj_dict_original = _load_graph_from_js(path)
            else:
                adj_dict_original = _load_graph_from_csv(path)

            print(f"Đã tải graph từ {path}: {len(adj_dict_original)} node")
            break

    if not adj_dict_original:
        print("CẢNH BÁO: Không tải được graph. Kiểm tra vị trí file adj_list_with_weights.js/csv.")

except Exception as e:
    print(f"LỖI khi tải graph: {e}")


def _normalize_node_id(value) -> Optional[str]:
    if value is None:
        return None

    return str(value).strip()


def _normalize_edge(edge):
    if not isinstance(edge, (list, tuple)) or len(edge) != 2:
        return None

    u = _normalize_node_id(edge[0])
    v = _normalize_node_id(edge[1])

    if not u or not v:
        return None

    return u, v


def calculate_path_cost_on_graph(graph: Dict[str, Dict[str, float]], path: List[str]) -> Optional[float]:
    if not path or len(path) < 2:
        return 0.0

    total_cost = 0.0

    for i in range(len(path) - 1):
        u, v = str(path[i]), str(path[i + 1])

        if u in graph and v in graph.get(u, {}):
            total_cost += graph[u][v]
        else:
            return None

    return total_cost


@app.route('/find_path', methods=['POST'])
def find_path():
    data = request.get_json()

    if not data:
        return jsonify({"error": "Yêu cầu không chứa dữ liệu JSON."}), 400

    start_node = _normalize_node_id(data.get('start'))
    end_node = _normalize_node_id(data.get('end'))
    algorithm_name = data.get('algorithm', 'A Star')

    blocked_edges = [_normalize_edge(e) for e in data.get('blocked_edges', [])]
    blocked_edges = [e for e in blocked_edges if e]

    traffic_edges = [_normalize_edge(e) for e in data.get('traffic_edges', [])]
    traffic_edges = [e for e in traffic_edges if e]
    traffic_level = int(data.get('traffic_level', 1))

    flood_edges = [_normalize_edge(e) for e in data.get('flood_edges', [])]
    flood_edges = [e for e in flood_edges if e]
    flood_level = int(data.get('flood_level', 1))

    one_way_edges = [_normalize_edge(e) for e in data.get('one_way_edges', [])]
    one_way_edges = [e for e in one_way_edges if e]

    max_depth_iddfs = int(data.get('max_depth_iddfs', 10000))
    num_iterations_astar = int(data.get('iterations', 10000))

    if not start_node or not end_node:
        return jsonify({"error": "Thiếu node 'start' hoặc 'end'."}), 400

    if not adj_dict_original:
        return jsonify({"error": "Lỗi: Dữ liệu đồ thị gốc chưa được tải hoặc rỗng."}), 500

    all_nodes = set(adj_dict_original.keys())

    for u in adj_dict_original:
        all_nodes.update(adj_dict_original[u].keys())

    if start_node not in all_nodes or end_node not in all_nodes:
        return jsonify({
            "error": f"Node bắt đầu ({start_node}) hoặc kết thúc ({end_node}) không tồn tại trong dữ liệu đồ thị."
        }), 400

    # Tạo graph làm việc, đổi khoảng cách thành thời gian nếu cần.
    adj_list_filtered: Dict[str, Dict[str, float]] = {}

    for u, neighbors in adj_dict_original.items():
        adj_list_filtered[u] = {}

        for v, distance in neighbors.items():
            adj_list_filtered[u][v] = float(distance) / DEFAULT_SPEED_MPS

    # One-way: xóa cạnh ngược chiều.
    for source_ow, destination_ow in one_way_edges:
        if destination_ow in adj_list_filtered and source_ow in adj_list_filtered.get(destination_ow, {}):
            del adj_list_filtered[destination_ow][source_ow]

    # Blocked edges: xóa hai chiều.
    for u, v in blocked_edges:
        if u in adj_list_filtered and v in adj_list_filtered.get(u, {}):
            del adj_list_filtered[u][v]

        if v in adj_list_filtered and u in adj_list_filtered.get(v, {}):
            del adj_list_filtered[v][u]

    if any({u, v} == {start_node, end_node} for u, v in blocked_edges):
        return jsonify({
            "error": "Không thể tìm đường: Tuyến đường trực tiếp giữa điểm đầu và điểm cuối đã bị cấm."
        }), 400

    k = 1.0

    if traffic_level == 1:
        k = 1.75
    elif traffic_level == 2:
        k = 2.25
    elif traffic_level == 3:
        k = 2.75

    if k != 1.0:
        for u, v in traffic_edges:
            if u in adj_list_filtered and v in adj_list_filtered.get(u, {}):
                adj_list_filtered[u][v] *= k

            if v in adj_list_filtered and u in adj_list_filtered.get(v, {}):
                adj_list_filtered[v][u] *= k

    f_factor = 1.0
    remove_edge_due_to_flood = False

    if flood_level == 1:
        f_factor = 2.25
    elif flood_level == 2:
        f_factor = 2.75
    elif flood_level == 3:
        remove_edge_due_to_flood = True

    for u, v in flood_edges:
        if remove_edge_due_to_flood:
            if u in adj_list_filtered and v in adj_list_filtered.get(u, {}):
                del adj_list_filtered[u][v]

            if v in adj_list_filtered and u in adj_list_filtered.get(v, {}):
                del adj_list_filtered[v][u]

        elif f_factor != 1.0:
            if u in adj_list_filtered and v in adj_list_filtered.get(u, {}):
                adj_list_filtered[u][v] *= f_factor

            if v in adj_list_filtered and u in adj_list_filtered.get(v, {}):
                adj_list_filtered[v][u] *= f_factor

    algorithms = {
        'Dijkstra': dijkstra,
        'BFS': bfs,
        'DFS': dfs,
        'Iterative Deepening DFS': iddfs,
        'Uniform Cost Search': uniform_cost_search,
    }

    if algorithm_name not in algorithms:
        return jsonify({"error": "Thuật toán không hợp lệ."}), 400

    try:
        path_finding_function = algorithms[algorithm_name]

        if algorithm_name == 'Iterative Deepening DFS':
            path_nodes, explored_node_ids, cost_with_factors = path_finding_function(
                adj_list_filtered,
                start_node,
                end_node,
                max_depth=max_depth_iddfs
            )

        else:
            path_nodes, explored_node_ids, cost_with_factors = path_finding_function(
                adj_list_filtered,
                start_node,
                end_node
            )

    except Exception as e_algo:
        import traceback
        traceback.print_exc()

        return jsonify({
            "error": f"Lỗi trong quá trình tìm đường với {algorithm_name}. Chi tiết: {str(e_algo)}"
        }), 500

    if not path_nodes:
        return jsonify({
            "error": f"Không tìm thấy đường đi từ {start_node} đến {end_node} bằng thuật toán {algorithm_name}.",
            "explored_nodes": list(set(explored_node_ids)) if explored_node_ids else []
        }), 404

    path_nodes = [str(x) for x in path_nodes]

    real_distance = calculate_path_cost_on_graph(adj_dict_original, path_nodes)

    if cost_with_factors == float('inf'):
        cost_with_factors = None

    return jsonify({
        "path": path_nodes,
        "explored_nodes": list(set(str(x) for x in explored_node_ids)) if explored_node_ids else [],
        "message": "Đường đi đã được tìm thấy.",
        "cost_with_factors": cost_with_factors,
        "real_distance": real_distance
    })


if __name__ == '__main__':
    app.run(debug=True, use_reloader=False)