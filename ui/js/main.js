/* DC Pathfinder — slim client */

const API = "http://127.0.0.1:5000";

/* ───── Map & layers ───── */
const map = L.map("map", { zoomControl: false }).setView([38.9072, -77.0369], 12);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "© OpenStreetMap contributors",
  maxZoom: 19,
}).addTo(map);
L.control.zoom({ position: "bottomleft" }).addTo(map);

const railwayLayer = L.layerGroup().addTo(map);
const stationLayer = L.layerGroup().addTo(map);
const setupLayer = L.layerGroup().addTo(map);
const resultLayer = L.layerGroup().addTo(map);  // start/end pins (user-clicked)
const pathLayer = L.layerGroup().addTo(map);    // drawn path(s) — single or compare

// Per-algorithm visual style. Distinct color + dash pattern so overlapping paths
// stay distinguishable on the map and match the legend swatches in the compare table.
const ALGO_STYLE = {
  Dijkstra: { color: "#ff2d2d", weight: 6, dashArray: null },
  UCS:      { color: "#38c4b8", weight: 5, dashArray: "10,6" },
  BFS:      { color: "#f5c842", weight: 5, dashArray: "6,6" },
  DFS:      { color: "#f5a623", weight: 4, dashArray: "4,4" },
  IDDFS:    { color: "#c956d6", weight: 4, dashArray: "2,7" },
};
const _defaultAlgoStyle = { color: "#999", weight: 3, dashArray: null };
const algoStyle = (name) => ALGO_STYLE[name] || _defaultAlgoStyle;

/* ───── State ───── */
let stations = []; // {id,name,lat,lon}
let stationById = {};
let railwayEdges = []; // [[[lat,lon],[lat,lon]], ...]
let setups = [];
let clickCoords = []; // [[lat,lng], [lat,lng]]
let startMarker = null,
  endMarker = null;
let isAdmin = false;
let currentMode = "FindPath";

// Setup sub-mode: null | "road" | "area" | "congestion"
let setupMode = null;
let areaPoints = []; // polygon in progress: [[lat,lng], ...]
let areaPreviewLayer = L.layerGroup().addTo(map);

/* ───── Helpers ───── */
const $ = (id) => document.getElementById(id);
const setStatus = (m) => ($("status-text").textContent = m);

/* Prominent toast popup — for things the small status bar would hide. */
let _toastTimer = null;
function showToast(message, kind = "error", duration = 6000) {
  const el = $("toast");
  if (!el) return;
  el.classList.remove("hidden", "warn", "info");
  if (kind === "warn" || kind === "info") el.classList.add(kind);
  el.querySelector(".toast-icon").textContent =
    kind === "info" ? "ℹ" : kind === "warn" ? "⚠" : "✖";
  el.querySelector(".toast-msg").textContent = message;
  // Force reflow so the transition runs even if the toast was already visible.
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(_toastTimer);
  if (duration > 0) {
    _toastTimer = setTimeout(hideToast, duration);
  }
}
function hideToast() {
  const el = $("toast");
  if (!el) return;
  el.classList.remove("show");
  clearTimeout(_toastTimer);
}
{
  const _closeBtn = document.querySelector("#toast .toast-close");
  if (_closeBtn) _closeBtn.addEventListener("click", hideToast);
}

function pinIcon(color, label) {
  return L.divIcon({
    className: "",
    html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:${color};transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.5);border:2px solid rgba(255,255,255,0.2)"><span style="transform:rotate(45deg);font-size:11px">${label}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
    popupAnchor: [0, -30],
  });
}

