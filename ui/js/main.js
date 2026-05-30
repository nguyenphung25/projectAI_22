// Các biến toàn cục
let reset = false; // Biến reset, dùng để reset lại bản đồ
let isBlockMode = false; // Biến trạng thái vẽ đường cấm
let isDrawing = false; // Biến đang trong quá trình vẽ đường cấm
let algorithm = "Dijkstra"; // Biến trạng thái thuật toán tìm đường
let selectedPoints = []; // Danh sách các điểm được chọn
let blockedEdges = []; // Danh sách cạnh bị cấm
let startPoint = null; //
let temporaryLine = null; // Đường nối từ điểm cuối đến con trỏ chuột trong chế độ vẽ đường cấm
let points = []; // Điểm
let banPolyline = null; // Đường cấm tạm thời
let bannedLines = []; // Biến toàn cục để xác định chế độ đặt vật cản
let isPlacingObstacle = false; // Trạng thái đang đặt vật cản
let obstacleMarkers = []; // Các điểm đặt vật cản
let isAdmin = false; // Biến toàn cục để xác định chế độ Admin hay Guest
let showNodes = false; // Xem tất cả các node và edge
let showEdges = false;

let startPointMarker = null; // Để lưu marker/popup của điểm bắt đầu
let endPointMarker = null; // Để lưu marker/popup của điểm kết thúc
// Xử lý tắc đường
let trafficLevel; // Biến toàn cục để xác định mức độ tắc đường
let trafficMarkers = []; // Biến toàn cục để lưu các marker tắc đường
let trafficPolyline = null; // Biến toàn cục để lưu polyline tắc đường
let isTrafficMode = false; // Biến toàn cục để xác định chế độ tắc đường
let trafficLine = [];
let trafficEdges = []; // Biến toàn cục để lưu các cạnh tắc đường

let floodLevel; // Biến toàn cục để xác định mức độ ngập
let floodMarkers = []; // Biến toàn cục để lưu các marker ngập
let floodPolyline = null; // Biến toàn cục để lưu polyline ngập
let isFloodMode = false; // Biến toàn cục để xác định chế độ ngập
let floodLine = [];
let floodEdges = []; // Biến toàn cục để lưu các cạnh ngập

let algorithmSelect = document.getElementById("algorithmSelect");

// Biến toàn cục để lưu trữ tọa độ đa giác ranh giới Phường Trúc Bạch
let trucBachBoundaryLatLngs = null;
let trucBachGeoJsonFeature = null;
function normalizeMetroData() {
  // Fix: dùng window.nodesLatLon thay vì nodesLatLon
  let rawNodes = [];

  if (
    typeof window.nodesLatLon !== "undefined" &&
    Array.isArray(window.nodesLatLon)
  ) {
    rawNodes = window.nodesLatLon;
  } else if (typeof nodes !== "undefined") {
    if (Array.isArray(nodes)) {
      rawNodes = nodes;
    } else {
      rawNodes = Object.entries(nodes).map(([id, value]) => ({
        id: id,
        name: typeof value === "string" ? value : value.name,
        lat: value.lat,
        lon: value.lon,
      }));
    }
  }

  window.metroNodes = {};

  rawNodes.forEach((node) => {
    const id = node.id || node.node_id || node.stop_id;
    const lat = Number(node.lat || node.stop_lat);
    const lon = Number(node.lon || node.lng || node.stop_lon);

    if (!id || isNaN(lat) || isNaN(lon)) return;

    window.metroNodes[id] = {
      node_id: id,
      name: node.name || node.stop_name || id,
      lat: lat,
      lon: lon,
    };
  });

  console.log("metroNodes loaded:", Object.keys(window.metroNodes).length);

  // Fix: đổi "node" -> "node_neighbor" cho đúng format mà code dùng
  if (typeof adjListWithWeights !== "undefined") {
    window.adj_list_with_weights = Object.entries(adjListWithWeights).map(
      ([nodeId, neighbors]) => ({
        node_id: nodeId,
        neighbors: neighbors.map((n) => ({
          node_neighbor: n.node_neighbor || n.node || n.to, // thêm n.node vào đây
          weight: Number(n.weight),
        })),
      }),
    );
    console.log(
      "adj_list_with_weights loaded:",
      window.adj_list_with_weights.length,
    );
  } else {
    console.error("adjListWithWeights không tìm thấy!");
  }
}

function getNodeById(nodeId) {
  return window.metroNodes[nodeId] || null;
}

function getAllNodes() {
  return Object.values(window.metroNodes || {});
}

async function loadBoundary() {
  try {
    const response = await fetch("../../data/dc_boundary.geojson");
    if (!response.ok) {
      throw new Error(`Lỗi HTTP! Status: ${response.status}`);
    }
    const geojsonData = await response.json();

    if (geojsonData.features && geojsonData.features.length > 0) {
      const feature = geojsonData.features[0];
      trucBachGeoJsonFeature = feature;

      if (feature.geometry) {
        let rawCoords;
        if (feature.geometry.type === "Polygon") {
          rawCoords = feature.geometry.coordinates[0];
        } else if (feature.geometry.type === "MultiPolygon") {
          rawCoords = feature.geometry.coordinates[0][0];
          console.warn(
            "Ranh giới WashingtonDC là MultiPolygon. Hiện tại đang sử dụng đa giác đầu tiên. Hãy kiểm tra xem có phù hợp không.",
          );
        } else {
          console.error(
            "Dữ liệu GeoJSON không phải là Polygon hoặc MultiPolygon.",
          );
          return;
        }
        trucBachBoundaryLatLngs = rawCoords.map((coord) =>
          L.latLng(coord[1], coord[0]),
        );
        console.log(
          "Ranh giới Phường Trúc Bạch đã được tải và xử lý thành công.",
        );
        L.polygon(trucBachBoundaryLatLngs, {
          color: "purple", // màu viền là tím
          weight: 2, // độ dày viền
          fillOpacity: 0.04, // độ trong suốt nền
          dashArray: "5, 5",
        }).addTo(map);
      } else {
        console.error("Feature trong GeoJSON không có thông tin geometry.");
      }
    } else {
      console.error("File GeoJSON không hợp lệ hoặc không chứa features.");
    }
  } catch (error) {
    console.error(
      "Không thể tải hoặc xử lý file ranh giới Phường Trúc Bạch:",
      error,
    );
  }
}
// Khởi tạo bản đồ Washington DC
const map = L.map("map").setView([38.9072, -77.0369], 13);
function getShapeColor(shapeId) {
  const id = shapeId.toUpperCase();

  // Red
  if (id.includes("RED") || id.includes("RRED")) {
    return "#e31b23";
  }

  // Blue
  if (id.includes("BLUE") || id.includes("BLU") || id.includes("RBLU")) {
    return "#0076bf";
  }

  // Orange
  if (
    id.includes("ORANGE") ||
    id.includes("ORG") ||
    id.includes("ORNG") ||
    id.includes("RORG")
  ) {
    return "#f7941d";
  }

  // Silver
  if (
    id.includes("SILVER") ||
    id.includes("SIL") ||
    id.includes("SLV") ||
    id.includes("RSIL")
  ) {
    return "#a7a9ac";
  }

  // Yellow
  if (
    id.includes("YELLOW") ||
    id.includes("YEL") ||
    id.includes("YLW") ||
    id.includes("RYEL")
  ) {
    return "#ffd200";
  }

  // Green
  if (id.includes("GREEN") || id.includes("GRN") || id.includes("RGRN")) {
    return "#00a651";
  }

  // Không rõ tuyến nào thì cho màu xám nhạt để dễ debug
  console.warn("Không nhận diện được màu cho shape:", shapeId);
  return "#999999";
}

let metroShapeLayers = [];

function drawMetroShapes() {
  if (!window.metroShapes) {
    console.error("Chưa load được window.metroShapes");
    return;
  }

  // Xóa tuyến cũ nếu có
  metroShapeLayers.forEach((layer) => {
    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });
  metroShapeLayers = [];

  Object.entries(window.metroShapes).forEach(([shapeId, coords]) => {
    if (!Array.isArray(coords) || coords.length < 2) return;

    const layer = L.polyline(coords, {
      color: getShapeColor(shapeId),
      weight: 5,
      opacity: 0.9,
      lineCap: "round",
      lineJoin: "round",
    }).addTo(map);

    layer.bindPopup(`<b>${shapeId}</b>`);
    metroShapeLayers.push(layer);
  });

  console.log("Đã vẽ metro shapes:", metroShapeLayers.length);
}
let metroStationLayer = null;

function drawMetroStations() {
  if (!window.metroNodes) {
    console.error("Chưa load được window.metroNodes");
    return;
  }

  // Nếu đã vẽ rồi thì xóa để tránh bị trùng
  if (metroStationLayer) {
    map.removeLayer(metroStationLayer);
  }

  metroStationLayer = L.layerGroup();

  Object.values(window.metroNodes).forEach((station) => {
    const lat = Number(station.lat);
    const lon = Number(station.lon);

    if (isNaN(lat) || isNaN(lon)) return;

    const marker = L.circleMarker([lat, lon], {
      radius: 5.5,
      color: "#000000", // viền đen
      weight: 3,
      fillColor: "#bfbfbf", // ruột xám giống ảnh
      fillOpacity: 1,
      opacity: 1,
      pane: "markerPane",
    });

    marker.bindPopup(`
      <b>${station.name || "Metro Station"}</b><br>
      ID: ${station.node_id}
    `);

    metroStationLayer.addLayer(marker);
  });

  metroStationLayer.addTo(map);

  console.log("Đã vẽ metro stations:", Object.keys(window.metroNodes).length);
}
normalizeMetroData();
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);
drawMetroShapes();
drawMetroStations(); // Hiển thị tất cả các ga metro ngay khi load bản đồ
loadBoundary();

// Xử lý chuyển đổi Guest/Admin
const roleToggle = document.getElementById("roleToggle");
const guestControls = document.getElementById("guestControls");
const adminControls = document.getElementById("adminControls");
const appHeader = document.getElementById("appHeader");

// ------------------------- Xử lý đổi giao diện theme -------------------------
document
  .querySelector(".theme-toggle-btn")
  .addEventListener("click", function () {
    this.classList.toggle("active");
  });

function switchTheme(theme) {
  if (theme === "light") {
    document.documentElement.classList.remove("theme-dark", "theme-sunset");
    document.documentElement.classList.add("theme-light");
  } else if (theme === "dark") {
    document.documentElement.classList.remove("theme-light", "theme-sunset");
    document.documentElement.classList.add("theme-dark");
  } else if (theme === "sunset") {
    document.documentElement.classList.remove("theme-light", "theme-dark");
    document.documentElement.classList.add("theme-sunset");
  }
}

/* Xử lý chọn chế độ Guest - Admin */
roleToggle.addEventListener("change", function () {
  const isChecked = this.checked;
  const newRole = isChecked ? "Admin" : "Guest";
  console.log("Bạn đang ở chế độ", newRole);

  if (isDrawing && !isChecked) {
    map.closePopup(); // Đóng các popup khác nếu có
    const mapCenter = map.getCenter(); // Lấy vị trí giữa bản đồ để hiển thị popup
    let taskDescription = "thực hiện một thao tác vẽ"; // Mô tả chung
    // Cụ thể hóa mô tả tác vụ nếu có thể
    if (isBlockMode) taskDescription = "vẽ đường cấm";
    else if (isTrafficMode) taskDescription = "đánh dấu tắc đường";
    else if (isFloodMode) taskDescription = "đánh dấu ngập lụt";
    // isPlacingObstacle không dùng isDrawing, nên không cần kiểm tra ở đây nếu chỉ dựa vào isDrawing
    L.popup({
      className:
        "warning-leaflet-popup synced-leaflet-popup compact-point-popup", // Sử dụng các class đã style
      autoClose: true,
      closeOnClick: true,
    })
      .setLatLng(mapCenter)
      .setContent(
        `<b>Cảnh báo:</b> Bạn đang trong quá trình ${taskDescription}.<br>Vui lòng hoàn thành (nhấn ESC) hoặc hủy bỏ trước khi chuyển sang chế độ Guest.`,
      )
      .openOn(map);
    this.checked = true;
    return;
  }

  isAdmin = isChecked;

  // Toggle hiển thị control
  guestControls.classList.toggle("hide", isChecked);
  adminControls.classList.toggle("show", isChecked);

  if (appHeader) {
    // Kiểm tra xem appHeader có tồn tại không
    if (isAdmin) {
      appHeader.style.display = "none"; // Ẩn thanh tìm kiếm khi là Admin
      // Xóa kết quả tìm kiếm và marker tạm thời nếu chuyển sang Admin
      if (searchResultsContainer) searchResultsContainer.innerHTML = "";
      if (tempSearchMarker) {
        map.removeLayer(tempSearchMarker);
        tempSearchMarker = null;
      }
      if (placeSearchInput) placeSearchInput.value = "";
    } else {
      appHeader.style.display = "flex"; // Hiện lại thanh tìm kiếm khi là Guest
      // (hoặc 'block' tùy theo cách bạn muốn nó hiển thị)
    }
  }

  if (isAdmin) {
    resetMapWithGuest(); // Reset bản đồ khi sang Admin
  } else {
    // Reset trạng thái vẽ, giữ lại các đường cấm
    isBlockMode = false;
    isDrawing = false;
    isPlacingObstacle = false;
    isTrafficMode = false;
    isFloodMode = false;
    isOneWayEdgeMode = false;
    document.getElementById("toggleOneWayEdgeModeBtn").textContent =
      "Đường 1 chiều";
    selectedPoints = [];
    startPoint = null;
    map.closePopup();
  }
});

const trafficInput = document.getElementById("trafficLevel");

trafficInput.addEventListener("input", () => {
  let val = parseInt(trafficInput.value);
  if (val > 3) {
    trafficInput.value = 3;
  } else if (val < 1) {
    trafficInput.value = 1;
  }
});

const floodInput = document.getElementById("floodLevel");

floodInput.addEventListener("input", () => {
  let val = parseInt(floodInput.value);
  if (val > 3) {
    floodInput.value = 3;
  } else if (val < 1) {
    floodInput.value = 1;
  }
});

const obstacleRadiusInput = document.getElementById("obstacleRadius");

