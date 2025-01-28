/***********************************************
 * script.js
 * ---------------------------------------------
 * Ce fichier gère :
 *  - L'initialisation de la carte Leaflet
 *  - Le chargement du cozyroute.geojson
 *  - Le calcul d'intensité du "bloom" (routeValue * userValue * 4)
 *  - L'assignation de classes CSS (.odorat-3.intensity-60, etc.)
 *  - Le radar chart (si besoin)
 *  - Le clic sur la carte pour poser 2 marqueurs et calculer un itinéraire
 ***********************************************/

/***********************************************
 * 0) Variables globales
 ***********************************************/

// Clé d'API OpenRouteService (itinéraire)
const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";

// Garde en mémoire les réponses utilisateur (0 à 5)
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

// Ordre des thèmes (pour le radar chart + setStyle)
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

// Références Leaflet
let map = null;
let cozyRouteLayer = null;   // Couche avec cosyroute.geojson
let routeLayer = null;       // Couche pour l'itinéraire ORS
let clickMarkers = [];

// Radar chart (Chart.js)
let radarChart = null;

/***********************************************
 * 1) Initialisation générale
 ***********************************************/
window.addEventListener("load", () => {
  initMap();                  // Carte Leaflet
  initDirectionsPanel();      // Contrôles du panneau itinéraire
  initRadarChart();           // Radar chart

  // Bouton "Accéder à la carte" => ferme le questionnaire
  const gotoMapBtn = document.getElementById("goto-map");
  if (gotoMapBtn) {
    gotoMapBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.add("hidden");
    });
  }

  // Bouton burger => ouvre/ferme le questionnaire
  const burgerBtn = document.getElementById("burger-menu");
  if (burgerBtn) {
    burgerBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.toggle("hidden");
    });
  }

  // Bouton "OK" (search) - optionnel
  const searchBtn = document.getElementById("search-button");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const addr = document.getElementById("search-input").value.trim();
      if (!addr) {
        alert("Veuillez saisir une adresse.");
        return;
      }
      console.log("Recherche d'adresse :", addr);
      // Ici, éventuellement, geocodeAddress(addr);
    });
  }
});

/***********************************************
 * 2) initMap(): Création de la carte + chargement GeoJSON
 ***********************************************/
function initMap() {
  map = L.map("map", {
    zoomControl: true,
    attributionControl: false
  }).setView([49.0389, 2.0760], 13);

  // Chargement du cozyroute.geojson
  fetch("cozyroute.geojson")
    .then((resp) => resp.json())
    .then((geojsonData) => {
      console.log("GeoJSON chargé, nombre de features =", geojsonData.features?.length || 0);

      // On stocke la couche dans cozyRouteLayer
      cozyRouteLayer = L.geoJSON(geojsonData, {
        style: () => ({
          color: "#FFFFFF",  // Trait blanc par défaut
          weight: 3
        })
      }).addTo(map);

      map.fitBounds(cozyRouteLayer.getBounds());
    })
    .catch((err) => console.error("Erreur chargement cozyroute.geojson :", err));

  // Sur clic carte => pose de marqueurs
  map.on("click", (e) => {
    handleMapClick(e.latlng);
  });
}

/***********************************************
 * 3) Clic sur la carte => pose de marqueurs
 ***********************************************/
function handleMapClick(latlng) {
  // Si déjà 2 marqueurs => on efface + on repart
  if (clickMarkers.length === 2) {
    clearRouteAndMarkers();
  }

  // Ajoute un nouveau marqueur
  const marker = L.marker([latlng.lat, latlng.lng]).addTo(map);
  clickMarkers.push(marker);

  // Au 2e marqueur => calcul itinéraire
  if (clickMarkers.length === 2) {
    const latlngA = clickMarkers[0].getLatLng();
    const latlngB = clickMarkers[1].getLatLng();
    getRoute(latlngA.lat, latlngA.lng, latlngB.lat, latlngB.lng);
  }
}

// Vide l'itinéraire et les marqueurs
function clearRouteAndMarkers() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  clickMarkers.forEach((m) => map.removeLayer(m));
  clickMarkers = [];
}

/***********************************************
 * 4) Calcul d'itinéraire via OpenRouteService
 ***********************************************/
function getRoute(lat1, lng1, lat2, lng2) {
  // Supprime un éventuel itinéraire précédent
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }

  const routeUrl = "https://api.openrouteservice.org/v2/directions/foot-walking";
  const bodyData = {
    coordinates: [
      [lng1, lat1],  // format ORS = [lon, lat]
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
    .then((resp) => {
      if (!resp.ok) {
        throw new Error("Erreur réseau ou requête invalide");
      }
      return resp.json();
    })
    .then((data) => {
      if (!data || !data.routes || data.routes.length === 0) {
        throw new Error("Impossible de calculer l’itinéraire.");
      }

      const route = data.routes[0];
      console.log("Itinéraire obtenu, distance =", route.summary.distance, "m");

      // Décodage polyline
      const coords = decodePolyline(route.geometry); // tableau [ [lat, lng], ... ]

      // Converti en GeoJSON
      const routeGeoJSON = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: coords.map(([la, ln]) => [ln, la]) // [lng, lat]
        },
        properties: {}
      };

      // Ajout sur la carte
      routeLayer = L.geoJSON(routeGeoJSON, {
        style: {
          color: "#1976D2",
          weight: 4
        }
      }).addTo(map);

      map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });

      // Afficher le panneau directions
      showDirectionsPanel(route);
    })
    .catch((err) => {
      console.error(err);
      alert(err.message);
    });
}

