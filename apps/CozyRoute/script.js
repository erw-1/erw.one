/***********************************************
 * script.js : "baseClass + intensité"
 * ---------------------------------------------
 * Fonctions principales :
 *  - initMap() : crée la carte, charge le cozyroute.geojson
 *  - onEachFeature() : assigne une baseClass en fonction
 *    des valeurs de la feature (ex: "odorat-4 pollution-2")
 *  - updateQuestionValue() : un slider change => on met à jour userData => updateRoadStyle()
 *  - updateRoadStyle() : applique pour chaque tronçon
 *    la classe baseClass + intensités par thème (ex: .odorat-intensity-60)
 *  - getRoute(), decodePolyline() etc. : calcul d'itinéraire si besoin
 *  - initRadarChart(), updateRadarChart() : le radar Chart.js
 ***********************************************/

/***********************************************
 * 1) Données & Variables globales
 ***********************************************/

// Thèmes (clés du GeoJSON) :
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

// Stockage des réponses utilisateur (0 à 5)
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

// Carte Leaflet
let map = null;
let cozyRouteLayer = null;   // Couche GeoJSON principale
let routeLayer = null;       // Couche pour l'itinéraire ORS (facultatif)
let clickMarkers = [];       // Marqueurs placés sur la carte

// Radar Chart (Chart.js)
let radarChart = null;

// Clé d'API OpenRouteService (exemple)
const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";


/***********************************************
 * 2) Initialisation au chargement
 ***********************************************/
window.addEventListener("load", () => {
  initMap();
  initDirectionsPanel();   // Gère l'ouverture/fermeture du panneau "Itinéraire"
  initRadarChart();        // Radar Chart
  initUIButtons();         // Boutons "Accéder à la carte", "burger", etc.
});


/***********************************************
 * 3) initMap() : création de la carte, 
 *    chargement du GeoJSON, baseClass
 ***********************************************/
function initMap() {
  map = L.map("map", {
    zoomControl: true,
    attributionControl: false
  }).setView([49.0389, 2.0760], 13);

  // Charge le GeoJSON
  fetch("cozyroute.geojson")
    .then((resp) => resp.json())
    .then((geojsonData) => {
      // Création de la couche
      cozyRouteLayer = L.geoJSON(geojsonData, {
        onEachFeature: (feature, layer) => {
          // Construit une baseClass ex: "odorat-4 pollution-2"
          let baseClass = "";
          themes.forEach((t) => {
            const val = feature.properties[t] || 0;
            if (val > 0) {
              baseClass += `${t}-${val} `;
            }
          });
          // On stocke la baseClass dans feature.properties
          feature.properties._baseClass = baseClass.trim();
        },
        style: {
          // Par défaut, trait blanc + pas d'intensité
          color: "#FFFFFF",
          weight: 3,
          className: "intensity-0"
        }
      }).addTo(map);

      // Ajuste la vue
      map.fitBounds(cozyRouteLayer.getBounds());
    })
    .catch((err) => console.error("Erreur chargement cozyroute.geojson :", err));

  // Clic sur la carte => pose de marqueurs
  map.on("click", (e) => {
    handleMapClick(e.latlng);
  });
}


/***********************************************
 * 4) UI Buttons (burger, goto-map, etc.)
 ***********************************************/
function initUIButtons() {
  // Bouton "Accéder à la carte"
  const gotoMapBtn = document.getElementById("goto-map");
  if (gotoMapBtn) {
    gotoMapBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.add("hidden");
    });
  }

  // Bouton burger => ouvre/ferme questionnaire
  const burgerBtn = document.getElementById("burger-menu");
  if (burgerBtn) {
    burgerBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.toggle("hidden");
    });
  }

  // Bouton "search" (optionnel)
  const searchBtn = document.getElementById("search-button");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const address = document.getElementById("search-input").value.trim();
      if (!address) {
        alert("Veuillez saisir une adresse.");
        return;
      }
      console.log("Recherche d'adresse :", address);
      // ex: geocodeAddress(address);
    });
  }
}


/***********************************************
 * 5) handleMapClick : pose 2 marqueurs => calcule itinéraire
 ***********************************************/
function handleMapClick(latlng) {
  // Si déjà 2 => reset
  if (clickMarkers.length === 2) {
    clearRouteAndMarkers();
  }

  // Ajoute un nouveau marqueur
  const marker = L.marker([latlng.lat, latlng.lng]).addTo(map);
  clickMarkers.push(marker);

  // Au 2ème, on calcule l'itinéraire
  if (clickMarkers.length === 2) {
    const latlngA = clickMarkers[0].getLatLng();
    const latlngB = clickMarkers[1].getLatLng();
    getRoute(latlngA.lat, latlngA.lng, latlngB.lat, latlngB.lng);
  }
}

// Supprime itinéraire + marqueurs
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
 * 6) getRoute (OpenRouteService)
 ***********************************************/
