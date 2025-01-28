/***********************************************
 * script.js
 * ---------------------------------------------
 * Données : 
 *   feature.properties.class = "odorat-3" 
 *       => 1 thème + 1 valeur 
 *           (ex: "eclairage-2", "bruit-5", etc.)
 * 
 * Au chargement, on parse "odorat-3" en 
 *   => routeTheme = "odorat"
 *   => routeValue = 3
 * 
 * On affecte color=blanc + className=`odorat-3 intensity-0`
 * 
 * Ensuite, quand l'utilisateur bouge le slider "odorat",
 * on recalcule intensité = routeValue * userValue * 4
 * => si userValue=4, routeValue=3 => intensité=48 => clamp à 100
 * => "odorat-intensity-48"
 * 
 * => Au final, la classe = "odorat-3 odorat-intensity-48"
 * 
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
        // Pour chaque tronçon, on copie directement
        // la valeur feature.properties.class (ex: "odorat-3")
        // dans le style Leaflet
        style: (feature) => {
          // Classe venue du GeoJSON
          const geojsonClass = feature.properties.class || "";
          // Style de base + className
          return {
            color: "#FFFFFF",   // trait blanc
            weight: 3,          // épaisseur 3
            className: `${geojsonClass} intensity-0`
          };
        }
      }).addTo(map);

      // 4) Centrer la vue sur l'emprise de cozyrouteLayer
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
  const ctx = document.getElementById("radarChart").getContext("2d");
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
          max: 5,
          ticks: { stepSize: 1 }
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
 *    => On parse le routeTheme & routeValue,
 *       on calcule intensité => .odorat-intensity-60
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) return;

  cozyRouteLayer.eachLayer((layer) => {
    const feat = layer.feature;
    if (!feat || !feat.properties) return;

    // Récupère la routeTheme, routeValue
    const routeTheme = feat.properties._routeTheme || "";
    const routeValue = feat.properties._routeValue || 0;

    // Calcul intensité : routeValue * userData[routeTheme] * 4
    // ex: "marchabilite" => userData.marchabilite = 4, routeValue=2 => 2*4*4=32
    let intensityClass = "";
    if (routeTheme && routeValue > 0) {
      const userVal = userData[routeTheme] || 0;
      const intensity = userVal * routeValue * 4;
      const iClamp = Math.min(intensity, 100);

      // Ex: "odorat-intensity-60"
      intensityClass = `${routeTheme}-intensity-${iClamp}`;
    } else {
      // S'il n'y a pas de thème ou routeValue=0 => intensité=0
      intensityClass = `${routeTheme}-intensity-0`;
    }

    // La classe de base : "odorat-3" (déjà fixée)
    // Au chargement initial, on l'avait dans layer.options.className, 
    // mais Leaflet ne stocke pas forcément ça en dur. 
    // On peut la relire via "layer.options.className" :
    const baseClass = layer.options.className || "";

    // On veut remplacer l'ancienne intensité ... => 
    // +++ Simplicité : on met un "split" pour virer l'ancienne intensité, 
    //    ou on reconstruit depuis "routeTheme-routeValue" 
    //    si tu préfères la cohérence. 
    //    Ici, on va faire plus simple et 
    //    juste enjamber tout => "odorat-3 odorat-intensity-60"

    // On peut parser baseClass si on veut vraiment, 
    // ou alors on reconstruit depuis routeTheme-routeValue 
    // (car on sait la routeValue).
    const newClassName = `${routeTheme}-${routeValue} ${intensityClass}`.trim();

    layer.setStyle({
      color: "#FFFFFF",
      weight: 3,
      className: newClassName
    });
  });
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