/***********************************************
 * 5) Décodage polyline
 ***********************************************/
function decodePolyline(encoded) {
  let currentPosition = 0;
  let currentLat = 0;
  let currentLng = 0;
  const coords = [];

  while (currentPosition < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    // lat
    do {
      byte = encoded.charCodeAt(currentPosition++) - 63;
      result |= (byte & 0x1F) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    currentLat += deltaLat;

    // lng
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(currentPosition++) - 63;
      result |= (byte & 0x1F) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLng = (result & 1) ? ~(result >> 1) : (result >> 1);
    currentLng += deltaLng;

    const lat = currentLat / 1e5;
    const lng = currentLng / 1e5;
    coords.push([lat, lng]);
  }
  return coords;
}

/***********************************************
 * 6) Affichage des infos de directions
 ***********************************************/
function showDirectionsPanel(route) {
  const panel = document.getElementById("directions-panel");
  panel.classList.remove("hidden");

  // Distance/durée
  const distKm = (route.summary.distance / 1000).toFixed(2) + " km";
  const durMin = (route.summary.duration / 60).toFixed(0) + " min";
  document.getElementById("directions-summary").textContent =
    `Distance : ${distKm} | Durée : ~${durMin}`;

  // Steps
  const stepsUl = document.getElementById("directions-steps");
  stepsUl.innerHTML = "";

  if (route.segments && route.segments.length > 0) {
    route.segments.forEach((seg) => {
      seg.steps.forEach((step) => {
        const li = document.createElement("li");
        const stepDist = (step.distance || 0).toFixed(0) + " m";
        const instr = step.instruction;
        const name = step.name && step.name !== "-" ? ` (${step.name})` : "";
        li.textContent = `${stepDist} - ${instr}${name}`;
        stepsUl.appendChild(li);
      });
    });
  }
}

/***********************************************
 * 7) Contrôle du panneau (fermer)
 ***********************************************/
function initDirectionsPanel() {
  const closeBtn = document.getElementById("close-directions");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("directions-panel").classList.add("hidden");
    });
  }
}

/***********************************************
 * 8) Radar Chart (Chart.js)
 ***********************************************/
function initRadarChart() {
  const ctx = document.getElementById("radarChart").getContext("2d");
  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: themes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)),
      datasets: [{
        label: "Mon niveau de gêne",
        data: themes.map((t) => userData[t]),
        backgroundColor: "rgba(103, 58, 183, 0.2)",
        borderColor: "rgba(103, 58, 183, 1)",
        borderWidth: 2
      }]
    },
    options: {
      responsive: true,
      scales: {
        r: {
          min: 0,
          max: 5,
          ticks: { stepSize: 1 }
        }
      }
    }
  });
}

function updateRadarChart() {
  if (!radarChart) return;
  radarChart.data.datasets[0].data = themes.map((t) => userData[t]);
  radarChart.update();
}

/***********************************************
 * 9) updateQuestionValue(): sliders => userData => bloom
 ***********************************************/
function updateQuestionValue(theme, value) {
  // Màj userData
  userData[theme] = parseInt(value, 10);
  document.getElementById(`${theme}-value`).textContent = value;

  // Màj radar chart
  updateRadarChart();

  // Màj style bloom
  updateRoadStyle();
}

/***********************************************
 * 10) Bloom: assigner .odorat-3.intensity-60, etc.
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) {
    console.log("Pas encore de cosyRouteLayer");
    return;
  }

  // On applique setStyle sur chaque feature
  cozyRouteLayer.setStyle((feature) => {
    if (!feature.properties) {
      // Aucune propriété => trait blanc
      return { color: "#FFFFFF", weight: 3 };
    }

    let className = "";
    // On calcule l'intensité pour chaque thème
    themes.forEach((t) => {
      const routeValue = feature.properties[t] || 0;
      const userValue = userData[t] || 0;
      // intensité = routeValue * userValue * 4
      const intensity = routeValue * userValue * 4;
      const intensityClamped = Math.min(intensity, 100);

      // Ex: si routeValue=5, userValue=5 => intensity=100
      if (routeValue > 0) {
        className += `${t}-${routeValue} intensity-${intensityClamped} `;
      }
    });

    const finalClass = className.trim();
    // Log pour debug
    // console.log("Feature ID=?, classe =", finalClass);

    return {
      color: "#FFFFFF",
      weight: 3,
      className: finalClass // applique ex: "odorat-3 intensity-60"
    };
  });
}

/***********************************************
 * (Optionnel) Geoloc
 ***********************************************/
function askUserLocation() {
  if (!navigator.geolocation) {
    alert("La géolocalisation n'est pas supportée.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      L.marker([lat, lng]).addTo(map);
      map.setView([lat, lng], 14);
    },
    (err) => {
      console.warn("Erreur geoloc:", err);
    },
    { enableHighAccuracy: true }
  );
}