obstacleRadiusInput.addEventListener("input", () => {
  let val = parseInt(obstacleRadiusInput.value);
  if (val > 200) {
    obstacleRadiusInput.value = 200;
  } else if (val < 10) {
    obstacleRadiusInput.value = 10;
  }
});
/*----------------------------------- HIện các node (icon giống gg) ---------------------------*/
const googleIcon = L.icon({
  iconUrl: "https://maps.google.com/mapfiles/ms/icons/red-dot.png", // icon giống trên gg map
  iconSize: [32, 32],
  iconAnchor: [16, 32],
  popupAnchor: [0, -32],
});

// Icon hiển thị điểm đầu và điểm cuối khi người dùng chọn trên bản đồ
// Đặt 2 file start.png và end.png cùng thư mục với file HTML đang chạy,
// hoặc đổi iconUrl thành đường dẫn đúng, ví dụ: "./images/start.png".
const startPointIcon = L.icon({
  iconUrl: "../../public/start.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
  tooltipAnchor: [0, -42],
});

const endPointIcon = L.icon({
  iconUrl: "../../public/end.png",
  iconSize: [40, 40],
  iconAnchor: [20, 40],
  popupAnchor: [0, -40],
  tooltipAnchor: [0, -42],
});

/*----------------------------------- Hiện đường đi trên bản đổ --------------------------------*/
document.getElementById("togglePaths").addEventListener("click", () => {
  if (selectedPoints.length === 2) {
    findAndDrawPath();
  }
});

/*----------------------------------Xử lý sự kiện trên bàn đồ------------------------------------------------*/
function isPointInPolygon(point, polygonVertices) {
  if (!point || !polygonVertices || polygonVertices.length < 3) {
    return false;
  }

  var x = point.lng; // Kinh độ của điểm
  var y = point.lat; // Vĩ độ của điểm

  var inside = false;
  // lặp qua tất cả các cạnh của đa giác
  // j là đỉnh trước, i là đỉnh hiện tại
  for (
    var i = 0, j = polygonVertices.length - 1;
    i < polygonVertices.length;
    j = i++
  ) {
    var xi = polygonVertices[i].lng; // Kinh độ của đỉnh i
    var yi = polygonVertices[i].lat; // Vĩ độ của đỉnh i
    var xj = polygonVertices[j].lng; // Kinh độ của đỉnh j (đỉnh trước đó)
    var yj = polygonVertices[j].lat; // Vĩ độ của đỉnh j (đỉnh trước đó)

    var intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Cập nhật popup của marker với thông tin địa điểm từ Nominatim API.
 * Hiển thị tên ngắn gọn ban đầu, và cho phép người dùng click để xem chi tiết đầy đủ.
 * @param {L.Marker} marker
 * @param {number} lat
 * @param {number} lon
 * @param {string} title
 */
async function updateMarkerPopupWithGeocoding(marker, lat, lon, title) {
  if (!marker) return;

  if (!marker.customData) {
    marker.customData = {
      initialName: "(Đang tải...)",
      fullName: null,
      initialNameFetched: false,
      detailFetched: false,
      isFetchingInitial: false,
      isFetchingDetail: false,
    };
  }
  const cData = marker.customData;

  // Tạo nội dung popup HTML
  const generatePopupHtml = () => {
    let nameToDisplay = cData.initialName;
    if (cData.detailFetched && cData.fullName) {
      nameToDisplay = cData.fullName;
    }

    let html = `<b>${title}</b><br><div>Tên: ${nameToDisplay}</div>`;
    if (
      cData.initialNameFetched &&
      !cData.detailFetched &&
      !cData.isFetchingDetail &&
      !cData.initialName.startsWith("(Lỗi")
    ) {
      html += `<div><a href="#" class="expand-details-link" style="color: var(--primary); text-decoration: underline;">Xem chi tiết</a></div>`;
    } else if (cData.isFetchingDetail) {
      html += `<div><i>Đang tải chi tiết...</i></div>`;
    }
    return html;
  };

  // Gắn listener sau khi popup được render (DOM ready)
  const attachClickListenerToDetailLink = () => {
    setTimeout(() => {
      const popupElement = marker.getPopup()?.getElement();
      if (!popupElement) return;

      const detailLink = popupElement.querySelector(".expand-details-link");
      if (detailLink && !detailLink.getAttribute("data-click-listener")) {
        detailLink.setAttribute("data-click-listener", "true");
        detailLink.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          fetchFullNameAndRefreshPopup();
        });
      }
    }, 50);
  };

  const fetchFullNameAndRefreshPopup = async () => {
    if (cData.detailFetched || cData.isFetchingDetail) return;
    cData.isFetchingDetail = true;

    marker.setPopupContent(generatePopupHtml());
    marker.openPopup();
    attachClickListenerToDetailLink();

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=vi`,
      );
      if (!response.ok)
        throw new Error(`Lỗi API (chi tiết): ${response.status}`);
      const data = await response.json();
      const rawName = data.display_name || "(Không có tên chi tiết)";
      const parts = rawName.split(",").map((p) => p.trim());
      if (parts.length > 2) {
        parts.splice(-2, 2);
      }
      cData.fullName = parts.join(", ");
    } catch (err) {
      console.error("Lỗi tải tên chi tiết:", err);
      cData.fullName = "";
    } finally {
      cData.isFetchingDetail = false;
      cData.detailFetched = true;
      marker.setPopupContent(generatePopupHtml());
      marker.openPopup();
      attachClickListenerToDetailLink();
    }
  };

  // Tải tên ban đầu nếu chưa có
  if (!cData.initialNameFetched && !cData.isFetchingInitial) {
    cData.isFetchingInitial = true;
    marker.setPopupContent(generatePopupHtml());
    marker.openPopup();
    attachClickListenerToDetailLink();

    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=17&addressdetails=1&accept-language=vi`,
      );
      if (!response.ok)
        throw new Error(`Lỗi API (ban đầu): ${response.status}`);
      const data = await response.json();

      if (data && data.display_name) {
        const addr = data.address || {};
        let nameParts = [];

        if (addr.road) nameParts.push(addr.road);
        if (addr.amenity) nameParts.push(addr.amenity);
        if (addr.neighbourhood) nameParts.push(addr.neighbourhood);
        else if (addr.suburb) nameParts.push(addr.suburb);
        else if (addr.village) nameParts.push(addr.village);
        if (nameParts.length === 0 && addr.quarter)
          nameParts.push(addr.quarter);
        if (
          nameParts.length < 2 &&
          addr.city_district &&
          !nameParts.includes(addr.city_district)
        ) {
          nameParts.push(addr.city_district);
        }

        cData.initialName =
          nameParts.length > 0
            ? nameParts.slice(0, 2).join(", ")
            : data.display_name.split(",").slice(0, 2).join(", ");
      } else {
        cData.initialName = "";
      }
    } catch (err) {
      console.error("Lỗi tải tên ban đầu:", err);
      cData.initialName = "";
    } finally {
      cData.isFetchingInitial = false;
      cData.initialNameFetched = true;
      marker.setPopupContent(generatePopupHtml());
      marker.openPopup();
      attachClickListenerToDetailLink();
    }
  } else {
    marker.setPopupContent(generatePopupHtml());
    marker.openPopup();
    attachClickListenerToDetailLink();
  }
}

function processMapSelection(lat, lng) {
  const clickedLatLng = L.latLng(lat, lng);
  let closestNode = null;
  let minDist = Infinity;

  getAllNodes().forEach((node) => {
    const d = getDistance(lat, lng, Number(node.lat), Number(node.lon));

    if (d < minDist) {
      minDist = d;
      closestNode = node;
    }
  });

  if (!closestNode) {
    map.closePopup();
    L.popup({
      className: "error-leaflet-popup synced-leaflet-popup compact-point-popup",
    })
      .setLatLng(clickedLatLng)
      .setContent("<b>Lỗi:</b> Không tìm thấy ga metro nào gần vị trí này.")
      .openOn(map);
    return;
  }

  if (selectedPoints.length === 0) {
    selectedPoints.push(closestNode.node_id);

    if (startPointMarker) map.removeLayer(startPointMarker);

    startPointMarker = L.marker([lat, lng], {
      icon: startPointIcon,
    })
      .addTo(map)
      .bindPopup(
        `<b>Điểm bắt đầu</b><br>${closestNode.name || closestNode.node_id}`,
      )
      .openPopup();

    startPointMarker.bringToFront();
    map.setView(
      [closestNode.lat, closestNode.lon],
      Math.max(map.getZoom(), 13),
    );
  } else if (selectedPoints.length === 1) {
    if (selectedPoints[0] === closestNode.node_id) {
      L.popup({
        className:
          "error-leaflet-popup synced-leaflet-popup compact-point-popup",
      })
        .setLatLng([closestNode.lat, closestNode.lon])
        .setContent("<b>Lỗi:</b> Điểm cuối không được trùng điểm đầu.")
        .openOn(map);
      return;
    }

    selectedPoints.push(closestNode.node_id);

    if (endPointMarker) map.removeLayer(endPointMarker);

    endPointMarker = L.marker([lat, lng], {
      icon: endPointIcon,
    })
      .addTo(map)
      .bindPopup(
        `<b>Điểm kết thúc</b><br>${closestNode.name || closestNode.node_id}`,
      )
      .openPopup();

    endPointMarker.bringToFront();

    if (startPointMarker && endPointMarker) {
      const selectedBounds = L.featureGroup([
        startPointMarker,
        endPointMarker,
      ]).getBounds();
      map.fitBounds(selectedBounds.pad(0.35));
    }
  } else {
    L.popup({
      className: "info-leaflet-popup synced-leaflet-popup compact-point-popup",
    })
      .setLatLng([closestNode.lat, closestNode.lon])
      .setContent("Đã có điểm đầu và điểm cuối.")
      .openOn(map);
  }
}

window.selectSearchedLocation = function (lat, lon) {
  console.log(
    "window.selectSearchedLocation called with lat:",
    lat,
    "lng:",
    lon,
  );

  if (tempSearchMarker) {
    map.closePopup(tempSearchMarker.getPopup());
    map.removeLayer(tempSearchMarker);
    tempSearchMarker = null;
  }
  processMapSelection(lat, lon);
};

const placeSearchInput = document.getElementById("placeSearchInput");
const placeSearchButton = document.getElementById("placeSearchButton");
const searchResultsContainer = document.getElementById("searchResults");
let tempSearchMarker = null;

