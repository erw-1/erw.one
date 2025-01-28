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

// Liste des thèmes (pour le radar chart et le style)
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

// Référence à la carte Leaflet
let map = null;
// Couche GeoJSON pour tes routes
let cozyRouteLayer = null;
// Couche pour l'itinéraire OpenRouteService
let routeLayer = null;
// Marqueurs placés par clic sur la carte
let clickMarkers = [];

// Radar chart (Chart.js)
let radarChart = null;


/***********************************************
 * Initialisation au chargement
 ***********************************************/
window.addEventListener("load", () => {
  initMap();
  initDirectionsPanelControls();  // Gère l'ouverture/fermeture du panneau d'itinéraire
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

  // Bouton "OK" pour la recherche d’adresse (optionnel)
  const searchBtn = document.getElementById("search-button");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const address = document.getElementById("search-input").value.trim();
      if (!address) {
        alert("Veuillez saisir une adresse.");
        return;
      }
      // Ici, tu peux implémenter un geocodage ou autre logique
      // ex: geocodeAddress(address);
      console.log("Recherche d'adresse :", address);
    });
  }
});


/***********************************************
 * 1) Initialisation de la carte Leaflet
 ***********************************************/
function initMap() {
  // Crée la carte centrée sur Cergy
  map = L.map("map", {
    zoomControl: true,
    attributionControl: false
  }).setView([49.0389, 2.0760], 13);

  // Charge le GeoJSON principal
  fetch("cozyroute.geojson")
    .then((response) => response.json())
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

      map.fitBounds(cozyRouteLayer.getBounds());
    })
    .catch((err) => {
      console.error("Erreur lors du chargement de cozyroute.geojson :", err);
    });

  // Gère le clic sur la carte (pour placer deux points)
  map.on("click", (e) => {
    handleMapClick(e.latlng);
  });
}


/***********************************************
 * 2) Gestion du clic sur la carte
 *    - Ajoute un marqueur
 *    - Au 2ème marqueur, calcule un itinéraire
 *    - Au 3ème clic, reset
 ***********************************************/
function handleMapClick(latlng) {
  // S'il y a déjà 2 marqueurs, on efface l'ancien itinéraire
  // et on repart à zéro
  if (clickMarkers.length === 2) {
    clearRouteAndMarkers();
  }

  // Ajoute le nouveau marqueur
  const marker = L.marker([latlng.lat, latlng.lng]).addTo(map);
  clickMarkers.push(marker);

  // S'il y a 2 marqueurs => calcul d'itinéraire
  if (clickMarkers.length === 2) {
    const latlngA = clickMarkers[0].getLatLng();
    const latlngB = clickMarkers[1].getLatLng();
    getRoute(latlngA.lat, latlngA.lng, latlngB.lat, latlngB.lng);
  }
}

// Supprime l'itinéraire et les marqueurs placés
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
 * 3) Calcul d'itinéraire (OpenRouteService)
 *    - Polyline encodée => on la décode
 *    - Convertit en GeoJSON => Leaflet
 *    - Affiche l'itinéraire + panneau
 ***********************************************/
function getRoute(lat1, lng1, lat2, lng2) {
  // Si un itinéraire existe déjà, on l'efface
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

      // 1) Décoder la polyline encodée
      const decodedCoords = decodePolyline(route.geometry);
      // => tableau [ [lat, lng], [lat, lng], ... ]

      // 2) Construire un objet GeoJSON
      const routeGeoJSON = {
        type: "Feature",
        geometry: {
          type: "LineString",
          // En GeoJSON, c'est [lng, lat]
          coordinates: decodedCoords.map(([la, ln]) => [ln, la])
        },
        properties: {}
      };

      // 3) Ajouter l'itinéraire sur la carte
      routeLayer = L.geoJSON(routeGeoJSON, {
        style: {
          color: "#1976D2",
          weight: 4
        }
      }).addTo(map);
      map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });

      // 4) Afficher le panneau de directions
      showDirectionsPanel(route);
    })
    .catch((err) => {
      console.error(err);
      alert(err.message);
    });
}


/***********************************************
 * 4) Décodage de la polyline ORS
 *    (sans dépendances externes)
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
 * 5) Affiche les infos de directions dans le panneau
 *    - Distance / durée
 *    - Liste d'étapes
 ***********************************************/
function showDirectionsPanel(route) {
  const directionsPanel = document.getElementById("directions-panel");
  directionsPanel.classList.remove("hidden"); // l'affiche

  // Distance / durée totales
  const dist = route.summary.distance; // en mètres
  const dur = route.summary.duration;  // en secondes
  const distKm = (dist / 1000).toFixed(2) + " km";
  const durMin = (dur / 60).toFixed(0) + " min";

  const summaryDiv = document.getElementById("directions-summary");
  summaryDiv.textContent = `Distance : ${distKm} | Durée : ~${durMin}`;

  // Liste des steps
  const stepsUl = document.getElementById("directions-steps");
  stepsUl.innerHTML = "";

  // ORS stocke les étapes dans route.segments[].steps[]
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
 * 6) Contrôles du panneau (fermer)
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
 * 8) Gestion du questionnaire
 *    (slider => updateValue => refresh radar + style)
 ***********************************************/
function updateQuestionValue(theme, value) {
  userData[theme] = parseInt(value, 10);
  document.getElementById(`${theme}-value`).textContent = value;

  // Met à jour le radar chart
  updateRadarChart();

  // Met à jour le style "bloom" sur les routes
  updateRoadStyle();
}


/***********************************************
 * 9) Mise à jour du style des routes ("bloom")
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) return;

  cozyRouteLayer.setStyle((feature) => {
    if (!feature.properties) {
      // Pas de propriétés => couleur blanche par défaut
      return { color: "#FFFFFF", weight: 3 };
    }

    // On peut construire une classe dynamique
    let className = "";
    themes.forEach((t) => {
      const routeValue = feature.properties[t] || 0;
      const userValue = userData[t] || 0;
      const intensity = routeValue * userValue * 4;
      const intensityClamped = Math.min(intensity, 100);

      if (routeValue > 0) {
        className += `${t}-${routeValue} intensity-${intensityClamped} `;
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
 * (Optionnel) Géolocalisation si besoin
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
      console.warn("Erreur lors de la géolocalisation :", err);
    },
    { enableHighAccuracy: true }
  );
}
