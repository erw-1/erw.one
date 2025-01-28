/*************************************************
 * script.js
 * ---------------------------------------------
 *  - Charge cozyroute.geojson (feature.properties.class = "handicap-3")
 *  - Au chargement, ajoute "intensity-0" => "handicap-3 intensity-0"
 *  - Sur changement de slider, on remplace "intensity-X"
 *    par "intensity-newValue" dans la classe HTML du <path>
 *    via layer._path.setAttribute(...)
 *  - Inclut le routage, la géolocalisation et le radar chart
 *    si tu en as besoin.
 *************************************************/

/***********************************************
 * 0) Variables globales / Config
 ***********************************************/

const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d"; // routing

// userData : note utilisateur sur chaque thème (0 à 5)
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

// La carte Leaflet
let map = null;
let cozyRouteLayer = null;   // Couche GEOJSON
let routeLayer = null;       // Couche itinéraire (facultatif)
let clickMarkers = [];       // Marqueurs posés par clic (pour le routing)

// Radar Chart (si besoin)
let radarChart = null;

// Liste des thèmes
const themes = [
  "odorat",
  "marchabilite",
  "claustrophobie",
  "agoraphobie",
  "pollution",
  "bruit",
  "eclairage",
  "handicap",
  "trafic_routier"
];

/***********************************************
 * 1) Initialisation de la page
 ***********************************************/
window.addEventListener("load", () => {
  console.log("[INIT] Démarrage CozyRoute");
  initMap();
  initDirectionsPanel();
  initRadarChart();
  initUIButtons();
});

/***********************************************
 * 2) initMap : crée la carte, charge le GeoJSON
 ***********************************************/
function initMap() {
  // Crée la carte Leaflet
  map = L.map("map", {
    zoomControl: true,
    attributionControl: false
  }).setView([49.0389, 2.0760], 13);

  console.log("[MAP] Carte initialisée");

  // Charge le GeoJSON
  fetch("cozyroute.geojson")
    .then((resp) => {
      if (!resp.ok) throw new Error("Erreur réseau sur cozyroute.geojson");
      return resp.json();
    })
    .then((data) => {
      console.log(`[GEOJSON] Features: ${data.features.length}`);
      cozyRouteLayer = L.geoJSON(data, {
        style: (feature) => {
          // ex: feature.properties.class = "handicap-3"
          const geojsonClass = feature.properties.class || "";
          // Ajoute intensity-0 => "handicap-3 intensity-0"
          const finalClass = (geojsonClass + " intensity-0").trim();
          console.log("Tronçon créé:", finalClass);

          return {
            color: "#FFFFFF",
            weight: 3,
            className: finalClass
          };
        }
      }).addTo(map);

      // Ajuste la vue
      map.fitBounds(cozyRouteLayer.getBounds());
      console.log("[MAP] Vue ajustée sur cozyRouteLayer");
    })
    .catch((err) => {
      console.error("[GEOJSON] Erreur:", err);
    });

  // Optionnel : écoute le clic sur la carte pour routing
  map.on("click", (e) => {
    handleMapClick(e.latlng);
  });
}

/***********************************************
 * 3) UI Buttons : burger, goto-map, etc.
 ***********************************************/
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
      console.log("[SEARCH] address:", address);
      // ex: geocodeAddress(address);
    });
  }
}

/***********************************************
 * 4) handleMapClick: pose 2 marqueurs => getRoute
 ***********************************************/
function handleMapClick(latlng) {
  // Si on a déjà 2 marqueurs, on reset
  if (clickMarkers.length === 2) {
    clearRouteAndMarkers();
  }

  const marker = L.marker([latlng.lat, latlng.lng]).addTo(map);
  clickMarkers.push(marker);

  if (clickMarkers.length === 2) {
    const latlngA = clickMarkers[0].getLatLng();
    const latlngB = clickMarkers[1].getLatLng();
    getRoute(latlngA.lat, latlngA.lng, latlngB.lat, latlngB.lng);
  }
}

function clearRouteAndMarkers() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  clickMarkers.forEach(m => map.removeLayer(m));
  clickMarkers = [];
}

/***********************************************
 * 5) getRoute (OpenRouteService) : facultatif
 ***********************************************/
