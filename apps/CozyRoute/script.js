/***********************************************
 * Variables et configuration globales
 ***********************************************/

// Clé d'API OpenRouteService
const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";

// Données de questionnaire (exemple)
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

// Ordre des thèmes
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

// Carte Leaflet et couches
let map = null;
let cozyRouteLayer = null;  // Couche GeoJSON pour tes routes
let routeLayer = null;      // Couche pour l'itinéraire ORS

// Marqueurs placés par clic
let clickMarkers = [];

// Références pour le bloom (optionnel)
let radarChart = null; // si tu utilises un chart radar, etc.

/***********************************************
 * Initialisation
 ***********************************************/
window.addEventListener("load", () => {
  initMap();
  initDirectionsPanelControls(); // Ouvre/ferme le panneau
  // Si tu as un radar chart, tu peux l'initialiser ici
  // initRadarChart();
});

/***********************************************
 * Initialisation de la carte
 ***********************************************/
function initMap() {
  // Création de la carte, centrée approximativement
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
          // Style de base : blanc
          return {
            color: "#FFFFFF",
            weight: 3
          };
        }
      }).addTo(map);
      map.fitBounds(cozyRouteLayer.getBounds());
    })
    .catch((err) => console.error("Erreur de chargement du cozyroute.geojson :", err));

  // Gère le clic sur la carte
  map.on("click", (e) => {
    handleMapClick(e.latlng);
  });
}

/***********************************************
 * Gestion du clic pour placer deux marqueurs,
 * calcul d'itinéraire, etc.
 ***********************************************/
function handleMapClick(latlng) {
  // S'il y a déjà 2 marqueurs, on efface l'ancien itinéraire
  // et on repart à zéro
  if (clickMarkers.length === 2) {
    clearRouteAndMarkers();
  }

  // Ajout d'un nouveau marqueur
  const marker = L.marker([latlng.lat, latlng.lng]).addTo(map);
  clickMarkers.push(marker);

  // Si on a 2 marqueurs => calcul d'itinéraire
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
 * Requête OpenRouteService pour l'itinéraire,
 * réception d'une polyline encodée,
 * décodage, affichage Leaflet + panneau
 ***********************************************/
function getRoute(lat1, lng1, lat2, lng2) {
  // Retire l'éventuel itinéraire précédent
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }

  const routeUrl = "https://api.openrouteservice.org/v2/directions/foot-walking";
  const bodyData = {
    coordinates: [
      [lng1, lat1], // attention : [lon, lat]
      [lng2, lat2]
    ]
    // instructions: true (par défaut)
  };

  fetch(routeUrl, {
    method: "POST",
    headers: {
      accept: "*/*",
      authorization: ORS_API_KEY,
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

      // 1) Décoder la polyline
      const decodedCoords = decodePolyline(route.geometry); 
      // => tableau de [ [lat, lng], [lat, lng], ... ]

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

      // 3) Ajouter à la carte
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
 * Décodage de la polyline
 * (version basique sans lib externe)
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

    const lat = currentLat / 1e5;
    const lng = currentLng / 1e5;
    coordinates.push([lat, lng]);
  }

  return coordinates;
}

/***********************************************
 * Affichage des instructions dans un volet
 * à droite, avec distance / durée / étapes
 ***********************************************/
function showDirectionsPanel(route) {
  const directionsPanel = document.getElementById("directions-panel");
  // Retire la classe hidden pour l'afficher
  directionsPanel.classList.remove("hidden");

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
        // distance en mètres, instruction, name...
        const stepLi = document.createElement("li");
        const stepDist = (step.distance || 0).toFixed(0) + " m";
        const instructionText = step.instruction;
        const nameText = step.name && step.name !== "-" ? ` (${step.name})` : "";
        stepLi.textContent = `${stepDist} - ${instructionText}${nameText}`;
        stepsUl.appendChild(stepLi);
      });
    });
  }
}

/***********************************************
 * Contrôles du volet (ouvrir/fermer)
 ***********************************************/
function initDirectionsPanelControls() {
  const closeBtn = document.getElementById("close-directions");
  closeBtn.addEventListener("click", () => {
    document.getElementById("directions-panel").classList.add("hidden");
  });
}

/***********************************************
 * Exemple de mise à jour "bloom" (optionnel)
 * => Faire des logs pour tester
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) return;

  cozyRouteLayer.setStyle((feature) => {
    if (!feature.properties) {
      console.log("Feature sans propriétés", feature);
      return { color: "#FFFFFF", weight: 3 };
    }

    let className = "";
    themes.forEach((t) => {
      const routeValue = feature.properties[t] || 0;
      const userValue = userData[t] || 0;
      const intensity = routeValue * userValue * 4;
      const intensityClamped = Math.min(intensity, 100);

      console.log(
        `Thème=${t}, routeValue=${routeValue}, userValue=${userValue}, intensity=${intensityClamped}`
      );

      if (routeValue > 0) {
        className += `${t}-${routeValue} intensity-${intensityClamped} `;
      }
    });

    const finalClass = className.trim();
    console.log("=> Classe assignée :", finalClass);

    return {
      color: "#FFFFFF",
      weight: 3,
      className: finalClass
    };
  });
}

/***********************************************
 * Exemple de mise à jour de questionnaire
 * (si on change un slider de 0 à 5)
 ***********************************************/
function updateQuestionValue(theme, value) {
  userData[theme] = parseInt(value, 10);
  document.getElementById(theme + "-value").textContent = value;
  // Si tu as un radarChart, mets-le à jour
  // updateRadarChart();
  // Mets à jour le style des routes
  updateRoadStyle();
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
      console.warn("Erreur géoloc :", err);
    },
    { enableHighAccuracy: true }
  );
}