function getRoute(lat1, lng1, lat2, lng2) {
  // Retire un éventuel itinéraire précédent
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
      if (!resp.ok) throw new Error("Erreur réseau / requête");
      return resp.json();
    })
    .then((data) => {
      if (!data || !data.routes || data.routes.length === 0) {
        throw new Error("Itinéraire introuvable");
      }

      const route = data.routes[0];
      const decodedCoords = decodePolyline(route.geometry); 
      const routeGeoJSON = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: decodedCoords.map(([la, ln]) => [ln, la])
        },
        properties: {}
      };

      routeLayer = L.geoJSON(routeGeoJSON, {
        style: {
          color: "#1976D2",
          weight: 4
        }
      }).addTo(map);

      map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });

      // Affiche le panneau (distance, étapes)
      showDirectionsPanel(route);
    })
    .catch((err) => {
      console.error(err);
      alert(err.message);
    });
}


/***********************************************
 * 7) Décodage polyline
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
    coordinates.push([lat, lng]);
  }
  return coordinates;
}


/***********************************************
 * 8) showDirectionsPanel()
 ***********************************************/
function showDirectionsPanel(route) {
  const panel = document.getElementById("directions-panel");
  panel.classList.remove("hidden");

  // Distance / durée
  const dist = route.summary.distance;  // en m
  const dur = route.summary.duration;   // en s
  document.getElementById("directions-summary").textContent =
    `Distance : ${(dist/1000).toFixed(2)} km | Durée : ~${(dur/60).toFixed(0)} min`;

  // Liste d'étapes
  const stepsUl = document.getElementById("directions-steps");
  stepsUl.innerHTML = "";

  if (route.segments && route.segments.length > 0) {
    route.segments.forEach((seg) => {
      seg.steps.forEach((step) => {
        const li = document.createElement("li");
        const d = (step.distance||0).toFixed(0) + " m";
        const instruction = step.instruction || "";
        const name = (step.name && step.name !== "-") ? ` (${step.name})` : "";
        li.textContent = `${d} - ${instruction}${name}`;
        stepsUl.appendChild(li);
      });
    });
  }
}

// Panneau "X" pour fermer
function initDirectionsPanel() {
  const closeBtn = document.getElementById("close-directions");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("directions-panel").classList.add("hidden");
    });
  }
}


/***********************************************
 * 9) Radar Chart (Chart.js)
 ***********************************************/
function initRadarChart() {
  const ctx = document.getElementById("radarChart").getContext("2d");
  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: themes.map(t => t.charAt(0).toUpperCase()+ t.slice(1)),
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
          max: 5,
          ticks: { stepSize: 1 }
        }
      }
    }
  });
}

// Met à jour le radar chart
function updateRadarChart() {
  if (!radarChart) return;
  radarChart.data.datasets[0].data = themes.map(t => userData[t]);
  radarChart.update();
}


/***********************************************
 * 10) updateQuestionValue() 
 *     => userData, radarChart, updateRoadStyle
 ***********************************************/
function updateQuestionValue(theme, value) {
  userData[theme] = parseInt(value, 10);
  document.getElementById(`${theme}-value`).textContent = value;

  // Radar chart ?
  updateRadarChart();

  // Bloom
  updateRoadStyle();
}


/***********************************************
 * 11) updateRoadStyle()
 *     => applique baseClass + intensités
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) {
    console.log("cozyRouteLayer pas encore prêt");
    return;
  }

  // On parcourt tous les tronçons
  cozyRouteLayer.eachLayer((layer) => {
    const feat = layer.feature;
    if (!feat || !feat.properties) return;

    // baseClass : ex. "odorat-4 pollution-2"
    const baseClass = feat.properties._baseClass || "";

    // On va concaténer des classes d'intensité
    // ex. " odorat-intensity-40 pollution-intensity-20" etc.
    let intensityClasses = "";
    themes.forEach((t) => {
      const routeVal = feat.properties[t] || 0;  // note sur la route
      const userVal = userData[t] || 0;         // note utilisateur
      const intensity = routeVal * userVal * 4; 
      const iClamp = Math.min(intensity, 100);

      // Ajoute une classe ex: "odorat-intensity-40"
      intensityClasses += ` ${t}-intensity-${iClamp}`;
    });

    // Combine
    const finalClass = (baseClass + intensityClasses).trim();

    // On applique via setStyle
    layer.setStyle({
      color: "#FFFFFF",
      weight: 3,
      className: finalClass
    });
  });
}


/***********************************************
 * (Optionnel) Géolocalisation 
 ***********************************************/
function askUserLocation() {
  if (!navigator.geolocation) {
    alert("Pas de géolocalisation supportée.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      L.marker([lat, lng]).addTo(map);
      map.setView([lat,lng], 14);
    },
    (err) => {
      console.warn("Erreur geoloc:", err);
    },
    { enableHighAccuracy: true }
  );
}
