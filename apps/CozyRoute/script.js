const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";

let userData = {
  odorat: 0,
  marchabilite: 0,
  claustrophobie: 0,
  agoraphobie: 0,
  pollution: 0,
  bruit: 0,
  eclairage: 0,
  handicap: 0,
  trafic_routier: 0
};

let map = null;
let cozyRouteLayer = null;
let routeLayer = null;
let clickMarkers = [];
let cozyRouteData = null;

let radarChart = null;
const themes = [
  "odorat", "marchabilite", "claustrophobie", "agoraphobie", "pollution",
  "bruit", "eclairage", "handicap", "trafic_routier"
];

let lastSuggestions = [];

let gpsModeActive = false;
let gpsWatchId = null;
let gpsMarker = null;
let dashedLineStart = null;
let dashedLineEnd = null;

window.addEventListener("load", () => {
  initMap();
  initDirectionsPanel();
  initRadarChart();
  initUIButtons();
  initSearchInputEvents();
  const modeGpsBtn = document.getElementById("mode-gps");
  if (modeGpsBtn) {
    modeGpsBtn.addEventListener("click", toggleGpsMode);
  }
});

function initMap() {
  map = L.map("map").setView([49.0389, 2.0760], 13);
  fetch("cozyroute.geojson")
    .then(resp => {
      if (!resp.ok) throw new Error("Erreur geojson");
      return resp.json();
    })
    .then(data => {
      cozyRouteData = data;
      cozyRouteLayer = L.geoJSON(data, {
        style: feature => {
          const c = feature.properties.class || "";
          const finalClass = (c + " intensity-0").trim();
          return {
            color: "#FFFFFF",
            weight: 3,
            className: finalClass
          };
        }
      }).addTo(map);
      map.fitBounds(cozyRouteLayer.getBounds());
    })
    .catch(err => console.error(err));
  map.on("click", e => {
    handleMapClick(e.latlng);
  });
}

function initUIButtons() {
  const gotoMapBtn = document.getElementById("goto-map");
  if (gotoMapBtn) {
    gotoMapBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.add("hidden");
    });
  }
  const burgerBtn = document.getElementById("burger-menu");
  if (burgerBtn) {
    burgerBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.toggle("hidden");
    });
  }
  const searchBtn = document.getElementById("search-button");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const address = document.getElementById("search-input").value.trim();
      if (!address) {
        alert("Veuillez saisir une adresse.");
        return;
      }
      handleEnterPress();
    });
  }
}

function initSearchInputEvents() {
  const input = document.getElementById("search-input");
  if (!input) return;
  input.addEventListener("input", (e) => {
    onAddressInput(e.target.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEnterPress();
    }
  });
}

function handleEnterPress() {
  if (lastSuggestions.length > 0) {
    const first = lastSuggestions[0];
    handleMapClick({ lat: first.coord[0], lng: first.coord[1] });
    displaySuggestions([]);
    document.getElementById("search-input").blur();
  }
}

function onAddressInput(val) {
  if (val.length < 4) {
    displaySuggestions([]);
    return;
  }
  geocodeORS(val)
    .then(sugs => {
      lastSuggestions = sugs.slice(0, 3);
      displaySuggestions(lastSuggestions);
    })
    .catch(err => {
      lastSuggestions = [];
      displaySuggestions([]);
    });
}