function nearestStation(lat, lng) {
  let best = null,
    bestD = Infinity;
  for (const s of stations) {
    const d = (s.lat - lat) ** 2 + (s.lon - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return best;
}

function clearResult() {
  resultLayer.clearLayers();
  pathLayer.clearLayers();
  startMarker = endMarker = null;
  $("stats").style.display = "none";
  $("compare-panel").style.display = "none";
}

/* ───── Render base layers ───── */
function drawStations() {
  stationLayer.clearLayers();
  stations.forEach((s) => {
    L.marker([s.lat, s.lon], {
      icon: L.divIcon({
        className: "station-icon",
        html: '<div style="width:10px;height:10px;background:#f5c842;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.3)"></div>',
        iconSize: [10, 10],
        iconAnchor: [5, 5],
        popupAnchor: [0, -5],
      }),
    })
      .bindPopup(`<b>${s.name}</b>`)
      .addTo(stationLayer);
  });
}

function drawRailway() {
  railwayLayer.clearLayers();
  railwayEdges.forEach((seg) =>
    L.polyline(seg, { color: "#2a3550", weight: 2, opacity: 0.9 }).addTo(railwayLayer),
  );
}

/* ───── Setup list (ban/flood) ───── */
function redrawSetups() {
  setupLayer.clearLayers();
  setups.forEach((s) => {
    if (s.type === "road") {
      (s.coords || []).forEach((seg) =>
        L.polyline(seg, {
          color: "#ff2d2d",
          weight: 5,
          opacity: 0.95,
        })
          .bindTooltip(s.label, { sticky: true })
          .addTo(setupLayer),
      );
    } else if (s.type === "area" && s.polygon) {
      L.polygon(s.polygon, {
        color: "#e8492a",
        weight: 2,
        fillColor: "#e8492a",
        fillOpacity: 0.25,
      })
        .bindTooltip(s.label, { sticky: true })
        .addTo(setupLayer);
    } else if (s.type === "congestion") {
      (s.coords || []).forEach((seg) =>
        L.polyline(seg, {
          color: "#000",
          weight: 5,
          opacity: 0.95,
          dashArray: "8,6",
        })
          .bindTooltip(s.label, { sticky: true })
          .addTo(setupLayer),
      );
    }
  });
}

function renderSetupList() {
  const c = $("setup-items");
  c.innerHTML = "";
  if (!setups.length) {
    c.innerHTML = '<div class="empty">No active setups.</div>';
    redrawSetups();
    return;
  }
  setups.forEach((s, idx) => {
    const d = document.createElement("div");
    d.className = "setup-item";
    d.innerHTML = `<span class="lbl">${s.label}</span><button class="del" data-i="${idx}">✕</button>`;
    d.querySelector("button").addEventListener("click", () => deleteSetup(idx));
    c.appendChild(d);
  });
  redrawSetups();
}

function applySetupsResponse(res) {
  setups = res.setups || [];
  renderSetupList();
}

function deleteSetup(idx) {
  fetch(`${API}/delete_setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ index: idx }),
  })
    .then((r) => r.json())
    .then((res) => {
      if (res.error) return setStatus("❌ " + res.error);
      applySetupsResponse(res);
      setStatus("✅ Setup removed.");
    })
    .catch((e) => setStatus("❌ " + e));
}

$("btnResetSetups").addEventListener("click", () => {
  if (!setups.length) return setStatus("Nothing to reset.");
  fetch(`${API}/reset_setup`, { method: "POST" })
    .then((r) => r.json())
    .then((res) => {
      applySetupsResponse(res);
      setStatus("✅ All setups cleared.");
    })
    .catch((e) => setStatus("❌ " + e));
});

/* ───── Station search ───── */
$("stationSearch").addEventListener("input", function () {
  const q = this.value.trim().toLowerCase();
  const dd = $("searchDropdown");
  dd.innerHTML = "";
  if (q.length < 1) {
    dd.style.display = "none";
    return;
  }
  const matches = stations.filter((s) => s.name.toLowerCase().includes(q)).slice(0, 12);
  if (!matches.length) {
    dd.style.display = "none";
    return;
  }
  matches.forEach((s) => {
    const d = document.createElement("div");
    d.className = "sdi";
    d.innerHTML = `${s.name}<div class="sdi-sub">${s.lat.toFixed(4)}, ${s.lon.toFixed(4)}</div>`;
    d.addEventListener("click", () => {
      map.setView([s.lat, s.lon], 14);
      $("stationSearch").value = "";
      dd.style.display = "none";
      placeNext(s.lat, s.lon, s.name);
    });
    dd.appendChild(d);
  });
  dd.style.display = "block";
});

document.addEventListener("click", (e) => {
  if (!$("stationSearch").contains(e.target) && !$("searchDropdown").contains(e.target)) {
    $("searchDropdown").style.display = "none";
  }
});

/* ───── Click flow: 2 points → run ───── */
function placeNext(lat, lng, name) {
  if (clickCoords.length >= 2) {
    clickCoords = [];
    clearResult();
  }
  // Keep the pin exactly where the user clicked; backend snaps to nearest station internally.
  clickCoords.push([lat, lng]);
  const setup = currentMode === "SetupMap";
  if (clickCoords.length === 1) {
    const color = setup ? "#f5a623" : "#4caf7d";
    const label = setup ? "①" : "🟢";
    startMarker = L.marker([lat, lng], { icon: pinIcon(color, label) })
      .addTo(resultLayer)
      .bindPopup(`<b>${setup ? "Station A" : "Start"}${name ? ": " + name : ""}</b>`)
      .openPopup();
    setStatus(setup ? "Station A picked — click station B" : "Start set — click end point");
  } else {
    const label = setup ? "②" : "🔴";
    endMarker = L.marker([lat, lng], { icon: pinIcon("#e8492a", label) })
      .addTo(resultLayer)
      .bindPopup(`<b>${setup ? "Station B" : "End"}${name ? ": " + name : ""}</b>`)
      .openPopup();
    if (!setup) runPathfind();
    else setStatus("Two points selected — click Apply to set ban/flood");
  }
}

map.on("click", (e) => {
  const { lat, lng } = e.latlng;
  if (currentMode === "SetupMap") {
    if (setupMode === "road" || setupMode === "congestion") {
      addRoadOrCongestionClick(lat, lng);
    } else if (setupMode === "area") {
      addAreaPoint(lat, lng);
    } else {
      setStatus("Enable a setup action first (Road, Area, or Congestion).");
    }
    return;
  }
  placeNext(lat, lng);
});
map.on(
  "mousemove",
  (e) =>
    ($("coord-display").textContent =
      e.latlng.lat.toFixed(5) + ", " + e.latlng.lng.toFixed(5)),
);

/* ───── Mode + admin toggle ───── */
function refreshMode() {
  const setup = currentMode === "SetupMap";
  $("findpath-section").style.display = setup ? "none" : "block";
  $("setup-section").style.display = setup ? "block" : "none";
  $("mode-badge").className = setup ? "setup" : "find";
  $("mode-badge").textContent = setup ? "SETUP MODE" : "FIND PATH";
  $("hint-text").textContent = setup
    ? "Pick an action below, click on the map, then submit"
    : "Click map twice: start → end";
  clickCoords = [];
  clearResult();
  setSetupMode(null);
  setStatus(
    setup
      ? "Setup mode — enable Road, Area, or Congestion"
      : "Find path mode — click start point",
  );
}

$("actionSelect").addEventListener("change", function () {
  if (!isAdmin && this.value === "SetupMap") {
    setStatus("⚠ Switch to Admin role first.");
    this.value = "FindPath";
    return;
  }
  currentMode = this.value;
  refreshMode();
});

$("roleToggle").addEventListener("change", function () {
  isAdmin = this.checked;
  $("roleLabel").textContent = isAdmin ? "ADMIN" : "GUEST";
  $("mode-row").style.display = isAdmin ? "block" : "none";
  if (!isAdmin) {
    $("actionSelect").value = "FindPath";
    currentMode = "FindPath";
    refreshMode();
  }
});
// Default: hide mode select for guests
$("mode-row").style.display = "none";

/* ───── Layer toggles ───── */
$("toggleStations").addEventListener("click", () =>
  map.hasLayer(stationLayer) ? map.removeLayer(stationLayer) : map.addLayer(stationLayer),
);
$("togglePaths").addEventListener("click", () =>
  map.hasLayer(railwayLayer) ? map.removeLayer(railwayLayer) : map.addLayer(railwayLayer),
);

// Re-run pathfinding immediately when the user picks a different algorithm
// (only when both start & end are already set, otherwise nothing to draw yet).
$("algorithmSelect").addEventListener("change", () => {
  if (clickCoords.length >= 2) runPathfind();
});

/* ───── Find path ───── */
function runPathfind() {
  if (clickCoords.length < 2) return;
  const algorithm = $("algorithmSelect").value;
  setStatus("🔍 Running " + algorithm + "…");
  hideToast();
  // Wipe any prior single-path / compare overlay so the new run isn't drawn on top.
  pathLayer.clearLayers();
  $("compare-panel").style.display = "none";
  fetch(`${API}/find_path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start: clickCoords[0],
      end: clickCoords[1],
      algorithm,
    }),
  })
    .then((r) =>
      r.ok
        ? r.json()
        : r
            .json()
            .catch(() => ({}))
            .then((d) => Promise.reject(d.error || `HTTP ${r.status}`)),
    )
    .then((res) => {
      if (!res || !res.path_coords || res.path_coords.length < 2) {
        return Promise.reject(res && res.error ? res.error : "No path found between the selected points.");
      }
      const style = algoStyle(res.algorithm);

      // 1) Dashed connector lines from click → nearest station
      if (res.start_path) {
        L.polyline(res.start_path, {
          color: "#4caf7d",
          weight: 2.5,
          opacity: 0.9,
          dashArray: "5,6",
        }).addTo(pathLayer);
      }
      if (res.end_path) {
        L.polyline(res.end_path, {
          color: "#e8492a",
          weight: 2.5,
          opacity: 0.9,
          dashArray: "5,6",
        }).addTo(pathLayer);
      }

      // 2) Small markers on the snapped start/end stations
      if (res.start_station) {
        L.circleMarker(res.start_station, {
          radius: 5, color: "#fff", weight: 2,
          fillColor: "#4caf7d", fillOpacity: 1,
        })
          .addTo(pathLayer)
          .bindTooltip("Start station");
      }
      if (res.end_station) {
        L.circleMarker(res.end_station, {
          radius: 5, color: "#fff", weight: 2,
          fillColor: "#e8492a", fillOpacity: 1,
        })
          .addTo(pathLayer)
          .bindTooltip("End station");
      }

      // 3) Halo + colored core for the chosen path (color matches current algo)
      const pathCoords = res.path_coords || [];
      if (pathCoords.length >= 2) {
        L.polyline(pathCoords, {
          color: "#000",
          weight: style.weight + 5,
          opacity: 0.35,
        }).addTo(pathLayer);
        L.polyline(pathCoords, {
          color: style.color,
          weight: style.weight,
          opacity: 1,
          dashArray: style.dashArray,
          lineCap: "round",
          lineJoin: "round",
        }).addTo(pathLayer);
      }

      // 4) Small dots on intermediate stations along the path
      pathCoords.forEach((c, i) => {
        if (i === 0 || i === pathCoords.length - 1) return;
        L.circleMarker(c, {
          radius: 3.5,
          color: style.color,
          fillColor: "#fff",
          fillOpacity: 1,
          weight: 1.5,
        }).addTo(pathLayer);
      });

      if (pathCoords.length) {
        map.fitBounds(L.polyline(pathCoords).getBounds(), { padding: [60, 60] });
      }
      $("s-algo").textContent = res.algorithm;
      $("s-dist").textContent = res.cost_km + " km";
      $("s-time-est").textContent = res.travel_min + " min";
      $("s-nodes").textContent = res.nodes_in_path;
      $("s-expanded").textContent = res.nodes_expanded;
      $("s-time").textContent = res.elapsed_ms + " ms";
      $("stats").style.display = "block";

      const wp = $("waypoints-list");
      wp.innerHTML = "";
      (res.waypoints || []).forEach((w) => {
        const d = document.createElement("div");
        d.className = "wp";
        d.innerHTML = `<div class="wp-dot"></div>${w.name}`;
        wp.appendChild(d);
      });
      $("waypoints-section").style.display = res.waypoints && res.waypoints.length ? "block" : "none";

      setStatus(`✅ ${res.cost_km} km / ~${res.travel_min} min via ${res.algorithm}`);
    })
    .catch((e) => {
      const msg = typeof e === "string" ? e : (e && e.message) || "Unknown error";
      // Drop any half-drawn path / stats, but keep the start & end pins so the
      // user can see where they were trying to go.
      $("stats").style.display = "none";
      setStatus("❌ " + msg);
      const friendly = /no path|không/i.test(msg)
        ? `Không tìm được đường đi giữa 2 điểm đã chọn.\n${msg}\n→ Thử bỏ bớt vùng cấm / cạnh đã chặn, hoặc chọn điểm khác.`
        : msg;
      showToast(friendly, "error", 8000);
    });
}