placeSearchButton.addEventListener("click", async function () {
  const query = placeSearchInput.value.trim();
  if (query.length < 3) {
    map.closePopup();
    L.popup({
      className:
        "warning-leaflet-popup synced-leaflet-popup compact-point-popup",
      autoClose: true,
      closeOnClick: true,
    })
      .setLatLng(map.getCenter())
      .setContent("<b>Cảnh báo:</b> Vui lòng nhập ít nhất 3 ký tự để tìm kiếm.")
      .openOn(map);

    setTimeout(() => {
      const currentPopup = map._popup;
      if (
        currentPopup &&
        currentPopup.getContent().includes("Vui lòng nhập ít nhất 3 ký tự")
      ) {
        map.closePopup();
      }
    }, 3000);
    return;
  }

  if (tempSearchMarker) {
    map.removeLayer(tempSearchMarker);
    tempSearchMarker = null;
  }
  searchResultsContainer.innerHTML = "Đang tìm kiếm...";

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=us&viewbox=-77.12,38.80,-76.90,39.00&bounded=1`,
    );

    if (!response.ok) {
      throw new Error(`Lỗi API: ${response.status}`);
    }
    const data = await response.json();
    searchResultsContainer.innerHTML = "";

    if (data && data.length > 0) {
      let resultsFound = 0;

      data.forEach((place) => {
        const lat = parseFloat(place.lat);
        const lon = parseFloat(place.lon);
        const searchedLatLng = L.latLng(lat, lon);

        let isPlaceInsideBoundary = true;
        if (trucBachBoundaryLatLngs) {
          try {
            isPlaceInsideBoundary = isPointInPolygon(
              searchedLatLng,
              trucBachBoundaryLatLngs,
            );
          } catch (error) {
            console.error(
              "Lỗi khi kiểm tra ranh giới cho địa điểm tìm kiếm:",
              error,
            );
          }
        }

        if (!isPlaceInsideBoundary) return;

        resultsFound++;

        const item = document.createElement("div");
        item.classList.add("search-result-item");

        const parts = place.display_name.split(",").map((p) => p.trim());
        if (parts.length > 2) {
          parts.splice(-2, 2);
        }
        item.textContent = parts.join(", ");

        item.onclick = function () {
          const shortDisplayName = place.display_name.split(",")[0];

          if (tempSearchMarker) {
            map.removeLayer(tempSearchMarker);
          }

          const popupContent = `<b>${shortDisplayName}</b><br><button class="btn btn-primary btn-xs" onclick="window.selectSearchedLocation(${lat}, ${lon})">Chọn điểm này</button>`;

          tempSearchMarker = L.marker([lat, lon])
            .addTo(map)
            .bindPopup(popupContent)
            .openPopup();

          map.setView([lat, lon], 17);
          searchResultsContainer.innerHTML = "";
          placeSearchInput.value = shortDisplayName;
        };

        searchResultsContainer.appendChild(item);
      });

      if (resultsFound === 0) {
        searchResultsContainer.innerHTML =
          '<div class="search-result-item">Không tìm thấy địa điểm phù hợp trong Phường Trúc Bạch.</div>';
      }
    } else {
      searchResultsContainer.innerHTML =
        '<div class="search-result-item">Không tìm thấy địa điểm.</div>';
    }
  } catch (error) {
    console.error("Lỗi tìm kiếm địa điểm:", error);
    map.closePopup();
    L.popup({
      className: "error-leaflet-popup synced-leaflet-popup compact-point-popup",
      autoClose: true,
      closeOnClick: true,
    })
      .setLatLng(map.getCenter())
      .setContent(
        "<b>Lỗi:</b> Có lỗi xảy ra khi tìm kiếm địa điểm. Vui lòng thử lại.",
      )
      .openOn(map);
    searchResultsContainer.innerHTML =
      '<div class="search-result-item">Lỗi khi tìm kiếm.</div>';
  }
});

placeSearchInput.addEventListener("keypress", function (e) {
  if (e.key === "Enter") {
    placeSearchButton.click();
  }
});

// Sửa đổi map.on("click") để sử dụng hàm mới
map.on("click", function (e) {
  const { lat, lng } = e.latlng;
  const clickedLatLng = e.latlng;
  if (false && trucBachBoundaryLatLngs) {
  } else {
    let isInsideTrucBach;
    try {
      isInsideTrucBach = isPointInPolygon(
        clickedLatLng,
        trucBachBoundaryLatLngs,
      );
    } catch (error) {
      console.error(
        "Lỗi khi sử dụng L.PolyUtil.isPointInsidePolygon. Đảm bảo Leaflet đã tải đầy đủ.",
        error,
      );
      isInsideTrucBach = true;
    }

    if (!isInsideTrucBach) {
      map.closePopup();
      L.popup({
        className:
          "warning-leaflet-popup synced-leaflet-popup compact-point-popup",
        autoClose: true,
        closeOnClick: true,
      })
        .setLatLng(clickedLatLng)
        .setContent(
          "<b>Cảnh báo:</b> Vị trí bạn chọn nằm ngoài WashingtonDC. Vui lòng chọn vị trí trong khu vực!!!",
        )
        .openOn(map);

      setTimeout(() => {
        const currentPopup = map._popup;
        if (
          currentPopup &&
          currentPopup
            .getContent()
            .includes("nằm ngoài khu vực Phường Trúc Bạch")
        ) {
          map.closePopup();
        }
      }, 4000);

      return;
    }
  }

  // Kiểm tra admin modes và các điều kiện khác trước khi gọi processMapSelection
  if (isAdmin && isOneWayEdgeMode) {
    handleOneWayEdgeModeClick(e);
    return;
  }
  if (
    isAdmin &&
    !isBlockMode &&
    !isPlacingObstacle &&
    !isTrafficMode &&
    !isFloodMode
  ) {
    map.closePopup();
    L.popup({
      className: "info-leaflet-popup synced-leaflet-popup compact-point-popup",
      autoClose: true,
      closeOnClick: true,
    })
      .setLatLng(e.latlng)
      .setContent(
        "<b>Thông báo:</b> Chế độ Admin. Không thể tìm đường. Chuyển về Guest.",
      )
      .openOn(map);
    return;
  }
  if (isBlockMode || isTrafficMode || isFloodMode) {
    handleDrawingMode(lat, lng, isTrafficMode, isFloodMode);
    return;
  }
  if (isPlacingObstacle) {
    handleObstaclePlacement(lat, lng);
    return;
  }

  // Nếu không phải các mode đặc biệt của admin, gọi hàm xử lý chọn điểm
  processMapSelection(lat, lng);
});

// Xử lý di chuyển chuột
map.on("mousemove", function (e) {
  if ((isBlockMode || isTrafficMode || isFloodMode) && isDrawing) {
    if (temporaryLine) {
      map.removeLayer(temporaryLine);
    }
    const lastPoint =
      points.length > 0 ? points[points.length - 1] : startPoint;
    let color;
    let trafficLevel = parseInt(document.getElementById("trafficLevel").value);
    let floodLevel = parseInt(document.getElementById("floodLevel").value);
    if (!isTrafficMode && !isFloodMode) {
      color = "#f44336"; // Đỏ - cấm đường
    } else if (isTrafficMode) {
      switch (trafficLevel) {
        case 1:
          color = "#fdd835"; // Tắc nhẹ - vàng tươi
          break;
        case 2:
          color = "#ffb300"; // Tắc vừa - cam đậm
          break;
        case 3:
          color = "#bf360c"; // Tắc nặng - nâu cam đậm
          break;
      }
    } else {
      switch (floodLevel) {
        case 1:
          color = "#64b5f6"; // Ngập nhẹ - xanh dương nhạt
          break;
        case 2:
          color = "#2196f3"; // Ngập vừa - xanh dương vừa
          break;
        case 3:
          color = "#0d47a1"; // Ngập nặng - xanh dương đậm nhất
          break;
      }
    }
    if (lastPoint) {
      temporaryLine = L.polyline([lastPoint, [e.latlng.lat, e.latlng.lng]], {
        color: color,
        weight: 3,
        opacity: 0.5,
        dashArray: "5, 10",
        lineCap: "round",
        lineJoin: "round",
      }).addTo(map);
    }
  }
});

// Xử lý phím ESC
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && isDrawing) {
    let mode = null;
    let lineList = null;
    let tempLine = null;
    let edgesList = null;

    if (isBlockMode) {
      mode = "block";
      lineList = bannedLines;
      tempLine = banPolyline;
      edgesList = blockedEdges;
    } else if (isTrafficMode) {
      mode = "traffic";
      lineList = trafficLine;
      tempLine = trafficPolyline;
      edgesList = trafficEdges;
    } else if (isFloodMode) {
      mode = "flood";
      lineList = floodLine;
      tempLine = floodPolyline;
      edgesList = floodEdges;
    }

    if (mode && points.length > 0) {
      console.log(`Hoàn thành vẽ đường ${mode === "block" ? "cấm" : "tắc"}`);

      // Lưu đường vào danh sách
      lineList.push([...points]);

      let color;
      let trafficLevel = parseInt(
        document.getElementById("trafficLevel").value,
      );
      let floodLevel = parseInt(document.getElementById("floodLevel").value);
      if (mode === "block") {
        color = "#f44336"; // Đỏ - cấm đường
      } else if (mode === "traffic") {
        switch (trafficLevel) {
          case 1:
            color = "#fdd835"; // Tắc nhẹ - vàng tươi
            break;
          case 2:
            color = "#ffb300"; // Tắc vừa - cam đậm
            break;
          case 3:
            color = "#bf360c"; // Tắc nặng - nâu cam đậm
            break;
        }
      } else {
        switch (floodLevel) {
          case 1:
            color = "#64b5f6"; // Ngập nhẹ - xanh dương nhạt
            break;
          case 2:
            color = "#2196f3"; // Ngập vừa - xanh dương vừa
            break;
          case 3:
            color = "#0d47a1"; // Ngập nặng - xanh dương đậm nhất
            break;
        }
      }

      // Vẽ đường
      L.polyline(points, {
        color: color,
        weight: 3,
        dashArray: "10,10",
        opacity: 0.8,
      }).addTo(map);

      // Xác định các cạnh bị cắt
      for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i + 1];
        if (p1 && p2) {
          detectBlockedEdgesByCut([p1, p2]);
        } else {
          console.warn("Điểm không hợp lệ:", p1, p2);
        }
      }

      // Xóa đường tạm
      if (temporaryLine) {
        map.removeLayer(temporaryLine);
        temporaryLine = null;
      }

      if (tempLine) {
        map.removeLayer(tempLine);
        tempLine = null;
      }

      console.log(
        `Tổng số cạnh ${mode === "block" ? "bị cấm" : "tắc đường"}:`,
        edgesList.length,
      );
      if (mode === "traffic") {
        console.log("Hệ số tắc đường:", trafficLevel);
      }
      console.log(
        `=== Kết thúc vẽ đường ${mode === "block" ? "cấm" : "tắc"} ===`,
      );

      // Reset trạng thái
      points = [];
      isBlockMode = false;
      isTrafficMode = false;
      isFloodMode = false;
      isDrawing = false;
      startPoint = null;
    } else if (mode) {
      console.warn(
        `Không có điểm nào để tạo đường ${mode === "block" ? "cấm" : "tắc"}.`,
      );
    }
  }
  if (e.key === "Escape") {
    if (isAdmin && isOneWayEdgeMode) {
      isOneWayEdgeMode = false;
      const btn = document.getElementById("toggleOneWayEdgeModeBtn");
      if (btn) {
        btn.textContent = "Đường 1 chiều";
        btn.classList.remove("btn-danger");
        btn.classList.add("btn-warning"); // Nhất quán với class mặc định của nút
      }
      map.getContainer().style.cursor = "";
      map.closePopup(); // Đóng popup nếu đang mở
      console.log("Đã thoát chế độ đặt đường một chiều.");
      return;
    }
  }
});

// Hàm truyền đối số cho backend
function displayPathfindingError(errorMessage) {
  let popupLocation = map.getCenter();

  if (selectedPoints && selectedPoints.length === 2) {
    const node1 = getNodeById(selectedPoints[0]);
    const node2 = getNodeById(selectedPoints[1]);

    if (node1 && node2) {
      const lat1 = parseFloat(node1.lat);
      const lon1 = parseFloat(node1.lon);
      const lat2 = parseFloat(node2.lat);
      const lon2 = parseFloat(node2.lon);

      if (!isNaN(lat1) && !isNaN(lon1) && !isNaN(lat2) && !isNaN(lon2)) {
        popupLocation = L.latLng((lat1 + lat2) / 2, (lon1 + lon2) / 2);
      }
    }
  }

  console.error("Lỗi tìm đường:", errorMessage);

  const safeMessage = errorMessage || "Không tìm thấy đường đi.";

  const errorPopup = L.popup({
    className: "error-leaflet-popup synced-leaflet-popup compact-point-popup",
    autoClose: true,
    closeOnClick: true,
  })
    .setLatLng(popupLocation)
    .setContent(`<b>Không tìm thấy đường đi</b><br>${safeMessage}`)
    .openOn(map);

  setTimeout(() => {
    map.closePopup(errorPopup);
  }, 5000);
}
function findAndDrawPath() {
  if (selectedPoints.length < 2) {
    console.warn("Cần chọn đủ 2 điểm để tìm đường.");
    // Có thể hiển thị thông báo cho người dùng ở đây nếu muốn
    return;
  }

  const startNode = selectedPoints[0];
  const endNode = selectedPoints[1];
  const selectedAlgorithm = algorithmSelect
    ? algorithmSelect.value
    : "Dijkstra"; // Lấy thuật toán hiện tại

  // Lấy các giá trị hệ số từ UI (nếu có)
  const currentTrafficLevel = document.getElementById("trafficLevel")
    ? parseInt(document.getElementById("trafficLevel").value)
    : 1;
  const currentFloodLevel = document.getElementById("floodLevel")
    ? parseInt(document.getElementById("floodLevel").value)
    : 1;
  const maxDepthForIDDFS = 100000; // Giá trị mặc định hoặc lấy từ UI nếu có
  const iterationsForAStar = 100000; // Giá trị mặc định hoặc lấy từ UI nếu có

  console.log(
    `Tìm đường từ ${startNode} đến ${endNode} bằng ${selectedAlgorithm}`,
  );

  // Xóa đường cũ (nếu có) trước khi gửi yêu cầu mới
  map.eachLayer(function (layer) {
    if (layer.options && layer.options.id === "path-polyline-guest") {
      map.removeLayer(layer);
    }
  });

  fetch("http://127.0.0.1:5000/find_path", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start: startNode,
      end: endNode,
      algorithm: selectedAlgorithm,
      blocked_edges: typeof blockedEdges !== "undefined" ? blockedEdges : [],
      traffic_edges: typeof trafficEdges !== "undefined" ? trafficEdges : [],
      traffic_level: currentTrafficLevel,
      flood_edges: typeof floodEdges !== "undefined" ? floodEdges : [],
      flood_level: currentFloodLevel,
      one_way_edges: typeof oneWayEdges !== "undefined" ? oneWayEdges : [],
      max_depth_iddfs: maxDepthForIDDFS, // Gửi cho IDDFS
      iterations: iterationsForAStar, // Gửi cho A*
    }),
  })
    .then((res) => {
      if (!res.ok) {
        return res.json().then((errorData) => {
          let err = new Error(
            errorData.error || `Lỗi ${res.status} từ server.`,
          );
          err.data = errorData;
          throw err;
        });
      }
      return res.json();
    })
    .then((data) => {
      if (data.path && data.path.length > 0) {
        console.log("Đường đi nhận được:", data.path);
        console.log(
          "Thời gian ước tính (cost_with_factors):",
          data.cost_with_factors,
        );
        console.log("Quãng đường thực tế (real_distance):", data.real_distance);

        drawPath(
          data.path,
          data.cost_with_factors,
          data.real_distance,
          selectedAlgorithm,
        );

        // Tùy chọn: Hiển thị các node đã duyệt (data.explored_nodes)
        // Ví dụ: drawExploredNodes(data.explored_nodes);
      } else {
        displayPathfindingError(
          data.error || "Không tìm thấy đường đi phù hợp.",
        );
      }
    })
    .catch((err) => {
      console.error("Lỗi trong findAndDrawPath:", err);
      let errorMessage =
        "Không thể kết nối đến máy chủ hoặc có lỗi không xác định.";
      if (err && err.data && err.data.error) {
        errorMessage = err.data.error;
      } else if (err && err.message) {
        errorMessage = err.message.toLowerCase().includes("failed to fetch")
          ? "Không thể kết nối tới máy chủ (app.py chưa chạy hoặc có lỗi mạng)."
          : err.message;
      }
      displayPathfindingError(errorMessage);
    });
}
// ----------------------------------- Xử lý thuật toán ------------------------------
// Trong main.js (khoảng dòng 450 hoặc gần đó)

algorithmSelect.addEventListener("change", function () {
  algorithm = this.value;
  if (selectedPoints.length === 2) {
    const mapCenter = map.getCenter();

    L.popup({
      className: "info-leaflet-popup synced-leaflet-popup compact-point-popup",
      autoClose: true,
      closeOnClick: true,
    })
      .setLatLng(mapCenter) // Hiển thị popup ở giữa màn hình bản đồ
      .setContent(
        `Đã chọn thuật toán: <b>${algorithm}</b>.<br>Đang làm mới đường đi... 🤖`,
      )
      .openOn(map);

    setTimeout(() => {
      map.closePopup();
    }, 2000); // Đóng sau 3 giây

    getAlgorithm(); // Gọi hàm để làm mới đường đi
  }
});

function getAlgorithm() {
  map.eachLayer(function (layer) {
    if (
      layer instanceof L.Polyline && // Là Polyline
      !(layer instanceof L.TileLayer) && // Không phải TileLayer
      layer.options.color === "green" // Có màu xanh
    ) {
      map.removeLayer(layer);
    }
  });
  findAndDrawPath();
}

/*---------------------------------------------------- Xử lý ngập lụt ---------------------------*/
document.getElementById("floodBtn").addEventListener("click", function () {
  isFloodMode = true;
  isDrawing = true;
  points = [];
  floodLevel = document.getElementById("floodLevel").value;
  console.log("Mức độ ngập lụt:", floodLevel.value);
  if (floodPolyline) {
    map.removeLayer(floodPolyline);
    floodPolyline = null;
  }
  map.closePopup(); // Đóng các popup khác nếu có
  // Lấy vị trí trung tâm của bản đồ để hiển thị popup
  const mapCenter = map.getCenter();
  L.popup({
    className: "info-leaflet-popup synced-leaflet-popup compact-point-popup", // Sử dụng các class đã style
    autoClose: true,
    closeOnClick: true,
  })
    .setLatLng(mapCenter) // Hiển thị popup ở giữa màn hình bản đồ
    .setContent(
      "<b>Hướng dẫn:</b> Click vào bản đồ để bắt đầu vẽ vùng ngập lụt.<br>Nhấn phím <b>ESC</b> để hoàn thành hoặc hủy vẽ.",
    )
    .openOn(map);

  setTimeout(() => {
    map.closePopup(); // Đóng popup cụ thể này hoặc tất cả
  }, 5000); // Đóng sau 5 giây
  console.log("Bật chế độ vẽ ngập lụt");
});

document
  .getElementById("restoreFloodBtn")
  .addEventListener("click", function () {
    if (floodLine.length === 0) {
      console.warn("Không còn đường ngập lụt nào để khôi phục.");
      return;
    }
    floodLine.pop();

    map.eachLayer(function (layer) {
      if (
        (layer instanceof L.Polyline &&
          (layer.options.color === "#64b5f6" ||
            layer.options.color === "#2196f3" ||
            layer.options.color === "#0d47a1")) ||
        layer instanceof L.CircleMarker
      ) {
        map.removeLayer(layer);
      }
    });

    floodLine.forEach((linePoints) => {
      L.polyline(linePoints, {
        color: "#ffb300",
        weight: 3,
        dashArray: "10,10",
        opacity: 0.8,
      }).addTo(map);
    });

    // Cập nhật lại danh sách blockedEdges
    floodEdges = [];
    floodLine.forEach((linePoints) => {
      for (let i = 0; i < linePoints.length - 1; i++) {
        const p1 = linePoints[i];
        const p2 = linePoints[i + 1];
        if (p1 && p2) {
          detectBlockedEdgesByCut([p1, p2]);
        }
      }
    });

    console.log("Đã khôi phục lại các đường tắc còn lại.");
  });

function isEdgeFlood(edge) {
  return floodEdges.some(
    (blocked) =>
      (blocked[0] === edge[0] && blocked[1] === edge[1]) ||
      (blocked[0] === edge[1] && blocked[1] === edge[0]),
  );
}

function handleFloodEdge(edge) {
  if (!isEdgeFlood(edge)) {
    floodEdges.push(edge);
    console.log(`💢 Cạnh xảy ra ngập lụt: ${edge[0]} - ${edge[1]}`);
    console.log();
  }
}

/*---------------------------------------------------- Xử lý tắc đường ---------------------------*/
document.getElementById("trafficBtn").addEventListener("click", function () {
  isTrafficMode = true;
  isDrawing = true;
  points = [];
  trafficLevel = document.getElementById("trafficLevel").value;
  console.log("Mức độ tắc đường:", trafficLevel.value);
  if (trafficPolyline) {
    map.removeLayer(trafficPolyline);
    trafficPolyline = null;
  }
  map.closePopup(); // Đóng các popup khác nếu có
  // Lấy vị trí trung tâm của bản đồ để hiển thị popup
  const mapCenter = map.getCenter();
  L.popup({
    className: "info-leaflet-popup synced-leaflet-popup compact-point-popup", // Sử dụng các class đã style
    autoClose: true,
    closeOnClick: true,
  })
    .setLatLng(mapCenter) // Hiển thị popup ở giữa màn hình bản đồ
    .setContent(
      "<b>Hướng dẫn:</b> Click vào bản đồ để bắt đầu vẽ đường tắc.<br>Nhấn phím <b>ESC</b> để hoàn thành hoặc hủy vẽ.",
    )
    .openOn(map);

  setTimeout(() => {
    map.closePopup(); // Đóng popup cụ thể này hoặc tất cả
  }, 5000); // Đóng sau 5 giây
  console.log("Bật chế độ vẽ vùng tắc");
});

document.getElementById("restoreTacBtn").addEventListener("click", function () {
  if (trafficLine.length === 0) {
    console.warn("Không còn đường tắc nào để khôi phục.");
    return;
  }
  trafficLine.pop();

  map.eachLayer(function (layer) {
    if (
      (layer instanceof L.Polyline &&
        (layer.options.color === "#fdd835" ||
          layer.options.color === "#ffb300" ||
          layer.options.color === "#bf360c")) ||
      layer instanceof L.CircleMarker
    ) {
      map.removeLayer(layer);
    }
  });

  trafficLine.forEach((linePoints) => {
    L.polyline(linePoints, {
      color: "#ffb300",
      weight: 3,
      dashArray: "10,10",
      opacity: 0.8,
    }).addTo(map);
  });

  // Cập nhật lại danh sách blockedEdges
  trafficEdges = [];
  trafficLine.forEach((linePoints) => {
    for (let i = 0; i < linePoints.length - 1; i++) {
      const p1 = linePoints[i];
      const p2 = linePoints[i + 1];
      if (p1 && p2) {
        detectBlockedEdgesByCut([p1, p2]);
      }
    }
  });

  console.log("Đã khôi phục lại các đường tắc còn lại.");
});

function isEdgeTraffic(edge) {
  return trafficEdges.some(
    (blocked) =>
      (blocked[0] === edge[0] && blocked[1] === edge[1]) ||
      (blocked[0] === edge[1] && blocked[1] === edge[0]),
  );
}

function handleTrafficEdge(edge) {
  if (!isEdgeTraffic(edge)) {
    trafficEdges.push(edge);
    console.log(`💢 Cạnh xảy ra tắc đường: ${edge[0]} - ${edge[1]}`);
    console.log();
  }
}

/* ------------------------------------- Xử lý cấm đường ------------------------------------*/
document.getElementById("banEdgeBtn").addEventListener("click", function () {
  isBlockMode = true;
  isDrawing = true;
  points = [];
  if (banPolyline) {
    map.removeLayer(banPolyline);
    banPolyline = null;
  }
  map.closePopup(); // Đóng các popup khác nếu có
  // Lấy vị trí trung tâm của bản đồ để hiển thị popup
  const mapCenter = map.getCenter();
  L.popup({
    className: "info-leaflet-popup synced-leaflet-popup compact-point-popup", // Sử dụng các class đã style
    autoClose: true,
    closeOnClick: true,
  })
    .setLatLng(mapCenter) // Hiển thị popup ở giữa màn hình bản đồ
    .setContent(
      "<b>Hướng dẫn:</b> Click vào bản đồ để bắt đầu vẽ cấm đường.<br>Nhấn phím <b>ESC</b> để hoàn thành hoặc hủy vẽ.",
    )
    .openOn(map);

  setTimeout(() => {
    map.closePopup(); // Đóng popup cụ thể này hoặc tất cả
  }, 5000); // Đóng sau 5 giây
  console.log("Bật chế độ cấm đường");
});

document.getElementById("restoreBanBtn").addEventListener("click", function () {
  if (bannedLines.length === 0) {
    console.warn("Không còn đường cấm nào để khôi phục.");
    return;
  }
  // Bỏ đường cấm cuối cùng
  bannedLines.pop();

  // Xóa tất cả các đường cấm đang có trên bản đồ
  map.eachLayer(function (layer) {
    if (
      (layer instanceof L.Polyline &&
        layer.options.dashArray === "10,10" &&
        layer.options.color === "#f44336") ||
      layer instanceof L.CircleMarker
    ) {
      map.removeLayer(layer);
    }
  });

  // Vẽ lại tất cả các đường cấm còn lại
  bannedLines.forEach((linePoints) => {
    L.polyline(linePoints, {
      color: "#f44336",
      weight: 3,
      dashArray: "10,10",
      opacity: 0.8,
    }).addTo(map);
  });

  // Cập nhật lại danh sách blockedEdges
  blockedEdges = [];
  bannedLines.forEach((linePoints) => {
    for (let i = 0; i < linePoints.length - 1; i++) {
      const p1 = linePoints[i];
      const p2 = linePoints[i + 1];
      if (p1 && p2) {
        detectBlockedEdgesByCut([p1, p2]);
      }
    }
  });

  console.log("Đã khôi phục lại các đường cấm còn lại.");
});

function redrawBannedLines() {
  bannedLines.forEach((points) => {
    points.forEach((point) => {
      L.circleMarker(point, {
        radius: 5,
        color: "red",
        fillColor: "red",
        fillOpacity: 1,
      }).addTo(map);
    });

    L.polyline(points, {
      color: "red",
      weight: 3,
      dashArray: "10,10",
      opacity: 0.8,
    }).addTo(map);
  });

  trafficLine.forEach((points) => {
    points.forEach((point) => {
      L.circleMarker(point, {
        radius: 5,
        color: "yellow",
        fillColor: "yellow",
        fillOpacity: 1,
      }).addTo(map);
    });

    L.polyline(points, {
      color: "yellow",
      weight: 3,
      dashArray: "10,10",
      opacity: 0.8,
    }).addTo(map);
  });

  floodLine.forEach((points) => {
    points.forEach((point) => {
      L.circleMarker(point, {
        radius: 5,
        color: "blue",
        fillColor: "blue",
        fillOpacity: 1,
      }).addTo(map);
    });

    L.polyline(points, {
      color: "blue",
      weight: 3,
      dashArray: "10,10",
      opacity: 0.8,
    }).addTo(map);
  });
}

/*-------------------------------------- Xử lý đặt vật cản -------------------------------------*/
function handleObstaclePlacement(lat, lng) {
  const radius = document.getElementById("obstacleRadius").value;
  const center = [lat, lng];

  const obstacle = drawObstacle(center, radius);
  obstacleMarkers.push(obstacle);

  detectBlockedEdgesByObstacle(center, radius);
}
const placeObstacleBtn = document.getElementById("placeObstacleBtn");

function drawObstacle(clickedPoint, radius) {
  // Tạo chấm tròn điểm cấm (điểm tâm)
  const obstacleMarker = L.circleMarker(clickedPoint, {
    radius: 8,
    color: "#ff0000",
    fillColor: "#ff0000",
    fillOpacity: 0.7,
  }).addTo(map);

  // Tạo vòng tròn bán kính vùng cấm
  const radiusCircle = L.circle(clickedPoint, {
    radius: parseFloat(radius),
    color: "#ff0000",
    fillColor: "#ff0000",
    fillOpacity: 0.1,
    weight: 1,
  }).addTo(map);

  // Trả về cả 2 marker để quản lý
  return [obstacleMarker, radiusCircle];
}

function detectBlockedEdgesByObstacle(clickedPoint, radius) {
  adj_list_with_weights.forEach((node) => {
    const u = node.node_id;
    // Tìm nodeU trong mảng nodes
    const nodeUObj = getNodeById(u);
    if (!nodeUObj) {
      console.error(`Không tìm thấy node với id ${u}`);
      return;
    }

    const latU = nodeUObj.lat;
    const lonU = nodeUObj.lon;

    // Duyệt qua các neighbors có weight
    node.neighbors.forEach((neighborInfo) => {
      const v = neighborInfo.node_neighbor; // Lấy node_id của neighbor
      const weight = neighborInfo.weight; // Lấy weight của cạnh

      const nodeVObj = getNodeById(v);
      if (!nodeVObj) {
        console.error(`Không tìm thấy node với id ${v}`);
        return;
      }
      const latV = nodeVObj.lat;
      const lonV = nodeVObj.lon;

      // Tính điểm giữa của cạnh
      const edgeMidpoint = [(latU + latV) / 2, (lonU + lonV) / 2];

      // Tính khoảng cách từ vật cản đến điểm giữa cạnh
      const distance = getDistance(
        clickedPoint[0],
        clickedPoint[1],
        edgeMidpoint[0],
        edgeMidpoint[1],
      );
      // Nếu khoảng cách nhỏ hơn hoặc bằng bán kính vật cản
      if (distance <= radius) {
        if (!isEdgeBlocked([u, v])) {
          blockedEdges.push([u, v]);
          console.log(`Cạnh bị chặn bởi vật cản: ${u} - ${v}`);
        }
      }
    });
  });

  console.log("Tổng số cạnh bị chặn bởi vật cản:", blockedEdges.length);
}

placeObstacleBtn.addEventListener("click", function () {
  isPlacingObstacle = !isPlacingObstacle;

  placeObstacleBtn.textContent = isPlacingObstacle
    ? "Hủy chọn vùng cấm"
    : "Đặt vùng cấm";
  placeObstacleBtn.classList.toggle("btn-danger", isPlacingObstacle);
  placeObstacleBtn.classList.toggle("btn-warning", !isPlacingObstacle);

  if (isPlacingObstacle) {
    map.closePopup(); // Đóng các popup khác nếu có
    // Lấy vị trí trung tâm của bản đồ để hiển thị popup
    const mapCenter = map.getCenter();
    L.popup({
      className: "info-leaflet-popup synced-leaflet-popup compact-point-popup", // Sử dụng các class đã style
      autoClose: true,
      closeOnClick: true,
    })
      .setLatLng(mapCenter) // Hiển thị popup ở giữa màn hình bản đồ
      .setContent("<b>Hướng dẫn:</b> Click vào bản đồ để đặt vùng cấm.")
      .openOn(map);

    setTimeout(() => {
      map.closePopup(); // Đóng popup cụ thể này hoặc tất cả
    }, 5000); // Đóng sau 5 giây
  }
});

/*-------------------------------------- Xử lý sự kiện Reset -------------------------------------*/
function resetMapWithGuest() {
  selectedPoints = [];
  startPoint = null;
  isDrawing = false;
  isBlockMode = false;
  isTrafficMode = false;
  isFloodMode = false;
  showNodes = false;
  isOneWayEdgeMode = false;
  if (startPointMarker) {
    map.removeLayer(startPointMarker);
    startPointMarker = null;
  }
  if (endPointMarker) {
    map.removeLayer(endPointMarker);
    endPointMarker = null;
  }
  // Đóng tất cả popup đang mở
  map.closePopup();
  map.eachLayer(function (layer) {
    if (layer.options && layer.options.id === "path-polyline-guest") {
      map.removeLayer(layer);
    }
  });
  // Xóa nội dung ô tìm kiếm
  if (typeof placeSearchInput !== "undefined" && placeSearchInput) {
    placeSearchInput.value = "";
  }
  // Xóa kết quả tìm kiếm
  if (typeof searchResultsContainer !== "undefined" && searchResultsContainer) {
    searchResultsContainer.innerHTML = "";
  }
  // Xóa marker tạm thời của việc tìm kiếm
  if (tempSearchMarker) {
    map.removeLayer(tempSearchMarker);
    tempSearchMarker = null;
  }
  redrawBannedLines();
  obstacleMarkers.forEach(([marker, circle]) => {
    if (marker && circle && map.hasLayer(marker) && map.hasLayer(circle)) {
      // Kiểm tra marker có tồn tại
      // Không cần vẽ lại nếu chúng đã có trên bản đồ và không bị xóa
    } else if (marker && circle) {
      // Nếu bị xóa thì vẽ lại
      drawObstacle(marker.getLatLng(), circle.getRadius());
    }
  });
  redrawAllOneWayArrows();
  const placeObstacleBtn = document.getElementById("placeObstacleBtn");
  placeObstacleBtn.textContent = "Đặt vùng cấm";
  placeObstacleBtn.classList.remove("btn-danger");
  placeObstacleBtn.classList.add("btn-warning");
}

function resetMapWithAdmin() {
  if (!isAdmin) {
    console.warn("Error Reset Admin");
    return;
  }
  selectedPoints = [];
  startPoint = null;
  isDrawing = false;
  isBlockMode = false;
  isTrafficMode = false;
  isFloodMode = false;
  isOneWayEdgeMode = false;
  bannedLines = [];
  trafficLine = [];
  floodLine = [];
  const oneWayBtn = document.getElementById("toggleOneWayEdgeModeBtn");
  if (oneWayBtn) {
    oneWayBtn.textContent = "Đường 1 chiều";
    oneWayBtn.classList.remove("btn-danger");
    oneWayBtn.classList.add("btn-info");
  }
  map.getContainer().style.cursor = "";
  oneWayEdges = []; // Xóa danh sách cạnh một chiều
  redrawAllOneWayArrows(); // Sẽ xóa tất cả mũi tên vì oneWayEdges rỗng
  map.closePopup(); // Đóng popup nếu có
  if (temporaryLine) {
    temporaryLine = null;
  }
  // Xóa các vật cản
  obstacleMarkers = [];
  isPlacingObstacle = false;
  blockedEdges = [];
  trafficEdges = [];
  floodEdges = [];
  if (typeof placeSearchInput !== "undefined" && placeSearchInput) {
    placeSearchInput.value = "";
  }
  // Xóa kết quả tìm kiếm
  if (typeof searchResultsContainer !== "undefined" && searchResultsContainer) {
    searchResultsContainer.innerHTML = "";
  }
  // Xóa marker tạm thời của việc tìm kiếm
  if (tempSearchMarker) {
    map.removeLayer(tempSearchMarker);
    tempSearchMarker = null;
  }
  // Xóa tất cả các layer trên bản đồ
  map.eachLayer(function (layer) {
    if (!(layer instanceof L.TileLayer)) {
      map.removeLayer(layer);
    }
  });
  console.log("\nReset bản đồ thành công!\n");
  console.log("Blocked edges: ", blockedEdges);
  console.log("TrafficEdges: ", trafficEdges);
  console.log("TrafficEdges: ", floodEdges);

  // Vẽ lại các lớp metro sau khi reset Admin
  // Vì resetMapWithAdmin đã xóa tất cả layer không phải TileLayer.
  drawMetroShapes();
  drawMetroStations();
  loadBoundary();

  const placeObstacleBtn = document.getElementById("placeObstacleBtn");
  placeObstacleBtn.textContent = "Đặt vùng cấm";
  placeObstacleBtn.classList.remove("btn-danger");
  placeObstacleBtn.classList.add("btn-warning");
}
document
  .getElementById("guestResetButton")
  .addEventListener("click", () => resetMapWithGuest()); // Guest reset - giữ lại đường cấm

document
  .getElementById("adminResetButton")
  .addEventListener("click", () => resetMapWithAdmin());

/*----------------------------------------- Các hàm hỗ trợ -----------------------------------------*/
// Các hàm tiện ích
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function segmentsIntersect(p1, p2, q1, q2, epsilon) {
  function ccw(a, b, c) {
    return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);
  }

  function pointSegmentDistance(p, a, b) {
    // Tính khoảng cách từ điểm p tới đoạn thẳng a-b
    let l2 = (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    if (l2 === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]); // a==b
    let t =
      ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / l2;
    t = Math.max(0, Math.min(1, t));
    let projection = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    return Math.hypot(p[0] - projection[0], p[1] - projection[1]);
  }

  function segmentsDistance(p1, p2, q1, q2) {
    // Khoảng cách nhỏ nhất giữa 2 đoạn thẳng
    return Math.min(
      pointSegmentDistance(p1, q1, q2),
      pointSegmentDistance(p2, q1, q2),
      pointSegmentDistance(q1, p1, p2),
      pointSegmentDistance(q2, p1, p2),
    );
  }

  let intersect =
    ccw(p1, q1, q2) !== ccw(p2, q1, q2) && ccw(p1, p2, q1) !== ccw(p1, p2, q2);

  if (intersect) return true;

  let distance = segmentsDistance(p1, p2, q1, q2);
  return distance <= epsilon;
}

let currentDebugDisplayLayers = [];
let guestPathPolyline = null;
let guestPathPolylines = [];

function clearCurrentDebugDisplay() {
  currentDebugDisplayLayers.forEach((layer) => {
    if (map.hasLayer(layer)) {
      map.removeLayer(layer);
    }
  });
  currentDebugDisplayLayers = [];
  console.log("Đã xóa hiển thị debug cũ (nếu có).");
}

function displayNodeAndDirectNeighbors(targetNodeIds) {
  clearCurrentDebugDisplay(); // Xóa hiển thị cũ

  if (
    typeof nodes === "undefined" ||
    typeof adj_list_with_weights === "undefined" ||
    !nodes ||
    nodes.length === 0 ||
    !adj_list_with_weights ||
    adj_list_with_weights.length === 0
  ) {
    console.error(
      "Lỗi: Dữ liệu đồ thị (nodes.js hoặc adj_list_with_weights.js) chưa tải xong, rỗng hoặc bị lỗi.",
    );
    L.popup()
      .setLatLng(map.getCenter())
      .setContent("Lỗi: Dữ liệu đồ thị chưa tải xong hoặc bị lỗi.")
      .openOn(map);
    return;
  }

  console.log(
    "Bắt đầu vẽ tập nút mục tiêu và các lân cận trực tiếp của chúng...",
  );

  const nodesToDrawIds = new Set(targetNodeIds);
  const edgesToDraw = [];
  const drawnDirectedEdgeKeys = new Set();

  adj_list_with_weights.forEach((sourceNodeInfo) => {
    const u = sourceNodeInfo.node_id;
    if (sourceNodeInfo.neighbors) {
      sourceNodeInfo.neighbors.forEach((neighborInfo) => {
        const v = neighborInfo.node_neighbor;
        const weight = neighborInfo.weight;
        const u_is_target = targetNodeIds.includes(u);
        const v_is_target = targetNodeIds.includes(v);

        if (u_is_target || v_is_target) {
          nodesToDrawIds.add(u);
          nodesToDrawIds.add(v);

          const directedEdgeKey = `${u}->${v}`;
          if (!drawnDirectedEdgeKeys.has(directedEdgeKey)) {
            let edgeType = "unknown";
            if (u_is_target && v_is_target) {
              edgeType = "between_targets";
            } else if (u_is_target) {
              edgeType = "outgoing_from_target";
            } else if (v_is_target) {
              edgeType = "incoming_to_target";
            }

            edgesToDraw.push({
              source: u,
              target: v,
              weight: weight,
              type: edgeType,
            });
            drawnDirectedEdgeKeys.add(directedEdgeKey);
          }
        }
      });
    }
  });

  nodesToDrawIds.forEach((nodeId) => {
    const nodeData = getNodeById(nodeId);
    if (
      nodeData &&
      typeof nodeData.lat === "number" &&
      typeof nodeData.lon === "number"
    ) {
      let markerColor, fillColor, markerRadius, zIndexOffset;

      if (targetNodeIds.includes(nodeId)) {
        markerColor = "red";
        fillColor = "#ffcdd2";
        markerRadius = 7;
        zIndexOffset = 2000;
      } else {
        markerColor = "blue";
        fillColor = "#bbdefb";
        markerRadius = 5;
        zIndexOffset = 1000;
      }

      const nodeMarker = L.circleMarker([nodeData.lat, nodeData.lon], {
        radius: markerRadius,
        color: markerColor,
        fillColor: fillColor,
        fillOpacity: 0.9,
        weight: 1.5,
        pane: "markerPane",
        zIndexOffset: zIndexOffset,
      }).addTo(map);

      let nodePopupContent = `<b>Nút ID:</b> ${nodeData.node_id}<br>`;
      if (targetNodeIds.includes(nodeId)) {
        nodePopupContent += `<i>(Nút mục tiêu/đang kiểm tra)</i><br>`;
      } else {
        nodePopupContent += `<i>(Nút lân cận trực tiếp)</i><br>`;
      }
      nodePopupContent += `<hr style="margin: 2px 0;">`;

      const actualOutgoingEdges = adj_list_with_weights.find(
        (item) => item.node_id === nodeId,
      );
      if (
        actualOutgoingEdges &&
        actualOutgoingEdges.neighbors &&
        actualOutgoingEdges.neighbors.length > 0
      ) {
        nodePopupContent += `<b>Các cạnh đi ra (từ dữ liệu gốc):</b><div style="max-height: 70px; overflow-y: auto; font-size:0.85em;">`;
        actualOutgoingEdges.neighbors.forEach((neighbor) => {
          nodePopupContent += `&bull; Đến ${neighbor.node_neighbor} (w: ${neighbor.weight.toFixed(0)}m)<br>`;
        });
        nodePopupContent += `</div>`;
      } else {
        nodePopupContent += `<i>Không có cạnh đi ra trong dữ liệu.</i><br>`;
      }
      nodeMarker.bindPopup(nodePopupContent, {
        className: "compact-point-popup synced-leaflet-popup",
      });
      currentDebugDisplayLayers.push(nodeMarker);
    } else {
      console.warn(
        "Không tìm thấy dữ liệu tọa độ cho nút ID:",
        nodeId,
        "hoặc dữ liệu không hợp lệ.",
      );
    }
  });

  edgesToDraw.forEach((edge) => {
    const sourceNodeData = getNodeById(edge.source);
    const targetNodeData = getNodeById(edge.target);

    if (
      sourceNodeData &&
      targetNodeData &&
      typeof sourceNodeData.lat === "number" &&
      typeof sourceNodeData.lon === "number" &&
      typeof targetNodeData.lat === "number" &&
      typeof targetNodeData.lon === "number"
    ) {
      const latlngs = [
        [sourceNodeData.lat, sourceNodeData.lon],
        [targetNodeData.lat, targetNodeData.lon],
      ];
      const edgeWeightVal = edge.weight;
      const edgeWeightKm = (edgeWeightVal / 1000).toFixed(2);

      let edgeLineColor;
      let edgeLineWeight = 2;
      let edgeLineOpacity = 0.75;

      switch (edge.type) {
        case "incoming_to_target":
          edgeLineColor = "orange";
          edgeLineWeight = 2.5;
          break;
        case "outgoing_from_target":
          edgeLineColor = "purple";
          edgeLineWeight = 2.5;
          edgeLineOpacity = 0.85;
          break;
        case "between_targets":
          edgeLineColor = "deeppink";
          edgeLineWeight = 3;
          edgeLineOpacity = 0.9;
          break;
        default:
          edgeLineColor = "gray";
      }

      if (
        sourceNodeData.lat === targetNodeData.lat &&
        sourceNodeData.lon === targetNodeData.lon &&
        edgeWeightVal > 0
      ) {
        console.warn(
          `Cạnh từ ${sourceNodeData.node_id} đến ${targetNodeData.node_id} có trọng số > 0 nhưng tọa độ trùng nhau. Bỏ qua vẽ.`,
        );
        return;
      }

      const edgePolyline = L.polyline(latlngs, {
        color: edgeLineColor,
        weight: edgeLineWeight,
        opacity: edgeLineOpacity,
      }).addTo(map);

      edgePolyline.bindPopup(
        `<b>Cạnh (${edge.type}):</b><br>` +
          `${edge.source} &rarr; ${edge.target}<br>` +
          `<b>Quãng đường:</b> ${edgeWeightKm} km (${edgeWeightVal.toFixed(0)} m)`,
        { className: "compact-point-popup synced-leaflet-popup" },
      );
      currentDebugDisplayLayers.push(edgePolyline);
    } else {
      console.warn(
        "Không thể vẽ cạnh do thiếu thông tin nút nguồn hoặc đích:",
        edge,
      );
    }
  });

  console.log(
    `Đã vẽ xong các nút mục tiêu và lân cận trực tiếp. ${currentDebugDisplayLayers.length} layers được thêm.`,
  );

  if (currentDebugDisplayLayers.length > 0) {
    const groupToZoom = L.featureGroup(
      currentDebugDisplayLayers.filter(
        (layer) => layer instanceof L.CircleMarker || layer instanceof L.Marker,
      ),
    );
    if (groupToZoom.getLayers().length > 0) {
      try {
        map.fitBounds(groupToZoom.getBounds().pad(0.3));
      } catch (e) {
        console.warn("Không thể tự động zoom vào các nút:", e);
      }
    } else if (
      currentDebugDisplayLayers.filter((layer) => layer instanceof L.Polyline)
        .length > 0
    ) {
      const polylineGroup = L.featureGroup(
        currentDebugDisplayLayers.filter(
          (layer) => layer instanceof L.Polyline,
        ),
      );
      if (polylineGroup.getLayers().length > 0) {
        try {
          map.fitBounds(polylineGroup.getBounds().pad(0.3));
        } catch (e) {
          console.warn("Không thể tự động zoom vào polylines:", e);
        }
      }
    }
  }
}
function findClosestShapeIndex(coords, node) {
  let bestIndex = -1;
  let bestDistance = Infinity;

  coords.forEach((coord, index) => {
    const d = getDistance(
      Number(node.lat),
      Number(node.lon),
      Number(coord[0]),
      Number(coord[1]),
    );

    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function getShapeSegmentInfoBetweenNodes(nodeA, nodeB) {
  if (!window.metroShapes) return null;

  let bestInfo = null;
  let bestScore = Infinity;

  Object.entries(window.metroShapes).forEach(([shapeId, coords]) => {
    if (!Array.isArray(coords) || coords.length < 2) return;

    const indexA = findClosestShapeIndex(coords, nodeA);
    const indexB = findClosestShapeIndex(coords, nodeB);

    if (indexA === -1 || indexB === -1 || indexA === indexB) return;

    const distA = getDistance(
      Number(nodeA.lat),
      Number(nodeA.lon),
      Number(coords[indexA][0]),
      Number(coords[indexA][1]),
    );

    const distB = getDistance(
      Number(nodeB.lat),
      Number(nodeB.lon),
      Number(coords[indexB][0]),
      Number(coords[indexB][1]),
    );

    const score = distA + distB;

    if (score < bestScore) {
      bestScore = score;

      let segmentCoords;
      if (indexA < indexB) {
        segmentCoords = coords.slice(indexA, indexB + 1);
      } else {
        segmentCoords = coords.slice(indexB, indexA + 1).reverse();
      }

      bestInfo = {
        shapeId,
        coords: segmentCoords,
      };
    }
  });

  return bestInfo;
}

// Giữ lại hàm cũ để những phần code khác nếu có gọi vẫn không bị lỗi.
function getShapeSegmentBetweenNodes(nodeA, nodeB) {
  const info = getShapeSegmentInfoBetweenNodes(nodeA, nodeB);
  return info ? info.coords : null;
}

function pushCoordIfDifferent(list, coord) {
  if (!coord || typeof coord[0] !== "number" || typeof coord[1] !== "number") {
    return;
  }

  const last = list[list.length - 1];
  if (!last || last[0] !== coord[0] || last[1] !== coord[1]) {
    list.push(coord);
  }
}

function buildPathSegmentsByShapes(pathNodeIds) {
  const resultSegments = [];

  for (let i = 0; i < pathNodeIds.length - 1; i++) {
    const nodeA = getNodeById(pathNodeIds[i]);
    const nodeB = getNodeById(pathNodeIds[i + 1]);

    if (!nodeA || !nodeB) continue;

    const startCoord = [Number(nodeA.lat), Number(nodeA.lon)];
    const endCoord = [Number(nodeB.lat), Number(nodeB.lon)];

    const info = getShapeSegmentInfoBetweenNodes(nodeA, nodeB);

    let shapeId = "PATH";
    let edgeCoords = [];

    // Luôn ép đoạn bắt đầu và kết thúc đúng tại ga.
    // Nhờ vậy khi chuyển tuyến, đường cũ dừng ở ga chuyển tuyến
    // và đường mới bắt đầu lại đúng từ chính ga đó.
    pushCoordIfDifferent(edgeCoords, startCoord);

    if (info && info.coords && info.coords.length >= 2) {
      shapeId = info.shapeId;
      info.coords.forEach((coord) => {
        pushCoordIfDifferent(edgeCoords, [Number(coord[0]), Number(coord[1])]);
      });
    }

    pushCoordIfDifferent(edgeCoords, endCoord);

    if (edgeCoords.length < 2) continue;

    const lastSegment = resultSegments[resultSegments.length - 1];

    // Nếu vẫn cùng tuyến/shape thì nối tiếp vào cùng một polyline.
    // Nếu khác tuyến/shape thì tạo polyline mới, tức là "dừng" ở ga cũ
    // và "bắt đầu" lại đường mới từ ga chuyển tuyến.
    if (lastSegment && lastSegment.shapeId === shapeId) {
      edgeCoords.slice(1).forEach((coord) => {
        pushCoordIfDifferent(lastSegment.coords, coord);
      });
      lastSegment.toNodeId = nodeB.node_id;
    } else {
      resultSegments.push({
        shapeId,
        fromNodeId: nodeA.node_id,
        toNodeId: nodeB.node_id,
        coords: edgeCoords,
      });
    }
  }

  return resultSegments;
}

function buildPathLatLngsByShapes(pathNodeIds) {
  const segments = buildPathSegmentsByShapes(pathNodeIds);
  const finalCoords = [];

  segments.forEach((segment) => {
    segment.coords.forEach((coord) => {
      pushCoordIfDifferent(finalCoords, coord);
    });
  });

  return finalCoords;
}

// Bảng màu tím dùng riêng cho các đoạn đường kết quả.
// Mỗi tuyến/shape trong lộ trình sẽ nhận một sắc tím khác nhau
// để dễ phân biệt khi phải chuyển tuyến.
const PATH_ROUTE_PURPLE_COLORS = [
  "#4c1d95", // tím rất đậm
  "#6d28d9", // tím đậm
  "#7c3aed", // tím vừa
  "#8b5cf6", // tím trung bình
  "#a78bfa", // tím nhạt
  "#c4b5fd", // tím rất nhạt
  "#ddd6fe", // tím pastel
];

function getPurpleColorForPathSegment(segmentIndex) {
  return PATH_ROUTE_PURPLE_COLORS[
    segmentIndex % PATH_ROUTE_PURPLE_COLORS.length
  ];
}

function clearGuestPathLayers() {
  if (guestPathPolyline && map.hasLayer(guestPathPolyline)) {
    map.removeLayer(guestPathPolyline);
    guestPathPolyline = null;
  }

  if (Array.isArray(guestPathPolylines)) {
    guestPathPolylines.forEach((layer) => {
      if (map.hasLayer(layer)) {
        map.removeLayer(layer);
      }
    });
  }

  guestPathPolylines = [];

  map.eachLayer(function (layer) {
    if (layer.options && layer.options.id === "path-polyline-guest") {
      map.removeLayer(layer);
    }
  });
}

function drawPath(pathNodeIds, costWithFactors, realDistance, algorithmUsed) {
  // Xóa đường đi cũ của guest nếu có
  algorithmSelect.disabled = true;
  togglePaths.disabled = true;
  roleToggle.disabled = true;
  guestResetButton.disabled = true;

  clearGuestPathLayers();

  if (!pathNodeIds || pathNodeIds.length < 2) {
    console.warn("drawPath: Đường đi không hợp lệ hoặc không đủ điểm để vẽ.");
    algorithmSelect.disabled = false;
    togglePaths.disabled = false;
    roleToggle.disabled = false;
    guestResetButton.disabled = false;
    return;
  }

  const pathSegments = buildPathSegmentsByShapes(pathNodeIds);
  const latlngs = [];

  pathSegments.forEach((segment) => {
    segment.coords.forEach((coord) => {
      pushCoordIfDifferent(latlngs, coord);
    });
  });

  if (latlngs.length < 2) {
    console.warn(
      "drawPath: Không đủ điểm hợp lệ (sau khi lọc) để vẽ đường đi.",
    );
    algorithmSelect.disabled = false;
    togglePaths.disabled = false;
    roleToggle.disabled = false;
    guestResetButton.disabled = false;
    return;
  }

  // Chuẩn bị nội dung popup
  let popupContent = `<div class="path-info-popup-content">`;
  popupContent += `<b><i class="fas fa-route" style="margin-right: 5px;"></i>Thông tin lộ trình (${algorithmUsed})</b>`;

  if (
    costWithFactors !== undefined &&
    costWithFactors !== null &&
    costWithFactors !== Infinity
  ) {
    let formattedCost = "";
    if (costWithFactors >= 3600) {
      const hours = Math.floor(costWithFactors / 3600);
      const minutes = Math.floor((costWithFactors % 3600) / 60);
      formattedCost = `${hours} giờ ${minutes} phút`;
    } else if (costWithFactors >= 60) {
      const minutes = Math.floor(costWithFactors / 60);
      const seconds = Math.round(costWithFactors % 60);
      formattedCost = `${minutes} phút ${seconds} giây`;
    } else if (costWithFactors > 0) {
      formattedCost = `${costWithFactors.toFixed(0)} giây`;
    } else if (costWithFactors === 0) {
      formattedCost = `Không đáng kể`;
    } else {
      formattedCost = `Không xác định`;
    }
    popupContent += `<br><i class="fas fa-stopwatch" style="margin-right: 5px;"></i>Thời gian ước tính: ${formattedCost}`;
  } else {
    popupContent += `<br><i class="fas fa-stopwatch" style="margin-right: 5px;"></i>Thời gian ước tính: Không có`;
  }

  if (
    realDistance !== undefined &&
    realDistance !== null &&
    realDistance !== Infinity
  ) {
    let formattedDistance = "";
    if (realDistance >= 1000) {
      formattedDistance = (realDistance / 1000).toFixed(2) + " km";
    } else if (realDistance >= 0) {
      formattedDistance = realDistance.toFixed(0) + " m";
    } else {
      formattedDistance = "Không xác định";
    }
    popupContent += `<br><i class="fas fa-ruler-combined" style="margin-right: 5px;"></i>Quãng đường thực tế: ${formattedDistance}`;
  } else {
    popupContent += `<br><i class="fas fa-ruler-combined" style="margin-right: 5px;"></i>Quãng đường thực tế: Không có`;
  }

  let averageSpeedKmph = "Không xác định";

  if (
    realDistance !== undefined &&
    realDistance !== null &&
    realDistance > 0 &&
    costWithFactors !== undefined &&
    costWithFactors !== null &&
    costWithFactors > 0
  ) {
    averageSpeedKmph = ((realDistance / costWithFactors) * 3.6).toFixed(1);
  }

  popupContent += `<br><i class="fas fa-tachometer-alt" style="margin-right: 5px;"></i>Vận tốc trung bình: ${averageSpeedKmph} km/h`;
  popupContent += `</div>`;

  // Vẽ từng đoạn theo từng tuyến/shape.
  // Khi shapeId đổi, tạo polyline mới thay vì nối liền một polyline duy nhất.
  // Mỗi đoạn/tuyến dùng một sắc tím khác nhau: tím đậm, tím vừa, tím nhạt...
  pathSegments.forEach((segment, index) => {
    const routeColor = getPurpleColorForPathSegment(index);

    const polyline = L.polyline(segment.coords, {
      color: routeColor,
      weight: 7,
      opacity: 0.95,
      id: "path-polyline-guest",
      className: "path-guest-route",
    }).addTo(map);

    polyline.bindPopup(
      `<b>Đoạn ${index + 1}</b><br>` +
        `Tuyến/shape: ${segment.shapeId}<br>` +
        `${segment.fromNodeId} → ${segment.toNodeId}<br>` +
        `<span style="display:inline-block;width:12px;height:12px;background:${routeColor};border-radius:50%;margin-right:5px;vertical-align:middle;"></span>` +
        `Màu đoạn: ${routeColor}`,
      {
        className: "synced-leaflet-popup path-info-leaflet-popup",
      },
    );

    guestPathPolylines.push(polyline);
  });

  // Đánh dấu các ga chuyển tuyến: điểm kết thúc đoạn trước cũng là điểm bắt đầu đoạn sau.
  for (let i = 1; i < pathSegments.length; i++) {
    const transferNodeId = pathSegments[i].fromNodeId;
    const transferNode = getNodeById(transferNodeId);

    if (!transferNode) continue;

    const transferMarker = L.circleMarker(
      [transferNode.lat, transferNode.lon],
      {
        radius: 8,
        color: "#ffffff",
        weight: 3,
        fillColor: "#7c3aed",
        fillOpacity: 1,
        opacity: 1,
        id: "path-polyline-guest",
      },
    ).addTo(map);

    transferMarker.bindPopup(
      `<b>Ga chuyển tuyến</b><br>${transferNode.name || transferNodeId}`,
      {
        className: "synced-leaflet-popup compact-point-popup",
      },
    );

    guestPathPolylines.push(transferMarker);
  }

  const pathGroup = L.featureGroup(guestPathPolylines);
  guestPathPolyline = pathGroup;

  const middleLatLng = getLatLngAtHalfDistance(latlngs.map((p) => L.latLng(p)));

  const routeInfoPopup = L.popup({
    className: "synced-leaflet-popup path-info-leaflet-popup",
    closeOnClick: false,
    autoClose: false,
  })
    .setLatLng(middleLatLng || L.latLng(latlngs[0]))
    .setContent(popupContent)
    .openOn(map);

  setTimeout(() => {
    map.closePopup(routeInfoPopup);
  }, 5000);
  map.fitBounds(pathGroup.getBounds().pad(0.3));

  algorithmSelect.disabled = false;
  togglePaths.disabled = false;
  roleToggle.disabled = false;
  guestResetButton.disabled = false;
}

function getLatLngAtHalfDistance(latlngs) {
  if (!Array.isArray(latlngs) || latlngs.length < 2) return null;

  // Đảm bảo định dạng
  latlngs = latlngs.map((p) => (p instanceof L.LatLng ? p : L.latLng(p)));

  let totalDistance = 0;
  const distances = [];

  for (let i = 0; i < latlngs.length - 1; i++) {
    const dist = latlngs[i].distanceTo(latlngs[i + 1]);
    distances.push(dist);
    totalDistance += dist;
  }

  const halfDistance = totalDistance / 2;
  let accumulated = 0;

  for (let i = 0; i < distances.length; i++) {
    if (accumulated + distances[i] >= halfDistance) {
      const ratio = (halfDistance - accumulated) / distances[i];
      const lat =
        latlngs[i].lat + ratio * (latlngs[i + 1].lat - latlngs[i].lat);
      const lng =
        latlngs[i].lng + ratio * (latlngs[i + 1].lng - latlngs[i].lng);
      return L.latLng(lat, lng);
    }
    accumulated += distances[i];
  }

  return latlngs[Math.floor(latlngs.length / 2)];
}

function distanceToLine(point, lineStart, lineEnd) {
  const x = point[0];
  const y = point[1];
  const x1 = lineStart[0];
  const y1 = lineStart[1];
  const x2 = lineEnd[0];
  const y2 = lineEnd[1];

  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const len_sq = C * C + D * D;
  let param = -1;

  if (len_sq != 0) param = dot / len_sq;

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;

  return Math.sqrt(dx * dx + dy * dy);
}

function isEdgeNearLine(edgeStart, edgeEnd, lineStart, lineEnd, threshold) {
  const d1 = distanceToLine(edgeStart, lineStart, lineEnd);
  const d2 = distanceToLine(edgeEnd, lineStart, lineEnd);
  const d3 = distanceToLine(lineStart, edgeStart, edgeEnd);
  const d4 = distanceToLine(lineEnd, edgeStart, edgeEnd);
  return Math.min(d1, d2, d3, d4) < threshold;
}

function isEdgeBlocked(edge) {
  return blockedEdges.some(
    (blocked) =>
      (blocked[0] === edge[0] && blocked[1] === edge[1]) ||
      (blocked[0] === edge[1] && blocked[1] === edge[0]),
  );
}

function handleBlockedEdge(edge) {
  if (!isEdgeBlocked(edge)) {
    blockedEdges.push(edge);
    console.log(`🚫 Cạnh bị cấm: ${edge[0]} - ${edge[1]}`);
    console.log();
  }
}

function detectBlockedEdgesByCut(cutLine) {
  const [p1, p2] = cutLine;
  // console.log("Đang kiểm tra các cạnh bị cắt bởi đường cấm... ", adj_list.length);
  for (let u = 0; u < adj_list_with_weights.length; u++) {
    // console.log(adj_list_with_weights[u].node_id);
    const currentNodeId = adj_list_with_weights[u].node_id;
    const nodeU = getNodeById(currentNodeId);

    const lat1 = nodeU.lat;
    const lon1 = nodeU.lon;

    for (let v = 0; v < adj_list_with_weights[u].neighbors.length; v++) {
      const vId = adj_list_with_weights[u].neighbors[v].node_neighbor;
      const nodeV = getNodeById(vId);
      const edgeLine = [
        [nodeU.lat, nodeU.lon],
        [nodeV.lat, nodeV.lon],
      ];
      if (segmentsIntersect(p1, p2, edgeLine[0], edgeLine[1], 0.0001)) {
        if (isBlockMode) handleBlockedEdge([nodeU.node_id, nodeV.node_id]);
        if (isTrafficMode) handleTrafficEdge([nodeU.node_id, nodeV.node_id]);
        if (isFloodMode) handleFloodEdge([nodeU.node_id, nodeV.node_id]);
      }
    }
  }
}

function handleDrawingMode(lat, lng, isTraffic = false, isFlood = false) {
  isDrawing = true;
  startPoint = [lat, lng];
  points.push([lat, lng]);

  let color;
  let trafficLevel = parseInt(document.getElementById("trafficLevel").value);
  let floodLevel = parseInt(document.getElementById("floodLevel").value);
  if (!isTraffic && !isFlood) {
    color = "#f44336"; // Đỏ - cấm đường
  } else if (isTraffic) {
    switch (trafficLevel) {
      case 1:
        color = "#fdd835"; // Tắc nhẹ - vàng tươi
        break;
      case 2:
        color = "#ffb300"; // Tắc vừa - cam đậm
        break;
      case 3:
        color = "#bf360c"; // Tắc nặng - nâu cam đậm
        break;
    }
  } else {
    switch (floodLevel) {
      case 1:
        color = "#64b5f6"; // Ngập nhẹ - xanh dương nhạt
        break;
      case 2:
        color = "#2196f3"; // Ngập vừa - xanh dương vừa
        break;
      case 3:
        color = "#0d47a1"; // Ngập nặng - xanh dương đậm nhất
        break;
    }
  }
  const polylineOptions = {
    color: color,
    weight: 3,
    dashArray: "10,10",
    opacity: 0.8,
  };

  const currentPoint = [lat, lng];

  // Vẽ chấm tròn tại điểm click
  L.circleMarker(currentPoint, {
    radius: 5,
    color: color,
    fillColor: color,
    fillOpacity: 1,
  }).addTo(map);

  // Xóa polyline cũ nếu có
  if (isTraffic && trafficPolyline) {
    map.removeLayer(trafficPolyline);
  } else if (isFlood && floodPolyline) {
    map.removeLayer(floodPolyline);
  } else if (banPolyline) {
    map.removeLayer(banPolyline);
  }

  // Tạo polyline mới
  if (isTraffic) {
    trafficPolyline = L.polyline(points, polylineOptions).addTo(map);
  } else if (isFlood) {
    floodPolyline = L.polyline(points, polylineOptions).addTo(map);
  } else {
    banPolyline = L.polyline(points, polylineOptions).addTo(map);
  }
}

let isOneWayEdgeMode = false; // Thay cho isOneWayMode cũ, quản lý chế độ chọn cạnh
let oneWayEdges = []; // Danh sách các cạnh một chiều [[sourceId, destId], ...]
let oneWayArrowDecorators = {}; // Lưu các layer mũi tên, key dạng "sourceId-destId"

const ONE_WAY_ARROW_COLOR = "purple"; // Màu cho mũi tên và đường một chiều
const ONE_WAY_CLICK_THRESHOLD_METERS = 20; // Ngưỡng khoảng cách (mét) để chọn cạnh khi click

function distToSegmentSquared(clickLat, clickLon, lat1, lon1, lat2, lon2) {
  const l2 = (lat1 - lat2) * (lat1 - lat2) + (lon1 - lon2) * (lon1 - lon2);
  if (l2 === 0) {
    // p1 và p2 trùng nhau
    const distSq =
      (clickLat - lat1) * (clickLat - lat1) +
      (clickLon - lon1) * (clickLon - lon1);
    return { distanceSquared: distSq, closestPoint: { lat: lat1, lon: lon1 } };
  }

  let t =
    ((clickLat - lat1) * (lat2 - lat1) + (clickLon - lon1) * (lon2 - lon1)) /
    l2;

  let closestLat, closestLon;

  if (t < 0) {
    // Điểm chiếu nằm ngoài đoạn thẳng, về phía p1
    closestLat = lat1;
    closestLon = lon1;
  } else if (t > 1) {
    // Điểm chiếu nằm ngoài đoạn thẳng, về phía p2
    closestLat = lat2;
    closestLon = lon2;
  } else {
    // Điểm chiếu nằm trên đoạn thẳng p1p2
    closestLat = lat1 + t * (lat2 - lat1);
    closestLon = lon1 + t * (lon2 - lon1);
  }

  const dx = clickLat - closestLat;
  const dy = clickLon - closestLon;
  return {
    distanceSquared: dx * dx + dy * dy,
    closestPoint: { lat: closestLat, lon: closestLon },
  };
}

function findClosestEdgeToPoint(clickLatlng) {
  let closestEdge = null;
  let minDistanceSquared = Infinity; // Sẽ làm việc với bình phương khoảng cách để tránh Math.sqrt

  if (!adj_list_with_weights || !nodes) {
    console.error("LỖI: adj_list_with_weights hoặc nodes chưa được tải.");
    return null;
  }
  if (nodes.length === 0 || adj_list_with_weights.length === 0) {
    console.error("LỖI: Dữ liệu nodes hoặc adj_list_with_weights rỗng!");
    return null;
  }
  // Kiểm tra clickLatlng
  if (
    !clickLatlng ||
    typeof clickLatlng.lat !== "number" ||
    typeof clickLatlng.lng !== "number" ||
    isNaN(clickLatlng.lat) ||
    isNaN(clickLatlng.lng)
  ) {
    console.error("LỖI: clickLatlng không hợp lệ:", clickLatlng);
    return null;
  }
  const cLat = clickLatlng.lat;
  const cLon = clickLatlng.lng;

  adj_list_with_weights.forEach((u_node_info, indexU) => {
    const nodeU = getNodeById(u_node_info.node_id);
    if (!nodeU) return;

    const uLat = parseFloat(nodeU.lat);
    const uLon = parseFloat(nodeU.lon);
    if (isNaN(uLat) || isNaN(uLon)) {
      console.warn(
        `Node U ${nodeU.node_id}: Dữ liệu lat/lon gốc hoặc sau parseFloat là NaN. Gốc: lat=${nodeU.lat}, lon=${nodeU.lon}`,
      );
      return;
    }

    if (!u_node_info.neighbors || u_node_info.neighbors.length === 0) return;

    u_node_info.neighbors.forEach((v_neighbor, indexV) => {
      const nodeV = getNodeById(v_neighbor.node_neighbor);
      if (!nodeV) return;

      const vLat = parseFloat(nodeV.lat);
      const vLon = parseFloat(nodeV.lon);
      if (isNaN(vLat) || isNaN(vLon)) {
        console.warn(
          `Node V ${nodeV.node_id}: Dữ liệu lat/lon gốc hoặc sau parseFloat là NaN. Gốc: lat=${nodeV.lat}, lon=${nodeV.lon}`,
        );
        return;
      }

      const segmentInfo = distToSegmentSquared(
        cLat,
        cLon,
        uLat,
        uLon,
        vLat,
        vLon,
      );
      const currentDistSq = segmentInfo.distanceSquared;
      if (currentDistSq < minDistanceSquared) {
        minDistanceSquared = currentDistSq;
        closestEdge = {
          u: nodeU,
          v: nodeV,
        };
      }
    });
  });

  console.log(
    "Kết quả findClosestEdgeToPoint (tự tính): Cạnh gần nhất:",
    closestEdge ? `${closestEdge.u.node_id}-${closestEdge.v.node_id}` : null,
    "Bình phương khoảng cách nhỏ nhất:",
    minDistanceSquared === Infinity
      ? "Infinity"
      : minDistanceSquared.toFixed(8),
  );

  if (closestEdge) {
    const clickPointLatLng = L.latLng(cLat, cLon);
    let actualDistanceToEdgeMeters = Infinity;

    if (closestEdge.u && closestEdge.v) {
      const closestPtOnSeg = distToSegmentSquared(
        cLat,
        cLon,
        parseFloat(closestEdge.u.lat),
        parseFloat(closestEdge.u.lon),
        parseFloat(closestEdge.v.lat),
        parseFloat(closestEdge.v.lon),
      ).closestPoint;
      actualDistanceToEdgeMeters = getDistance(
        cLat,
        cLon,
        closestPtOnSeg.lat,
        closestPtOnSeg.lon,
      );
      console.log(
        `Khoảng cách thực tế (tính bằng getDistance) tới cạnh ${closestEdge.u.node_id}-${closestEdge.v.node_id} là: ${actualDistanceToEdgeMeters.toFixed(2)}m`,
      );
    }

    if (actualDistanceToEdgeMeters < ONE_WAY_CLICK_THRESHOLD_METERS) {
      console.log(
        `Tìm thấy cạnh ${closestEdge.u.node_id}-${closestEdge.v.node_id} trong ngưỡng (${ONE_WAY_CLICK_THRESHOLD_METERS}m).`,
      );
      return closestEdge;
    } else {
      console.log(
        `Cạnh gần nhất ${closestEdge.u.node_id}-${closestEdge.v.node_id} (${actualDistanceToEdgeMeters.toFixed(2)}m) không nằm trong ngưỡng (${ONE_WAY_CLICK_THRESHOLD_METERS}m).`,
      );
      return null;
    }
  }

  console.log(
    "Không tìm thấy cạnh nào (có thể do không có cạnh hoặc không trong ngưỡng).",
  );
  return null;
}

function addOneWayArrow(sourceNodeId, destNodeId) {
  const sourceNode = getNodeById(sourceNodeId);
  const destNode = getNodeById(destNodeId);

  // Tạo một key duy nhất cho cả đường polyline, các marker và decorator của hướng này
  const key = `${sourceNodeId}-${destNodeId}`;

  // Xóa các thành phần cũ nếu có (tránh trùng lặp)
  if (oneWayArrowDecorators[key]) {
    if (oneWayArrowDecorators[key].polyline) {
      map.removeLayer(oneWayArrowDecorators[key].polyline);
    }
    if (oneWayArrowDecorators[key].decorator) {
      map.removeLayer(oneWayArrowDecorators[key].decorator);
    }
    if (oneWayArrowDecorators[key].sourceMarker) {
      map.removeLayer(oneWayArrowDecorators[key].sourceMarker);
    }
    if (oneWayArrowDecorators[key].destMarker) {
      map.removeLayer(oneWayArrowDecorators[key].destMarker);
    }
    delete oneWayArrowDecorators[key]; // Xóa entry cũ
  }

  if (sourceNode && destNode) {
    // Đảm bảo tọa độ là số (quan trọng!)
    const sLat = parseFloat(sourceNode.lat);
    const sLon = parseFloat(sourceNode.lon);
    const dLat = parseFloat(destNode.lat);
    const dLon = parseFloat(destNode.lon);

    if (isNaN(sLat) || isNaN(sLon) || isNaN(dLat) || isNaN(dLon)) {
      console.error(
        `Tọa độ không hợp lệ cho node ${sourceNodeId} hoặc ${destNodeId}. Không thể vẽ đường một chiều.`,
      );
      return;
    }

    const latlngs = [
      [sLat, sLon],
      [dLat, dLon],
    ];

    // 1. Vẽ Markers cho Node Đầu và Cuối
    const sourceMarker = L.circleMarker([sLat, sLon], {
      radius: 4, // Kích thước marker
      fillColor: ONE_WAY_ARROW_COLOR,
      color: "#fff", // Màu viền marker
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
    }).addTo(map);

    const destMarker = L.circleMarker([dLat, dLon], {
      radius: 4,
      fillColor: ONE_WAY_ARROW_COLOR,
      color: "#fff",
      weight: 2,
      opacity: 1,
      fillOpacity: 0.8,
    }).addTo(map);

    // 2. Polyline cơ sở to hơn
    const polyline = L.polyline(latlngs, {
      color: ONE_WAY_ARROW_COLOR,
      weight: 3, // Độ dày của đường to hơn
      opacity: 0.7,
    }).addTo(map);

    // 3. Nhiều mũi tên hơn
    const arrowDecorator = L.polylineDecorator(latlngs, {
      patterns: [
        {
          offset: 20, // Bắt đầu vẽ mũi tên đầu tiên sau 20px từ điểm bắt đầu
          repeat: "20px", // Lặp lại mũi tên mỗi 80px
          symbol: L.Symbol.arrowHead({
            pixelSize: 15,
            polygon: false,
            pathOptions: {
              stroke: true,
              color: ONE_WAY_ARROW_COLOR,
              weight: 2, // Giữ nguyên độ dày của mũi tên hoặc điều chỉnh nếu muốn
              opacity: 1,
              fillOpacity: 1,
            },
          }),
        },
      ],
    }).addTo(map);

    // Lưu tất cả các layer liên quan để có thể xóa chúng sau này
    oneWayArrowDecorators[key] = {
      polyline: polyline,
      decorator: arrowDecorator,
      sourceMarker: sourceMarker,
      destMarker: destMarker,
    };
  } else {
    console.warn(
      `Không tìm thấy sourceNode (ID: ${sourceNodeId}) hoặc destNode (ID: ${destNodeId}) để vẽ đường một chiều.`,
    );
  }
}

function removeOneWayArrow(nodeId1, nodeId2) {
  // Xóa cho hướng nodeId1 -> nodeId2
  const key1 = `${nodeId1}-${nodeId2}`;
  if (oneWayArrowDecorators[key1]) {
    if (oneWayArrowDecorators[key1].polyline)
      map.removeLayer(oneWayArrowDecorators[key1].polyline);
    if (oneWayArrowDecorators[key1].decorator)
      map.removeLayer(oneWayArrowDecorators[key1].decorator);
    if (oneWayArrowDecorators[key1].sourceMarker)
      map.removeLayer(oneWayArrowDecorators[key1].sourceMarker);
    if (oneWayArrowDecorators[key1].destMarker)
      map.removeLayer(oneWayArrowDecorators[key1].destMarker);
    delete oneWayArrowDecorators[key1];
  }

  // Xóa cho hướng nodeId2 -> nodeId1 (nếu có)
  const key2 = `${nodeId2}-${nodeId1}`;
  if (oneWayArrowDecorators[key2]) {
    if (oneWayArrowDecorators[key2].polyline)
      map.removeLayer(oneWayArrowDecorators[key2].polyline);
    if (oneWayArrowDecorators[key2].decorator)
      map.removeLayer(oneWayArrowDecorators[key2].decorator);
    if (oneWayArrowDecorators[key2].sourceMarker)
      map.removeLayer(oneWayArrowDecorators[key2].sourceMarker);
    if (oneWayArrowDecorators[key2].destMarker)
      map.removeLayer(oneWayArrowDecorators[key2].destMarker);
    delete oneWayArrowDecorators[key2];
  }
}

function redrawAllOneWayArrows() {
  // Xóa tất cả các đối tượng trang trí (bao gồm polyline, decorator, markers) cũ trên bản đồ
  for (const key in oneWayArrowDecorators) {
    if (oneWayArrowDecorators.hasOwnProperty(key)) {
      const layers = oneWayArrowDecorators[key];
      if (layers.polyline) map.removeLayer(layers.polyline);
      if (layers.decorator) map.removeLayer(layers.decorator);
      if (layers.sourceMarker) map.removeLayer(layers.sourceMarker);
      if (layers.destMarker) map.removeLayer(layers.destMarker);
    }
  }
  oneWayArrowDecorators = {}; // Reset object lưu trữ

  // Vẽ lại mũi tên (và các thành phần khác) dựa trên oneWayEdges hiện tại
  oneWayEdges.forEach((edge) => {
    if (edge && edge.length === 2) {
      // Thêm kiểm tra cho edge
      addOneWayArrow(edge[0], edge[1]);
    } else {
      console.warn("Edge không hợp lệ trong oneWayEdges:", edge);
    }
  });
}

// Đảm bảo các hàm này có thể truy cập toàn cục nếu gọi từ HTML trong popup
window.setOneWayDirection = function (
  sourceNodeId,
  destNodeId,
  edgeNodeUId,
  edgeNodeVId,
) {
  // 1. Xóa mọi thiết lập một chiều cũ cho cạnh vật lý này (cả 2 chiều)
  oneWayEdges = oneWayEdges.filter(
    (edge) =>
      !(
        (edge[0] === edgeNodeUId && edge[1] === edgeNodeVId) ||
        (edge[0] === edgeNodeVId && edge[1] === edgeNodeUId)
      ),
  );
  removeOneWayArrow(edgeNodeUId, edgeNodeVId); // Hàm này xóa cả 2 chiều có thể của mũi tên cũ

  // 2. Thêm hướng mới đã chọn
  oneWayEdges.push([sourceNodeId, destNodeId]);
  console.log(`Đã đặt đường một chiều: ${sourceNodeId} -> ${destNodeId}`);
  addOneWayArrow(sourceNodeId, destNodeId); // Vẽ mũi tên cho hướng mới

  map.closePopup(); // Đóng popup
};

window.clearOneWaySetting = function (nodeId1, nodeId2) {
  oneWayEdges = oneWayEdges.filter(
    (edge) =>
      !(
        (edge[0] === nodeId1 && edge[1] === nodeId2) ||
        (edge[0] === nodeId2 && edge[1] === nodeId1)
      ),
  );
  removeOneWayArrow(nodeId1, nodeId2); // Hàm này xóa cả 2 chiều

  console.log(
    `Đã xóa cài đặt đường một chiều cho cạnh ${nodeId1} - ${nodeId2}`,
  );
  map.closePopup();
};

function handleOneWayEdgeModeClick(clickEvent) {
  const clickLatlng = clickEvent.latlng;
  const selectedEdge = findClosestEdgeToPoint(clickLatlng);

  if (selectedEdge) {
    const { u, v } = selectedEdge; // u và v là các object node từ findClosestEdgeToPoint

    // Đảm bảo u và v có node_id hợp lệ
    if (
      !u ||
      typeof u.node_id === "undefined" ||
      !v ||
      typeof v.node_id === "undefined"
    ) {
      console.error(
        "Node u hoặc v không hợp lệ từ selectedEdge:",
        selectedEdge,
      );
      return;
    }

    if (!isPhysicallyTwoWayEdge(u.node_id, v.node_id)) {
      map.closePopup(); // Đóng các popup khác trước khi hiển thị thông báo này

      const popupLocation = clickLatlng;

      L.popup({
        className:
          "info-leaflet-popup synced-leaflet-popup compact-point-popup", // Sử dụng các class đã style
        autoClose: true, // Cho phép tự đóng khi mở popup khác hoặc click map
        closeOnClick: true, // Đóng khi click map
      })
        .setLatLng(popupLocation)
        .setContent(
          "<b>Thông báo:</b> Đây là đường 1 chiều mặc định. Vui lòng chọn đường 2 chiều khác để chuyển thành đường 1 chiều!",
        )
        .openOn(map);
      return; // Dừng xử lý tiếp
    }
    const isUtoV_userSet = oneWayEdges.some(
      (e) => e[0] === u.node_id && e[1] === v.node_id,
    );
    const isVtoU_userSet = oneWayEdges.some(
      (e) => e[0] === v.node_id && e[1] === u.node_id,
    );

    let currentDirectionText = "Hiện tại: Đường hai chiều.";
    let nextSourceNodeId, nextDestNodeId;
    let buttonActionText;

    // Quy ước "Hướng 1" là từ u sang v (theo thứ tự selectedEdge trả về)
    // và "Hướng 2" là từ v sang u.
    const Hướng1_Source = u.node_id;
    const Hướng1_Dest = v.node_id;
    const Hướng2_Source = v.node_id;
    const Hướng2_Dest = u.node_id;

    if (isUtoV_userSet) {
      // Hiện tại là Hướng 1 (U -> V), nút sẽ đổi sang Hướng 2 (V -> U)
      currentDirectionText = `Hiện tại: Một chiều`;
      nextSourceNodeId = Hướng2_Source;
      nextDestNodeId = Hướng2_Dest;
      buttonActionText = `Đổi chiều`;
    } else if (isVtoU_userSet) {
      // Hiện tại là Hướng 2 (V -> U), nút sẽ đổi sang Hướng 1 (U -> V)
      currentDirectionText = `Hiện tại: Một chiều`;
      nextSourceNodeId = Hướng1_Source;
      nextDestNodeId = Hướng1_Dest;
      buttonActionText = `Đổi chiều`;
    } else {
      // Chưa đặt, nút sẽ đặt chiều mặc định là Hướng 1 (U -> V)
      currentDirectionText = "Hiện tại: Đường hai chiều."; // Hoặc "Sẵn sàng đặt một chiều."
      nextSourceNodeId = Hướng1_Source;
      nextDestNodeId = Hướng1_Dest;
      buttonActionText = `Đặt một chiều`;
    }

    let popupContent = `
            <div class="custom-leaflet-popup">
                <h5>Điều chỉnh hướng cho đoạn đường</h5>
                <small class="popup-status">${currentDirectionText}</small>
                <hr class="popup-hr">
                <button class="btn btn-primary btn-popup" onclick="setOneWayDirection(${nextSourceNodeId}, ${nextDestNodeId}, ${u.node_id}, ${v.node_id})">
                    ${buttonActionText}
                </button>
        `;

    if (isUtoV_userSet || isVtoU_userSet) {
      popupContent += `
                <button class="btn btn-danger btn-popup" style="margin-top: 8px;" onclick="clearOneWaySetting(${u.node_id}, ${v.node_id})">
                    Xóa một chiều
                </button>`;
    }
    popupContent += `</div>`;

    const uLat = parseFloat(u.lat);
    const uLon = parseFloat(u.lon);
    const vLat = parseFloat(v.lat);
    const vLon = parseFloat(v.lon);

    if (isNaN(uLat) || isNaN(uLon) || isNaN(vLat) || isNaN(vLon)) {
      console.error(
        "Tọa độ của node u hoặc v không hợp lệ để tính điểm giữa cho popup.",
      );
      return;
    }

    const midPoint = L.latLng((uLat + vLat) / 2, (uLon + vLon) / 2);

    L.popup({ className: "synced-leaflet-popup" })
      .setLatLng(midPoint)
      .setContent(popupContent)
      .openOn(map);
  } else {
  }
}

document
  .getElementById("toggleOneWayEdgeModeBtn")
  .addEventListener("click", function () {
    isOneWayEdgeMode = !isOneWayEdgeMode;

    // Tắt các chế độ vẽ khác nếu có
    if (isOneWayEdgeMode) {
      isBlockMode = false;
      isDrawing = false;
      isPlacingObstacle = false;
      isTrafficMode = false;
      isFloodMode = false;

      map.closePopup(); // Đóng các popup khác nếu có
      // Lấy vị trí trung tâm của bản đồ để hiển thị popup
      const mapCenter = map.getCenter();
      L.popup({
        className:
          "info-leaflet-popup synced-leaflet-popup compact-point-popup", // Sử dụng các class đã style
        autoClose: true,
        closeOnClick: true,
      })
        .setLatLng(mapCenter) // Hiển thị popup ở giữa màn hình bản đồ
        .setContent(
          "<b>Hướng dẫn:</b> Click vào bản đồ để chọn đường.<br>Nhấn phím <b>ESC</b> để hoàn thành hoặc hủy chế độ.",
        )
        .openOn(map);

      setTimeout(() => {
        map.closePopup(); // Đóng popup cụ thể này hoặc tất cả
      }, 5000); // Đóng sau 5 giây        this.textContent = "Tắt chế độ Đường 1 chiều";
      this.classList.add("btn-danger");
      this.classList.remove("btn-info");
      map.getContainer().style.cursor = "pointer"; // Đổi con trỏ chuột
    } else {
      this.textContent = "Đường 1 chiều";
      this.classList.remove("btn-danger");
      this.classList.add("btn-info");
      map.getContainer().style.cursor = ""; // Trả lại con trỏ chuột mặc định
    }
  });

// Hàm vẽ lại tất cả các mũi tên (gọi khi cần, ví dụ sau khi reset guest)
function redrawAllOneWayArrows() {
  // Xóa tất cả mũi tên cũ trên bản đồ
  for (const key in oneWayArrowDecorators) {
    if (
      oneWayArrowDecorators.hasOwnProperty(key) &&
      oneWayArrowDecorators[key]
    ) {
      map.removeLayer(oneWayArrowDecorators[key]);
    }
  }
  oneWayArrowDecorators = {}; // Reset object lưu trữ

  // Vẽ lại mũi tên dựa trên oneWayEdges hiện tại
  oneWayEdges.forEach((edge) => {
    addOneWayArrow(edge[0], edge[1]);
  });
}

function isPhysicallyTwoWayEdge(nodeId1, nodeId2) {
  if (!adj_list_with_weights) {
    console.error(
      "adj_list_with_weights chưa được tải để kiểm tra isPhysicallyTwoWayEdge",
    );
    return false; // Hoặc một giá trị mặc định khác tùy logic của bạn
  }

  let uConnectsToV = false;
  let vConnectsToU = false;

  // Kiểm tra nodeId1 -> nodeId2
  const node1Info = adj_list_with_weights.find(
    (item) => item.node_id === nodeId1,
  );
  if (node1Info && node1Info.neighbors) {
    if (
      node1Info.neighbors.some((neighbor) => neighbor.node_neighbor === nodeId2)
    ) {
      uConnectsToV = true;
    }
  }

  // Kiểm tra nodeId2 -> nodeId1
  const node2Info = adj_list_with_weights.find(
    (item) => item.node_id === nodeId2,
  );
  if (node2Info && node2Info.neighbors) {
    if (
      node2Info.neighbors.some((neighbor) => neighbor.node_neighbor === nodeId1)
    ) {
      vConnectsToU = true;
    }
  }
  // console.log(`Kiểm tra hai chiều <span class="math-inline">\{nodeId1\}\-</span>{nodeId2}: <span class="math-inline">\{nodeId1\}\-\></span>{nodeId2} is ${uConnectsToV}, <span class="math-inline">\{nodeId2\}\-\></span>{nodeId1} is ${vConnectsToU}`);
  return uConnectsToV && vConnectsToU;
}

document.addEventListener("DOMContentLoaded", function () {
  const collapsibleTriggers = document.querySelectorAll(".collapsible-trigger");

  collapsibleTriggers.forEach((trigger) => {
    trigger.addEventListener("click", function () {
      const content = this.nextElementSibling;
      const isActive = this.classList.contains("active");

      closeOtherCollapsibles(this);

      if (!isActive) {
        this.classList.add("active");
        content.style.display = "block";
      }
    });
  });

  function closeOtherCollapsibles(currentTrigger) {
    collapsibleTriggers.forEach((trigger) => {
      if (trigger !== currentTrigger || trigger.classList.contains("active")) {
        const content = trigger.nextElementSibling;
        if (content && content.style.display !== "none") {
          trigger.classList.remove("active");
          content.style.display = "none";
        }
      }
    });
  }
});