function geocodeORS(query) {
  const url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${ORS_API_KEY}&text=${encodeURIComponent(query)}`;
  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error("Erreur");
      return r.json();
    })
    .then(data => {
      if (!data || !data.features) return [];
      return data.features.map(f => ({
        label: f.properties.label,
        coord: [f.geometry.coordinates[1], f.geometry.coordinates[0]]
      }));
    });
}

function displaySuggestions(list) {
  const container = document.getElementById("autocomplete-results");
  if (!container) return;
  container.innerHTML = "";
  list.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item.label;
    li.style.cursor = "pointer";
    li.addEventListener("click", () => {
      handleMapClick({ lat: item.coord[0], lng: item.coord[1] });
      container.innerHTML = "";
      document.getElementById("search-input").blur();
    });
    container.appendChild(li);
  });
}

function toggleGpsMode() {
  gpsModeActive = !gpsModeActive;
  const btn = document.getElementById("mode-gps");
  if (gpsModeActive) {
    btn.classList.add("active");
    if (!gpsWatchId) {
      gpsWatchId = navigator.geolocation.watchPosition(updateGpsPosition, errorGps, { enableHighAccuracy: true });
    }
  } else {
    btn.classList.remove("active");
    if (gpsWatchId) {
      navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = null;
    }
  }
}

function updateGpsPosition(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  if (!gpsMarker) {
    gpsMarker = L.marker([lat, lng]).addTo(map);
    if (clickMarkers.length === 0) {
      clickMarkers.push(gpsMarker);
    }
  } else {
    gpsMarker.setLatLng([lat, lng]);
  }
  if (routeLayer && dashedLineStart) {
    const routeCoords = getRouteCoordinates();
    if (routeCoords && routeCoords.length > 0) {
      dashedLineStart.setLatLngs([gpsMarker.getLatLng(), routeCoords[0]]);
    }
  }
}

function errorGps(err) {
  console.error(err);
}

function handleMapClick(latlng) {
  if (clickMarkers.length === 2) {
    clearRouteAndMarkers();
  }
  if (!(gpsModeActive && gpsMarker && clickMarkers.length === 0)) {
    const mk = L.marker([latlng.lat, latlng.lng]).addTo(map);
    clickMarkers.push(mk);
  }
  if (clickMarkers.length === 2) {
    const A = clickMarkers[0].getLatLng();
    const B = clickMarkers[1].getLatLng();
    getRoute(A.lat, A.lng, B.lat, B.lng);
  }
}

function clearRouteAndMarkers() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  clickMarkers.forEach(m => map.removeLayer(m));
  clickMarkers = [];
  if (gpsMarker) {
    map.removeLayer(gpsMarker);
    gpsMarker = null;
  }
  if (dashedLineStart) {
    map.removeLayer(dashedLineStart);
    dashedLineStart = null;
  }
  if (dashedLineEnd) {
    map.removeLayer(dashedLineEnd);
    dashedLineEnd = null;
  }
}

function getAvoidPolygons(threshold = 0) {
  let polygons = [];
  if (!cozyRouteData || !cozyRouteData.features) return null;
  cozyRouteData.features.forEach(feature => {
    let cls = feature.properties.class;
    let match = cls.match(/^([a-z_]+)-(\d+)$/);
    if (match) {
      let theme = match[1];
      let intensity = parseInt(match[2], 10);
      if (userData[theme] > 0 && intensity >= threshold) {
        if (feature.geometry.type === "MultiPolygon") {
          polygons.push(...feature.geometry.coordinates);
        } else if (feature.geometry.type === "Polygon") {
          polygons.push(feature.geometry.coordinates);
        }
      }
    }
  });
  if (polygons.length === 0) return null;
  return {
    type: "MultiPolygon",
    coordinates: polygons
  };
}

function showLoading() {
  const splash = document.getElementById("loading-splash");
  if (splash) splash.classList.remove("hidden");
}

function hideLoading() {
  const splash = document.getElementById("loading-splash");
  if (splash) splash.classList.add("hidden");
}

function getRoute(lat1, lng1, lat2, lng2, threshold = 0) {
  showLoading();
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  const bodyData = {
    coordinates: [[lng1, lat1], [lng2, lat2]],
    language: "fr",
    instructions: true
  };
  const avoid = getAvoidPolygons(threshold);
  if (avoid) {
    bodyData.options = { avoid_polygons: avoid };
  }
  fetch("https://api.openrouteservice.org/v2/directions/foot-walking", {
    method: "POST",
    headers: {
      "accept": "*/*",
      "authorization": ORS_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify(bodyData)
  })
  .then(r => {
    if (!r.ok) throw new Error("Erreur routing");
    return r.json();
  })
  .then(data => {
    if (!data || !data.routes || data.routes.length === 0) {
      throw new Error("Aucun itinéraire");
    }
    const route = data.routes[0];
    const dec = decodePolyline(route.geometry);
    const routeGeo = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: dec.map(([la, ln]) => [ln, la])
      },
      properties: {}
    };
    routeLayer = L.geoJSON(routeGeo, { style: { color: "#1976D2", weight: 4 } }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
    const routeCoords = getRouteCoordinates();
    updateDashedLines(routeCoords);
    hideLoading();
    showDirectionsPanel(route);
  })
  .catch(err => {
    hideLoading();
    if (threshold < 5) {
      let newThreshold = threshold === 0 ? 2 : threshold + 1;
      let eliminated = [];
      for (let i = 1; i < newThreshold; i++) {
        eliminated.push(i);
      }
      alert(`Pas de chemin trouvé, élimination des gênes de niveau ${eliminated.join(" et ")}...`);
      getRoute(lat1, lng1, lat2, lng2, newThreshold);
    } else {
      alert("Pas de chemin trouvé même en éliminant toutes les gênes de niveau inférieurs à 5.");
    }
  });
}

function getRouteCoordinates() {
  if (!routeLayer) return null;
  const geojson = routeLayer.toGeoJSON();
  if (!geojson || !geojson.geometry || !geojson.geometry.coordinates) return null;
  return geojson.geometry.coordinates.map(coord => L.latLng(coord[1], coord[0]));
}

function updateDashedLines(routeCoords) {
  if (dashedLineStart) {
    map.removeLayer(dashedLineStart);
    dashedLineStart = null;
  }
  if (dashedLineEnd) {
    map.removeLayer(dashedLineEnd);
    dashedLineEnd = null;
  }
  if (clickMarkers.length >= 1 && routeCoords && routeCoords.length > 0) {
    dashedLineStart = L.polyline([clickMarkers[0].getLatLng(), routeCoords[0]], { color: "#1976D2", dashArray: "5, 5" }).addTo(map);
  }
  if (clickMarkers.length >= 2 && routeCoords && routeCoords.length > 0) {
    dashedLineEnd = L.polyline([routeCoords[routeCoords.length - 1], clickMarkers[1].getLatLng()], { color: "#1976D2", dashArray: "5, 5" }).addTo(map);
  }
}

function decodePolyline(encoded) {
  let currentPosition = 0, currentLat = 0, currentLng = 0;
  const coords = [];
  while (currentPosition < encoded.length) {
    let shift = 0, result = 0, byte = null;
    do {
      byte = encoded.charCodeAt(currentPosition++) - 63;
      result |= (byte & 0x1F) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    currentLat += deltaLat;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(currentPosition++) - 63;
      result |= (byte & 0x1F) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    currentLng += deltaLng;
    coords.push([currentLat / 1e5, currentLng / 1e5]);
  }
  return coords;
}

function showDirectionsPanel(route) {
  const panel = document.getElementById("directions-panel");
  panel.classList.remove("hidden");
  const dist = (route.summary.distance / 1000).toFixed(2);
  const dur = (route.summary.duration / 60).toFixed(0);
  document.getElementById("directions-summary").textContent =
    `Distance : ${dist} km | Durée : ~${dur} min`;
  const stepsUl = document.getElementById("directions-steps");
  stepsUl.innerHTML = "";
  if (route.segments && route.segments.length > 0) {
    route.segments.forEach(seg => {
      seg.steps.forEach(step => {
        const li = document.createElement("li");
        const stDist = (step.distance || 0).toFixed(0);
        const instr = step.instruction || "";
        const name = (step.name && step.name !== "-") ? `(${step.name})` : "";
        li.textContent = `${stDist} m - ${instr} ${name}`;
        stepsUl.appendChild(li);
      });
    });
  }
}

function initDirectionsPanel() {
  const closeBtn = document.getElementById("close-directions");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("directions-panel").classList.add("hidden");
    });
  }
}

function initRadarChart() {
  const ctx = document.getElementById("radarChart");
  if (!ctx) return;
  function getCssVar(varName) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim();
  }
  function addHexAlpha(hex, alpha = "90") {
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      return hex + alpha;
    }
    return hex;
  }
  const pointColors = themes.map(theme => {
    const baseColor = getCssVar(`--${theme}-color`);
    return addHexAlpha(baseColor, "FF");
  });
  function createConicGradient(context) {
    const chart = context.chart;
    const scale = chart.scales.r || chart.scales.radialLinear;
    if (
      !scale ||
      !Number.isFinite(scale.xCenter) ||
      !Number.isFinite(scale.yCenter) ||
      typeof chart.ctx.createConicGradient !== "function"
    ) {
      return "#673AB790";
    }
    const { xCenter, yCenter } = scale;
    const gradient = chart.ctx.createConicGradient(-Math.PI / 2, xCenter, yCenter);
    const colorVars = [
      "--odorat-color",
      "--marchabilite-color",
      "--claustrophobie-color",
      "--agoraphobie-color",
      "--pollution-color",
      "--bruit-color",
      "--eclairage-color",
      "--handicap-color",
      "--trafic_routier-color"
    ];
    colorVars.forEach((varName, i) => {
      const base = getCssVar(varName);
      const withAlpha = addHexAlpha(base, "90");
      gradient.addColorStop(i / colorVars.length, withAlpha);
    });
    const firstColor = getCssVar(colorVars[0]);
    gradient.addColorStop(1, addHexAlpha(firstColor, "90"));
    return gradient;
  }
  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: themes.map(t => t.charAt(0).toUpperCase() + t.slice(1)),
      datasets: [
        {
          label: "Mon profil",
          data: themes.map(t => userData[t]),
          fill: true,
          backgroundColor: createConicGradient,
          borderColor: "#666",
          borderWidth: 1,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        r: {
          min: 0,
          max: 5
        }
      }
    }
  });
}

function updateRadarChart() {
  if (!radarChart) return;
  radarChart.data.datasets[0].data = themes.map(t => userData[t]);
  radarChart.update();
}

function updateQuestionValue(theme, value) {
  userData[theme] = parseInt(value, 10);
  document.getElementById(theme + "-value").textContent = value;
  updateRadarChart();
  updateRoadStyle();
}

function updateRoadStyle() {
  if (!cozyRouteLayer) return;
  for (const theme of themes) {
    const userVal = userData[theme];
    cozyRouteLayer.eachLayer(layer => {
      const oldClass = layer.options.className || "";
      if (oldClass.includes(theme + "-")) {
        const newClass = oldClass.replace(/intensity-\d+/, `intensity-${userVal}`);
        layer.setStyle({ color: "#FFFFFF", weight: 3 });
        if (layer._path) {
          layer._path.setAttribute("class", newClass + " leaflet-interactive");
        }
        layer.options.className = newClass;
      }
    });
  }
}

function askUserLocation() {
  if (!navigator.geolocation) {
    alert("Pas support geo");
    return;
  }
  navigator.geolocation.getCurrentPosition(pos => {
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    handleMapClick({ lat, lng });
  }, err => {
    console.warn(err);
  }, { enableHighAccuracy: true });
}
