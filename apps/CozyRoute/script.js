/***********************************************
 * script.js
 * ---------------------------------------------
 * Hypothèse :
 *   - Chaque tronçon a un champ "class" dans son GeoJSON
 *     ex: "odorat-3", "bruit-2", ...
 *   - Au chargement, on applique directement cette classe
 *     + "intensity-0" (ex: "odorat-3 intensity-0").
 *   - Lorsqu'un slider (odorat, bruit, etc.) bouge, on veut
 *     changer la partie "intensity-X" en "intensity-NouvelleValeur"
 *     pour tous les tronçons ayant ce thème (ex: "odorat-").
 *
 *   => Le routeValue (par ex. 3) n'est plus parsing ni utilisé
 *      pour calculer l'intensité. On applique l'intensité
 *      simplement en fonction du *slider* userData[theme].
 *
 *   => On conserve le code existant pour le routing / geoloc / radar
 *      si tu en as besoin, mais la mise à jour "bloom" devient
 *      très simple : si un tronçon contient "odorat-", on remplace
 *      "intensity-X" par "intensity-(userData.odorat)".
 ***********************************************/

/***********************************************
 * Variables globales
 ***********************************************/

// Clé d'API ORS (optionnel pour itinéraire)
const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";

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
let cozyRouteLayer = null;  // Couche GeoJSON
let routeLayer = null;      // Couche itinéraire (facultatif)
let clickMarkers = [];      // Marqueurs posés par clic

// Radar Chart (si besoin)
let radarChart = null;

// Liste des thèmes attendus
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
 * Initialisation
 ***********************************************/
window.addEventListener("load", () => {
  initMap();
  initDirectionsPanel(); // Gère l'ouverture/fermeture du panneau "Itinéraire"
  initRadarChart();      // Radar chart (si nécessaire)
  initUIButtons();       // Boutons "Accéder à la carte", "burger", "search", etc.
});


/***********************************************
 * 1) initMap() : création carte, chargement GeoJSON
 ***********************************************/
// Crée la carte et charge le GeoJSON
function initMap() {
  // 1) Créer la carte Leaflet
  map = L.map("map", {
    zoomControl: true,
    attributionControl: false
  }).setView([49.0389, 2.0760], 13);

  // 2) Charger le GeoJSON
  fetch("cozyroute.geojson")
    .then((response) => {
      if (!response.ok) {
        throw new Error("Erreur réseau ou fichier introuvable");
      }
      return response.json();
    })
    .then((geojsonData) => {
      // 3) Afficher le GeoJSON
      cozyRouteLayer = L.geoJSON(geojsonData, {
        // Pour chaque tronçon, on lit directement
        // feature.properties.class (ex: "odorat-3")
        // et on l'accole avec "intensity-0" => ex: "odorat-3 intensity-0"
        style: (feature) => {
          const geojsonClass = feature.properties.class || "";
          return {
            color: "#FFFFFF",   // trait blanc
            weight: 3,          // épaisseur 3
            className: `${geojsonClass} intensity-0`.trim()
          };
        }
      }).addTo(map);

      // 4) Centrer la vue sur l'emprise de cozyRouteLayer
      map.fitBounds(cozyRouteLayer.getBounds());
    })
    .catch((err) => {
      console.error("Erreur chargement cozyroute.geojson :", err);
    });
}


/***********************************************
 * 2) UI Buttons : burger, goto-map, search, etc.
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
      console.log("Recherche d'adresse:", address);
      // ex: geocodeAddress(address);
    });
  }
}


/***********************************************
 * 3) handleMapClick : (facultatif)
 ***********************************************/
function handleMapClick(latlng) {
  // Si déjà 2 => reset
  if (clickMarkers.length === 2) {
    clearRouteAndMarkers();
  }

  // Ajout d'un nouveau marqueur
  const marker = L.marker([latlng.lat, latlng.lng]).addTo(map);
  clickMarkers.push(marker);

  // Au 2e => calcul itinéraire
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
  clickMarkers.forEach((m) => map.removeLayer(m));
  clickMarkers = [];
}


/***********************************************
 * 4) getRoute : calcul itinéraire (facultatif)
 ***********************************************/