function getRoute(lat1, lng1, lat2, lng2) {
  const routeUrl = "https://api.openrouteservice.org/v2/directions/foot-walking";
  const bodyData = {
    coordinates: [
      [lng1, lat1],
      [lng2, lat2]
    ]
  };

  fetch(routeUrl, {
    method: "POST",
    headers: {
      "accept": "*/*",
      "authorization": ORS_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify(bodyData)
  })
  .then(resp => {
    if (!resp.ok) throw new Error("Erreur ORS");
    return resp.json();
  })
  .then(data => {
    if (!data || !data.routes || data.routes.length===0) {
      throw new Error("Aucun itinéraire trouvé");
    }
    const route = data.routes[0];
    console.log("[ROUTE] Distance=", route.summary.distance);

    const decoded = decodePolyline(route.geometry);
    const routeGeo = {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: decoded.map(([la, ln]) => [ln, la])
      },
      properties: {}
    };

    if (routeLayer) {
      map.removeLayer(routeLayer);
    }

    routeLayer = L.geoJSON(routeGeo, {
      style: {
        color: "#1976D2",
        weight: 4
      }
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds(), { padding:[20,20] });
    showDirectionsPanel(route);
  })
  .catch(err => {
    console.error("[ROUTE] Erreur:", err);
    alert(err.message);
  });
}

/***********************************************
 * decodePolyline : si tu as besoin de ORS
 ***********************************************/
function decodePolyline(encoded) {
  let currentPosition = 0;
  let currentLat = 0;
  let currentLng = 0;
  const coords = [];

  while (currentPosition < encoded.length) {
    let shift=0, result=0, byte=null;
    // lat
    do {
      byte = encoded.charCodeAt(currentPosition++) - 63;
      result |= (byte & 0x1F) << shift;
      shift += 5;
    } while (byte>=0x20);

    const deltaLat = (result & 1) ? ~(result>>1) : (result>>1);
    currentLat += deltaLat;

    // lng
    shift=0; result=0;
    do {
      byte = encoded.charCodeAt(currentPosition++) - 63;
      result |= (byte & 0x1F) << shift;
      shift += 5;
    } while (byte>=0x20);

    const deltaLng = (result & 1) ? ~(result >>1) : (result>>1);
    currentLng += deltaLng;

    coords.push([currentLat/1e5, currentLng/1e5]);
  }
  return coords;
}

/***********************************************
 * showDirectionsPanel : affiche distance + étapes
 ***********************************************/
function showDirectionsPanel(route) {
  const panel = document.getElementById("directions-panel");
  panel.classList.remove("hidden");

  const distKm = (route.summary.distance/1000).toFixed(2);
  const durMin = (route.summary.duration/60).toFixed(0);
  document.getElementById("directions-summary").textContent =
    `Distance : ${distKm} km | Durée : ~${durMin} min`;

  const ul = document.getElementById("directions-steps");
  ul.innerHTML = "";

  if (route.segments && route.segments.length>0) {
    route.segments.forEach(seg => {
      seg.steps.forEach(step => {
        const li = document.createElement("li");
        const stepDist = (step.distance||0).toFixed(0);
        const instr = step.instruction||"";
        const name = (step.name && step.name!=="-") ? `(${step.name})` :"";
        li.textContent = `${stepDist} m - ${instr} ${name}`;
        ul.appendChild(li);
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

/***********************************************
 * 6) Radar Chart (optionnel)
 ***********************************************/
function initRadarChart() {
  const ctx = document.getElementById("radarChart");
  if (!ctx) return;  // si pas de canvas radarChart
  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: themes.map(t => t.charAt(0).toUpperCase()+t.slice(1)),
      datasets: [{
        label: "Mon niveau de gêne",
        data: themes.map(t => userData[t]),
        backgroundColor: "rgba(103,58,183,0.2)",
        borderColor: "rgba(103,58,183,1)",
        borderWidth: 2
      }]
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
  console.log("[RADAR] Radar Chart initialisé");
}

function updateRadarChart() {
  if (!radarChart) return;
  radarChart.data.datasets[0].data = themes.map(t => userData[t]);
  radarChart.update();
}

/***********************************************
 * 7) Questionnaire => updateQuestionValue
 ***********************************************/
function updateQuestionValue(theme, value) {
  console.log(`[SLIDER] ${theme} => ${value}`);
  userData[theme] = parseInt(value, 10);
  // Màj le <span id="xxx-value">
  document.getElementById(theme + "-value").textContent = value;

  // Radar Chart ?
  updateRadarChart();

  // Màj du style
  updateRoadStyle();
}

/***********************************************
 * 8) updateRoadStyle : 
 *    On force l'attribut class du <path> 
 *    en remplacant "intensity-X" par "intensity-userVal"
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) {
    console.warn("[STYLE] cozyRouteLayer non dispo");
    return;
  }
  console.log("[STYLE] Mise à jour intensité");

  // Pour chaque thème
  for (const theme of themes) {
    const userVal = userData[theme];
    console.log(`  [STYLE] theme=${theme} / userVal=${userVal}`);

    // On parcourt chaque tronçon
    cozyRouteLayer.eachLayer(layer => {
      // classe initiale : ex: "handicap-3 intensity-0"
      const oldClass = layer.options.className || "";
      
      // On vérifie si ce path concerne le "theme-"
      if (oldClass.includes(theme + "-")) {
        console.log(`    Tronçon avant: "${oldClass}"`);
        // On remplace "intensity-\d+" => "intensity-userVal"
        let newClass = oldClass.replace(/intensity-\d+/, `intensity-${userVal}`);

        // 1) On met setStyle pour garder la couleur #FFF, etc.
        layer.setStyle({
          color: "#FFFFFF",
          weight: 3
          // NE PAS mettre className ici => Leaflet ne le re-applique pas
        });

        // 2) On force la classe HTML du <path>
        if (layer._path) {
          layer._path.setAttribute("class", newClass + " leaflet-interactive");
        }

        // 3) On met à jour layer.options.className si besoin
        layer.options.className = newClass;

        console.log(`    Tronçon après: "${newClass}"`);
      }
    });
  }
}

/***********************************************
 * 9) Optionnel : Géolocalisation
 ***********************************************/
function askUserLocation() {
  if (!navigator.geolocation) {
    alert("Géoloc non supportée");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      L.marker([lat, lng]).addTo(map);
      map.setView([lat,lng], 14);
      console.log("[GEOLOC] Position OK");
    },
    err => {
      console.warn("[GEOLOC] Erreur:", err);
    },
    { enableHighAccuracy:true }
  );
}