/* ───── Compare ───── */
$("btnCompare").addEventListener("click", () => {
  if (clickCoords.length < 2) return setStatus("⚠ Pick start and end first.");
  setStatus("📊 Comparing algorithms…");
  hideToast();
  // Drop the single-algo path; compare draws its own overlay.
  pathLayer.clearLayers();
  $("stats").style.display = "none";
  fetch(`${API}/compare_path`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start: clickCoords[0], end: clickCoords[1] }),
  })
    .then((r) =>
      r.ok
        ? r.json()
        : r.json().catch(() => ({})).then((d) => Promise.reject(d.error || `HTTP ${r.status}`)),
    )
    .then((results) => {
      const best = results.reduce(
        (b, r) => (!r.error && (!b || r.cost_km < b.cost_km) ? r : b),
        null,
      );

      // Draw every successful path on the map, thickest first so thinner ones lie on top.
      const drawable = results.filter((r) => !r.error && r.path_coords && r.path_coords.length >= 2);
      drawable
        .slice()
        .sort((a, b) => algoStyle(b.algorithm).weight - algoStyle(a.algorithm).weight)
        .forEach((r) => {
          const s = algoStyle(r.algorithm);
          L.polyline(r.path_coords, {
            color: s.color,
            weight: s.weight,
            opacity: 0.9,
            dashArray: s.dashArray,
            lineCap: "round",
            lineJoin: "round",
          })
            .bindTooltip(
              `<b>${r.algorithm}</b><br>${r.cost_km} km · ~${r.travel_min} min · ${r.nodes_expanded} expanded`,
              { sticky: true },
            )
            .addTo(pathLayer);
        });
      if (drawable.length) {
        const allCoords = drawable.flatMap((r) => r.path_coords);
        map.fitBounds(L.polyline(allCoords).getBounds(), { padding: [60, 60] });
      }

      $("compare-table").innerHTML =
        `<table><thead><tr>
          <th>Algorithm</th><th style="text-align:right">Dist</th>
          <th style="text-align:right">Time</th><th style="text-align:right">Expanded</th>
          <th style="text-align:right">ms</th></tr></thead><tbody>` +
        results
          .map((r) => {
            const s = algoStyle(r.algorithm);
            const swatch = `<span class="algo-swatch" style="background:${s.color}"></span>`;
            if (r.error)
              return `<tr><td>${swatch}${r.algorithm}</td><td colspan="4" class="err" style="text-align:center">${r.error}</td></tr>`;
            const cls = best && r.algorithm === best.algorithm ? ' class="best"' : "";
            const star = best && r.algorithm === best.algorithm ? " ⭐" : "";
            return `<tr${cls}>
              <td>${swatch}${r.algorithm}${star}</td>
              <td style="text-align:right">${r.cost_km} km</td>
              <td style="text-align:right">${r.travel_min} m</td>
              <td style="text-align:right">${r.nodes_expanded}</td>
              <td style="text-align:right">${r.elapsed_ms}</td></tr>`;
          })
          .join("") +
        "</tbody></table>";
      $("compare-panel").style.display = "block";
      setStatus(`📊 Comparison done — ${drawable.length}/${results.length} paths drawn.`);
    })
    .catch((e) => {
      const msg = typeof e === "string" ? e : (e && e.message) || "Unknown error";
      setStatus("❌ " + msg);
      showToast("So sánh thuật toán thất bại.\n" + msg, "error", 8000);
    });
});

