/***********************************************
 * Données et variables globales
 ***********************************************/

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

// Ordre des thèmes pour le radar Chart et le style
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

// Récupération des couleurs depuis le fichier CSS (variables :root)
const themeColors = {
  odorat: getComputedStyle(document.documentElement).getPropertyValue('--odorat-color'),
  marchabilite: getComputedStyle(document.documentElement).getPropertyValue('--marchabilite-color'),
  claustrophobie: getComputedStyle(document.documentElement).getPropertyValue('--claustrophobie-color'),
  agoraphobie: getComputedStyle(document.documentElement).getPropertyValue('--agoraphobie-color'),
  pollution: getComputedStyle(document.documentElement).getPropertyValue('--pollution-color'),
  bruit: getComputedStyle(document.documentElement).getPropertyValue('--bruit-color'),
  eclairage: getComputedStyle(document.documentElement).getPropertyValue('--eclairage-color'),
  handicap: getComputedStyle(document.documentElement).getPropertyValue('--handicap-color'),
  trafic_routier: getComputedStyle(document.documentElement).getPropertyValue('--trafic_routier-color')
};

// Références Leaflet
let map = null;               // Carte
let cozyRouteLayer = null;    // Couche contenant le GeoJSON des routes
let routeLayer = null;        // Couche contenant l’itinéraire OpenRouteService

// Tableau des marqueurs posés par clic
let clickMarkers = [];

// Coordonnées de l’utilisateur (optionnel)
let userLocation = null;  

// Référence au radarChart (Chart.js)
let radarChart = null;

// Clé API OpenRouteService
const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";

/***********************************************
 * Initialisation au chargement
 ***********************************************/
window.addEventListener('load', () => {
  initMap();
  initRadarChart();
});

/***********************************************
 * Initialisation de la carte Leaflet
 ***********************************************/
function initMap() {
  // Crée la carte sans fond (fond blanc)
  map = L.map('map', {
    zoomControl: true,
    attributionControl: false
  }).setView([49.0389, 2.0760], 13); // Centre approximatif sur Cergy

  // Chargement du GeoJSON (tes routes)
  fetch('cozyroute.geojson')
    .then(response => response.json())
    .then(geojsonData => {
      cozyRouteLayer = L.geoJSON(geojsonData, {
        style: feature => {
          // Style de base en blanc
          return {
            color: '#FFFFFF',
            weight: 3
          };
        }
      }).addTo(map);
      // Ajuste la vue à l’emprise des tronçons
      map.fitBounds(cozyRouteLayer.getBounds());
    })
    .catch(err => {
      console.error("Erreur chargement cozyroute.geojson :", err);
    });

  // Écouteur de clic sur la carte
  map.on('click', e => {
    handleMapClick(e.latlng);
  });
}

/***********************************************
 * Gestion du clic sur la carte
 * - Place un point (marqueur)
 * - Au deuxième clic, calcule un itinéraire
 * - Si un troisième clic survient, on supprime l'ancien itinéraire
 *   et on repart de zéro
 ***********************************************/
function handleMapClick(latlng) {
  // Si on a déjà 2 marqueurs, on supprime tout pour repartir
  if (clickMarkers.length === 2) {
    clearRouteAndMarkers();
  }

  // Ajout du nouveau marqueur
  const newMarker = L.marker([latlng.lat, latlng.lng]).addTo(map);
  clickMarkers.push(newMarker);

  // Si on a 2 marqueurs, on lance le routing
  if (clickMarkers.length === 2) {
    const latlngA = clickMarkers[0].getLatLng();
    const latlngB = clickMarkers[1].getLatLng();
    getRoute(latlngA.lat, latlngA.lng, latlngB.lat, latlngB.lng);
  }
}

/***********************************************
 * Efface l'itinéraire en cours et les marqueurs
 ***********************************************/
function clearRouteAndMarkers() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  clickMarkers.forEach(m => {
    map.removeLayer(m);
  });
  clickMarkers = [];
}

/***********************************************
 * Bouton pour la géolocalisation (optionnelle)
 * Appelé depuis index.html (e.g. <button id="btn-locate">Me localiser</button>)
 ***********************************************/
function askUserLocation() {
  if (!navigator.geolocation) {
    alert("La géolocalisation n'est pas supportée par ce navigateur.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      // Place un marqueur user
      const userMarker = L.marker([userLocation.lat, userLocation.lng]).addTo(map);
      map.setView([userLocation.lat, userLocation.lng], 14);
    },
    err => {
      console.warn("Impossible de récupérer la position :", err);
      alert("Impossible de récupérer la position.");
    },
    { enableHighAccuracy: true }
  );
}

