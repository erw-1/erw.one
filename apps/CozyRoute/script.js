/***********************************************
 * script.js
 ***********************************************/

/***********************************************
 * Configuration & Variables globales
 ***********************************************/

// Clé d'API OpenRouteService (pour le calcul d’itinéraire)
const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";

// Données du questionnaire (0 à 5 pour chaque thème)
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

// Liste des thèmes (pour le radar chart et la logique)
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
let map = null;              // la carte
let cozyRouteLayer = null;   // la couche GeoJSON des routes
let routeLayer = null;       // la couche pour l'itinéraire ORS
let clickMarkers = [];       // marqueurs placés par clic

// Radar chart (Chart.js)
let radarChart = null;

/***********************************************
 * Initialisation au chargement de la page
 ***********************************************/
window.addEventListener("load", () => {
  initMap();
  initDirectionsPanelControls();  // Gère l’ouverture/fermeture du panneau d’itinéraire
  initRadarChart();               // Initialise le radar chart

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

  // Bouton "OK" (recherche d’adresse) - optionnel
  const searchBtn = document.getElementById("search-button");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const address = document.getElementById("search-input").value.trim();
      if (!address) {
        alert("Veuillez saisir une adresse.");
        return;
      }
      // Pour tester : console.log ou geocodeAddress(address);
      console.log("Recherche d'adresse :", address);
    });
  }
});

/***********************************************
 * 1) Initialisation de la carte Leaflet
 ***********************************************/
function initMap() {
  // Crée la carte, centrée sur Cergy
  map = L.map("map", {
    zoomControl: true,
    attributionControl: false
  }).setView([49.0389, 2.0760], 13);

  // Charge le GeoJSON principal
  fetch("cozyroute.geojson")
    .then((resp) => resp.json())
    .then((geojsonData) => {
      cozyRouteLayer = L.geoJSON(geojsonData, {
        style: (feature) => {
          // Style de base : lignes blanches
          return {
            color: "#FFFFFF",
            weight: 3
          };
        }
      }).addTo(map);

      // Ajuste la vue
      map.fitBounds(cozyRouteLayer.getBounds());
    })
    .catch((err) => console.error("Erreur chargement cozyroute.geojson :", err));

  // Écoute le clic sur la carte pour poser deux marqueurs
  map.on("click", (e) => {
    handleMapClick(e.latlng);
  });
}

/***********************************************
 * 2) Gestion du clic sur la carte
 * - 1er clic => pose le 1er marqueur
 * - 2e clic => pose le 2e marqueur => calcule l’itinéraire
 * - 3e clic => on reset tout
 ***********************************************/
function handleMapClick(latlng) {
  // Si on a déjà 2 marqueurs, on réinitialise
  if (clickMarkers.length === 2) {
    clearRouteAndMarkers();
  }

  // Ajoute un marqueur
  const marker = L.marker([latlng.lat, latlng.lng]).addTo(map);
  clickMarkers.push(marker);

  // Au 2e marqueur => calcul itinéraire
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
  clickMarkers.forEach((m) => {
    map.removeLayer(m);
  });
  clickMarkers = [];
}

/***********************************************
 * 3) Calcul d’itinéraire (OpenRouteService)
 ***********************************************/
function getRoute(lat1, lng1, lat2, lng2) {
  // Efface un éventuel itinéraire précédent
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }

  const routeUrl = "https://api.openrouteservice.org/v2/directions/foot-walking";
  const bodyData = {
    coordinates: [
      [lng1, lat1],  // [lon, lat]
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

    // On prend la première route
    const route = data.routes[0];

    // Décoder la polyline
    const decodedCoords = decodePolyline(route.geometry); 
    // => tableau [ [lat, lng], [lat, lng], ... ]

    // Construire un objet GeoJSON
    const routeGeoJSON = {
      type: "Feature",
      geometry: {
        type: "LineString",
        // En GeoJSON, c'est [lng, lat]
        coordinates: decodedCoords.map(([la, ln]) => [ln, la])
      },
      properties: {}
    };

    // Ajouter à la carte
    routeLayer = L.geoJSON(routeGeoJSON, {
      style: {
        color: "#1976D2",
        weight: 4
      }
    }).addTo(map);
    map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });

    // Afficher le panneau de directions
    showDirectionsPanel(route);
  })
  .catch((err) => {
    console.error(err);
    alert(err.message);
  });
}