$("btnCloseCompare").addEventListener("click", () => {
  $("compare-panel").style.display = "none";
  // Restore the single-algorithm path for the currently selected dropdown value.
  if (clickCoords.length >= 2) runPathfind();
});

/* ───── Setup sub-modes (Road / Area / Congestion) ───── */

function setSetupMode(mode) {
  setupMode = mode;
  clickCoords = [];
  clearResult();
  resetAreaPreview();

  const defaults = {
    btnToggleRoad: "Enable Closure",
    btnToggleArea: "Enable Area Mode",
    btnToggleCongestion: "Enable Congestion",
  };
  ["btnToggleRoad", "btnToggleArea", "btnToggleCongestion"].forEach((id) => {
    const btn = $(id);
    if (!btn) return;
    const active = btn.dataset.mode === mode;
    btn.classList.toggle("armed", active);
    btn.innerHTML = active
      ? '<span class="icon">●</span> ARMED — click to disable'
      : `<span class="icon">⚡</span> ${defaults[id]}`;
  });

  const banner = $("setup-active-banner");
  if (banner) {
    const labels = {
      road: "🚫 ROAD CLOSURE — click 2 points on map",
      area: "🛑 AREA CLOSURE — click points then Submit",
      congestion: "🚦 CONGESTION — click 2 points on map",
    };
    if (mode) {
      banner.classList.add("armed");
      banner.textContent = "● " + labels[mode];
    } else {
      banner.classList.remove("armed");
      banner.textContent = "● No setup active — pick one below";
    }
  }

  if (mode === "road") setStatus("Road Closure armed: click point A, then point B.");
  else if (mode === "area") setStatus("Area Closure armed: click points (≥3), then Submit.");
  else if (mode === "congestion") setStatus("Congestion armed: click point A, then point B.");
}