/***********************************************
 * Radar Chart (Chart.js)
 ***********************************************/
function initRadarChart() {
  const ctx = document.getElementById('radarChart').getContext('2d');
  radarChart = new Chart(ctx, {
    type: 'radar',
    data: {
      labels: themes.map(t => t.charAt(0).toUpperCase() + t.slice(1)),
      datasets: [
        {
          label: 'Mon niveau de gêne',
          data: themes.map(t => userData[t]),
          backgroundColor: 'rgba(103, 58, 183, 0.2)',
          borderColor: 'rgba(103, 58, 183, 1)',
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        r: {
          min: 0,
          max: 5,
          ticks: {
            stepSize: 1
          }
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
 * Mise à jour du questionnaire
 ***********************************************/
function updateQuestionValue(theme, value) {
  // Met à jour la valeur interne
  userData[theme] = parseInt(value, 10);
  // Met à jour le label affiché (ex : <span id="odorat-value">)
  document.getElementById(theme + '-value').textContent = value;
  // Met à jour le radar chart
  updateRadarChart();
  // Met à jour le style des routes (bloom)
  updateRoadStyle();
}

/***********************************************
 * Mise à jour du style des routes en fonction
 * des réponses utilisateur (bloom)
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) return;

  cozyRouteLayer.setStyle(feature => {
    if (!feature.properties) {
      console.log("Aucun properties pour cette feature :", feature);
      return { color: '#FFFFFF', weight: 3 };
    }

    // Construction d'une classe dynamique
    let className = '';
    themes.forEach(t => {
      const routeValue = feature.properties[t] ? feature.properties[t] : 0;
      const userValue = userData[t] || 0;
      // intensité = routeValue * userValue * 4
      const intensity = routeValue * userValue * 4;
      const intensityClamped = Math.min(intensity, 100);

      // On log l'info pour debug
      console.log(`Feature ID=?, Thème=${t}, routeValue=${routeValue}, userValue=${userValue}, intensity=${intensityClamped}`);

      if (routeValue > 0) {
        className += `${t}-${routeValue} intensity-${intensityClamped} `;
      }
    });

    const finalClass = className.trim();
    console.log("=> Classe assignée :", finalClass);

    return {
      color: '#FFFFFF', // Couleur de base
      weight: 3,
      className: finalClass
    };
  });
}

/***********************************************
 * Calcul d'itinéraire (OpenRouteService)
 ***********************************************/
function getRoute(lat1, lng1, lat2, lng2) {
  // On retire un éventuel itinéraire précédent
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
      "Content-Type": "application/json",
      "Authorization": ORS_API_KEY
    },
    body: JSON.stringify(bodyData)
  })
    .then(res => res.json())
    .then(data => {
      if (!data || !data.features || data.features.length === 0) {
        alert("Impossible de calculer l’itinéraire.");
        return;
      }
      // On récupère la géométrie
      const routeGeoJSON = data.features[0];
      // On l'ajoute à la carte
      routeLayer = L.geoJSON(routeGeoJSON, {
        style: {
          color: '#1976D2',
          weight: 4
        }
      }).addTo(map);

      // Zoom sur l'itinéraire
      map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
    })
    .catch(err => {
      console.error("Erreur lors du calcul d'itinéraire :", err);
      alert("Erreur lors du calcul d'itinéraire.");
    });
}

/***********************************************
 * Boutons / Écouteurs divers
 ***********************************************/

// Bouton "Accéder à la carte"
document.getElementById('goto-map').addEventListener('click', () => {
  // Cache l'overlay questionnaire (slide left)
  document.getElementById('questionnaire-overlay').classList.add('hidden');
});

// Bouton burger (ouvre/ferme le questionnaire)
document.getElementById('burger-menu').addEventListener('click', () => {
  // Ouvre/ferme l'overlay questionnaire
  document.getElementById('questionnaire-overlay').classList.toggle('hidden');
});

// Bouton "search" (optionnel, si tu souhaites garder la recherche d'adresse)
document.getElementById('search-button').addEventListener('click', () => {
  const address = document.getElementById('search-input').value.trim();
  if (!address) {
    alert("Veuillez saisir une adresse.");
    return;
  }
  // On peut géocoder l'adresse, etc. (non obligatoire selon tes besoins)
  // geocodeAddress(address);
});

/**
 * Si tu utilises un bouton "Me localiser" (id="btn-locate"),
 * tu peux le relier à la fonction askUserLocation():
 *
 * document.getElementById('btn-locate').addEventListener('click', () => {
 *   askUserLocation();
 * });
 *
 */
