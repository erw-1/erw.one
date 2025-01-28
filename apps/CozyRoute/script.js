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
  trafic_routier: 0,
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
  trafic_routier: getComputedStyle(document.documentElement).getPropertyValue('--trafic_routier-color'),
};

// Références Leaflet
let map = null;               // Carte
let cozyRouteLayer = null;    // Couche contenant le GeoJSON des routes
let routeLayer = null;        // Couche contenant l’itinéraire OpenRouteService
let userMarker = null;        // Marqueur de la position utilisateur
let addressMarker = null;     // Marqueur de la position recherchée

// Coordonnées de l’utilisateur
let userLocation = null;  

// Référence au radarChart (Chart.js)
let radarChart = null;

// Clé API OpenRouteService (exemple)
const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";

/***********************************************
 * Initialisation
 ***********************************************/

// Dès le chargement du document, on initialise la carte et le radar
window.addEventListener('load', () => {
  initMap();
  initRadarChart();
  askUserLocation(); // Demande la position de l'utilisateur
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
          // Style de base en blanc, poids 3
          return {
            color: '#FFFFFF',
            weight: 3,
          };
        }
      }).addTo(map);

      // Ajuste la vue à l’emprise des tronçons
      map.fitBounds(cozyRouteLayer.getBounds());
    })
    .catch(err => {
      console.error("Erreur chargement cozyroute.geojson :", err);
    });
}

/***********************************************
 * Demande position utilisateur (géolocalisation)
 ***********************************************/
function askUserLocation() {
  if (!navigator.geolocation) {
    console.warn("La géolocalisation n'est pas supportée par ce navigateur.");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    pos => {
      userLocation = {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude
      };
      // Place le marqueur user
      if (userMarker) {
        map.removeLayer(userMarker);
      }
      userMarker = L.marker([userLocation.lat, userLocation.lng]).addTo(map);
      map.setView([userLocation.lat, userLocation.lng], 14);
    },
    err => {
      console.warn("Impossible de récupérer la position :", err);
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
  // Met à jour le label affiché (par ex. <span>…</span>)
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
    // Pour chaque theme, on va calculer un "intensity"
    // intensity = routeValue * userValue * 4
    // (0 à 25, potentiellement plus si 5*5*4=100, à toi d'adapter)
    // Ici on va créer une classe dynamique pour chaque route, 
    // qui servira de hook pour ajouter des effets CSS

    let className = '';
    themes.forEach(t => {
      const routeValue = feature.properties && feature.properties[t] ? feature.properties[t] : 0;
      const userValue = userData[t] || 0;
      const intensity = routeValue * userValue * 4; // ex: 5 * 5 * 4 = 100
      const intensityClamped = Math.min(intensity, 100);
      if (routeValue > 0) {
        className += `${t}-${routeValue} intensity-${intensityClamped} `;
      }
    });

    return {
      color: '#FFFFFF', // Couleur de base du tronçon
      weight: 3,
      className: className.trim() // on associe la classe
    };
  });
}

/***********************************************
 * Écouteurs d'événements (boutons, etc.)
 ***********************************************/

document.getElementById('goto-map').addEventListener('click', () => {
  // Cache l'overlay questionnaire (slide left)
  document.getElementById('questionnaire-overlay').classList.add('hidden');
});

document.getElementById('burger-menu').addEventListener('click', () => {
  // Ouvre/ferme l'overlay questionnaire
  document.getElementById('questionnaire-overlay').classList.toggle('hidden');
});

document.getElementById('search-button').addEventListener('click', () => {
  const address = document.getElementById('search-input').value.trim();
  if (!address) {
    alert("Veuillez saisir une adresse.");
    return;
  }
  // On va géocoder l'adresse, puis tracer un itinéraire si la géoloc user est connue
  geocodeAddress(address);
});

/***********************************************
 * Géocodage (OpenRouteService)
 ***********************************************/
function geocodeAddress(address) {
  // Endpoint ORS pour la recherche d’adresse
  const geocodeUrl = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(address)}`;

  fetch(geocodeUrl)
    .then(res => res.json())
    .then(data => {
      if (
        data &&
        data.features &&
        data.features.length > 0 &&
        data.features[0].geometry
      ) {
        const coords = data.features[0].geometry.coordinates;
        const lng = coords[0];
        const lat = coords[1];

        if (addressMarker) {
          map.removeLayer(addressMarker);
        }
        addressMarker = L.marker([lat, lng]).addTo(map);

        // On centre la carte sur l’adresse
        map.setView([lat, lng], 14);

        // Si on a aussi la position de l'utilisateur, on peut tracer l'itinéraire
        if (userLocation) {
          getRoute(userLocation.lat, userLocation.lng, lat, lng);
        }
      } else {
        alert("Adresse introuvable ou résultats vides.");
      }
    })
    .catch(err => {
      console.error("Erreur lors du géocodage :", err);
      alert("Erreur lors du géocodage.");
    });
}

/***********************************************
 * Récupération d'itinéraire (OpenRouteService)
 ***********************************************/
function getRoute(lat1, lng1, lat2, lng2) {
  // Endpoint ORS pour le calcul d’itinéraire
  // On envoie une requête POST au endpoint Directions
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

    // On retire un éventuel itinéraire précédent
    if (routeLayer) {
      map.removeLayer(routeLayer);
    }

    // On récupère la géométrie (type LineString)
    const routeGeoJSON = data.features[0];
    
    // On ajoute la route à la carte
    routeLayer = L.geoJSON(routeGeoJSON, {
      style: {
        color: '#1976D2',
        weight: 4
      }
    }).addTo(map);

    // On ajuste la vue
    map.fitBounds(routeLayer.getBounds(), {
      padding: [20, 20]
    });
  })
  .catch(err => {
    console.error("Erreur lors du calcul d'itinéraire :", err);
    alert("Erreur lors du calcul d'itinéraire.");
  });
}