["btnToggleRoad", "btnToggleArea", "btnToggleCongestion"].forEach((id) => {
  $(id).addEventListener("click", function () {
    const m = this.dataset.mode;
    setSetupMode(setupMode === m ? null : m);
  });
});

function addRoadOrCongestionClick(lat, lng) {
  if (clickCoords.length >= 2) {
    clickCoords = [];
    clearResult();
  }
  clickCoords.push([lat, lng]);
  const isCongestion = setupMode === "congestion";
  if (clickCoords.length === 1) {
    L.marker([lat, lng], { icon: pinIcon("#4caf7d", "①") })
      .addTo(resultLayer)
      .bindPopup("<b>Point A</b>")
      .openPopup();
    setStatus(`${isCongestion ? "Congestion" : "Road Closure"}: click point B`);
  } else {
    L.marker([lat, lng], { icon: pinIcon("#e8492a", "②") })
      .addTo(resultLayer)
      .bindPopup("<b>Point B</b>")
      .openPopup();
    if (isCongestion) submitCongestion();
    else submitRoad();
  }
}

function submitRoad() {
  const direction = $("roadDirection").value || "both";
  setStatus("Applying road closure…");
  fetch(`${API}/setup_road`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start: clickCoords[0],
      end: clickCoords[1],
      direction,
    }),
  })
    .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || "error"))))
    .then((res) => {
      applySetupsResponse(res);
      clickCoords = [];
      clearResult();
      setStatus("✅ Road closure applied.");
    })
    .catch((e) => setStatus("❌ " + e));
}