function getRoute(lat1, lng1, lat2, lng2) {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }

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
    .then((resp) => {
      if (!resp.ok) throw new Error("Erreur requête");
      return resp.json();
    })
    .then((data) => {
      if (!data || !data.routes || data.routes.length === 0) {
        throw new Error("Aucun itinéraire trouvé");
      }

      const route = data.routes[0];
      const decodedCoords = decodePolyline(route.geometry);

      const routeGeo = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: decodedCoords.map(([la, ln]) => [ln, la])
        },
        properties: {}
      };

      routeLayer = L.geoJSON(routeGeo, {
        style: {
          color: "#1976D2",
          weight: 4
        }
      }).addTo(map);

      map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });

      // Afficher le panneau
      showDirectionsPanel(route);
    })
    .catch((err) => {
      console.error(err);
      alert(err.message);
    });
}

/***********************************************
 * 5) decodePolyline (utilisé par getRoute)
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
 * 6) showDirectionsPanel (panel de droite)
 ***********************************************/
function showDirectionsPanel(route) {
  const panel = document.getElementById("directions-panel");
  panel.classList.remove("hidden");

  const dist = route.summary.distance; 
  const dur = route.summary.duration;
  const distKm = (dist / 1000).toFixed(2) + " km";
  const durMin = (dur / 60).toFixed(0) + " min";

  document.getElementById("directions-summary").textContent =
    `Distance : ${distKm} | Durée : ~${durMin}`;

  const stepsUl = document.getElementById("directions-steps");
  stepsUl.innerHTML = "";

  if (route.segments && route.segments.length > 0) {
    route.segments.forEach((seg) => {
      seg.steps.forEach((step) => {
        const li = document.createElement("li");
        const stepDist = (step.distance || 0).toFixed(0) + " m";
        const instr = step.instruction;
        const name = (step.name && step.name !== "-") ? ` (${step.name})` : "";
        li.textContent = `${stepDist} - ${instr}${name}`;
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

/***********************************************
 * 7) Radar Chart (optionnel)
 ***********************************************/
function initRadarChart() {
  const ctx = document.getElementById("radarChart");
  if (!ctx) return; // si pas de radarChart

  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: themes.map((t) => t.charAt(0).toUpperCase() + t.slice(1)),
      datasets: [{
        label: "Mon niveau de gêne",
        data: themes.map((t) => userData[t]),
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
 * 8) Questionnaire => updateQuestionValue()
 ***********************************************/
function updateQuestionValue(theme, value) {
  userData[theme] = parseInt(value, 10);
  document.getElementById(`${theme}-value`).textContent = value;

  updateRadarChart();
  updateRoadStyle();
}

/***********************************************
 * 9) updateRoadStyle() 
 *    => On remplace "intensity-X" par "intensity-Y"
 *       si la classe contient "theme-"
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) return;

  // Pour chaque thème, on applique la nouvelle intensité userData[theme]
  for (const theme of themes) {
    const userVal = userData[theme] || 0;

    cozyRouteLayer.eachLayer((layer) => {
      const cName = layer.options.className || "";

      // Vérifie si cName contient "odorat-", "bruit-", etc.
      if (cName.includes(theme + "-")) {
        // On veut remplacer "intensity-<X>" par "intensity-userVal"
        // ex: "odorat-3 intensity-0" => "odorat-3 intensity-4"
        // => petite regex pour choper "intensity-.." 
        //   ou "intensity-\d+" (si on veut supporter 2 chiffres).
        let newClass = cName.replace(/intensity-\d+/, `intensity-${userVal}`);

        layer.setStyle({
          color: "#FFFFFF",
          weight: 3,
          className: newClass.trim()
        });
      }
    });
  }
}

/***********************************************
 * 10) (Optionnel) askUserLocation()
 ***********************************************/
function askUserLocation() {
  if (!navigator.geolocation) {
    alert("La géolocalisation n'est pas supportée.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      L.marker([pos.coords.latitude, pos.coords.longitude]).addTo(map);
      map.setView([pos.coords.latitude, pos.coords.longitude], 14);
    },
    (err) => {
      console.warn("Erreur geoloc :", err);
    },
    { enableHighAccuracy: true }
  );
}