/***********************************************
 * 4) Décodage de la polyline
 ***********************************************/
function decodePolyline(encoded) {
  let currentPosition = 0;
  let currentLat = 0;
  let currentLng = 0;
  const coordinates = [];

  while (currentPosition < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;

    // Décodage pour lat
    do {
      byte = encoded.charCodeAt(currentPosition++) - 63;
      result |= (byte & 0x1F) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const deltaLat = (result & 1) ? ~(result >> 1) : (result >> 1);
    currentLat += deltaLat;

    // Décodage pour lng
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
    coordinates.push([lat, lng]);
  }

  return coordinates;
}

/***********************************************
 * 5) Affiche les infos de direction
 ***********************************************/
function showDirectionsPanel(route) {
  const directionsPanel = document.getElementById("directions-panel");
  directionsPanel.classList.remove("hidden"); // Ouvre le panneau

  // Distance / durée totales
  const dist = route.summary.distance; // mètres
  const dur = route.summary.duration;  // secondes
  const distKm = (dist / 1000).toFixed(2) + " km";
  const durMin = (dur / 60).toFixed(0) + " min";

  const summaryDiv = document.getElementById("directions-summary");
  summaryDiv.textContent = `Distance : ${distKm} | Durée : ~${durMin}`;

  // Liste d’étapes
  const stepsUl = document.getElementById("directions-steps");
  stepsUl.innerHTML = "";

  if (route.segments && route.segments.length > 0) {
    route.segments.forEach((seg) => {
      seg.steps.forEach((step) => {
        const li = document.createElement("li");
        const stepDist = (step.distance || 0).toFixed(0) + " m";
        const instructionText = step.instruction;
        const nameText = step.name && step.name !== "-" ? ` (${step.name})` : "";
        li.textContent = `${stepDist} - ${instructionText}${nameText}`;
        stepsUl.appendChild(li);
      });
    });
  }
}

/***********************************************
 * 6) Contrôles du panneau de directions
 ***********************************************/
function initDirectionsPanelControls() {
  const closeBtn = document.getElementById("close-directions");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("directions-panel").classList.add("hidden");
    });
  }
}

/***********************************************
 * 7) Radar Chart (Chart.js)
 ***********************************************/
function initRadarChart() {
  const ctx = document.getElementById("radarChart").getContext("2d");
  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: themes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)),
      datasets: [
        {
          label: "Mon niveau de gêne",
          data: themes.map((t) => userData[t]),
          backgroundColor: "rgba(103, 58, 183, 0.2)",
          borderColor: "rgba(103, 58, 183, 1)",
          borderWidth: 2
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
  radarChart.data.datasets[0].data = themes.map((t) => userData[t]);
  radarChart.update();
}

/***********************************************
 * 8) Mise à jour du questionnaire
 ***********************************************/
function updateQuestionValue(theme, value) {
  userData[theme] = parseInt(value, 10);
  document.getElementById(`${theme}-value`).textContent = value;

  // Met à jour le radar chart
  updateRadarChart();

  // Met à jour le style (bloom) sur les routes
  updateRoadStyle();
}

/***********************************************
 * 9) Mise à jour du style des routes (bloom)
 *    => Assignation de classes ex: odorat-5 intensity-100
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) return;

  cozyRouteLayer.setStyle((feature) => {
    if (!feature.properties) {
      // Pas de propriétés => trait blanc par défaut
      return { color: "#FFFFFF", weight: 3 };
    }

    // On calcule des classes dynamiques
    let className = "";
    themes.forEach((themeKey) => {
      const routeValue = feature.properties[themeKey] || 0;
      const userValue = userData[themeKey] || 0;

      // intensité => routeValue * userValue * 4
      const intensity = routeValue * userValue * 4;
      const intensityClamped = Math.min(intensity, 100);

      // Ex: .odorat-5.intensity-100
      if (routeValue > 0) {
        className += `${themeKey}-${routeValue} intensity-${intensityClamped} `;
      }
    });

    return {
      color: "#FFFFFF",
      weight: 3,
      className: className.trim()
    };
  });
}

/***********************************************
 * (Optionnel) géolocalisation
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
      console.warn("Erreur de géolocalisation :", err);
    },
    { enableHighAccuracy: true }
  );
}