function submitCongestion() {
  const factor = parseFloat($("congestionFactor").value);
  if (!(factor > 1)) {
    setStatus("⚠ Factor must be > 1");
    clickCoords = [];
    clearResult();
    return;
  }
  setStatus("Applying congestion…");
  fetch(`${API}/setup_congestion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      start: clickCoords[0],
      end: clickCoords[1],
      factor,
    }),
  })
    .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || "error"))))
    .then((res) => {
      applySetupsResponse(res);
      clickCoords = [];
      clearResult();
      setStatus(`✅ Congestion ×${factor} applied.`);
    })
    .catch((e) => setStatus("❌ " + e));
}

function resetAreaPreview() {
  areaPoints = [];
  areaPreviewLayer.clearLayers();
}

function redrawAreaPreview() {
  areaPreviewLayer.clearLayers();
  if (areaPoints.length === 0) return;
  areaPoints.forEach((p, i) => {
    L.circleMarker(p, {
      radius: 4,
      color: "#e8492a",
      fillColor: "#fff",
      fillOpacity: 1,
      weight: 2,
    })
      .bindTooltip(`#${i + 1}`)
      .addTo(areaPreviewLayer);
  });
  if (areaPoints.length >= 2) {
    L.polyline(areaPoints, {
      color: "#e8492a",
      weight: 2,
      dashArray: "5,5",
      opacity: 0.9,
    }).addTo(areaPreviewLayer);
  }
  if (areaPoints.length >= 3) {
    L.polygon(areaPoints, {
      color: "#e8492a",
      weight: 1,
      fillColor: "#e8492a",
      fillOpacity: 0.12,
      dashArray: "3,4",
    }).addTo(areaPreviewLayer);
  }
}

function addAreaPoint(lat, lng) {
  areaPoints.push([lat, lng]);
  redrawAreaPreview();
  setStatus(
    `Area Closure: ${areaPoints.length} point(s) placed. Click Submit when ready (≥3).`,
  );
}

$("btnSubmitArea").addEventListener("click", () => {
  if (setupMode !== "area") return setStatus("⚠ Enable Area Mode first.");
  if (areaPoints.length < 3) return setStatus("⚠ Need at least 3 points.");
  setStatus("Submitting area…");
  fetch(`${API}/setup_area`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ polygon: areaPoints }),
  })
    .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || "error"))))
    .then((res) => {
      applySetupsResponse(res);
      resetAreaPreview();
      setStatus("✅ Area closure applied.");
    })
    .catch((e) => setStatus("❌ " + e));
});

function restoreLast(type) {
  fetch(`${API}/restore_last_setup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
  })
    .then((r) => (r.ok ? r.json() : r.json().then((d) => Promise.reject(d.error || "error"))))
    .then((res) => {
      applySetupsResponse(res);
      setStatus(`✅ Last ${type} restored.`);
    })
    .catch((e) => setStatus("❌ " + e));
}

["btnRestoreRoad", "btnRestoreArea", "btnRestoreCongestion"].forEach((id) => {
  $(id).addEventListener("click", function () {
    restoreLast(this.dataset.type);
  });
});

$("btnClearSetup").addEventListener("click", () => {
  clickCoords = [];
  clearResult();
  resetAreaPreview();
  setSetupMode(null);
  setStatus("Cancelled. Pick a setup action to begin.");
});

// Esc cancels any in-progress setup
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && setupMode) {
    setSetupMode(null);
    setStatus("Cancelled (Esc).");
  }
});

/* ───── Stop map clicks on the UI ───── */
["panel", "stats", "mode-badge", "statusbar", "compare-panel"].forEach((id) => {
  const el = $(id);
  if (el) L.DomEvent.disableClickPropagation(el);
});

/* ───── Bootstrap ───── */
function buildStationIndex() {
  stationById = {};
  for (const s of stations) stationById[s.id] = s;
}

fetch(`${API}/state`)
  .then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  })
  .then((s) => {
    stations = s.stations || [];
    railwayEdges = s.railway || [];
    setups = s.setups || [];
    buildStationIndex();
    drawStations();
    drawRailway();
    renderSetupList();
    setStatus(`Loaded ${stations.length} stations. Click map twice: start → end.`);
  })
  .catch((e) => {
    const msg =
      "Cannot reach backend at " +
      API +
      ".\n\nMake sure app.py is running, and restart it after any backend change.\n\nDetails: " +
      e;
    setStatus("❌ " + msg);
    console.error(msg);
    alert(msg);
  });
