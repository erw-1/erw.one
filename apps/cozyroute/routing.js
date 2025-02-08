/**
 * routing.js
 * Module de gestion du calcul d'itinéraire et du géocodage.
 */
import { Globals } from "./globals.js";

/**
 * Appelle l'API de géocodage d'OpenRouteService pour récupérer des suggestions d'adresses.
 * @param {string} query - Requête d'adresse.
 * @returns {Promise<Array>} Liste d'objets avec label et coordonnées.
 */
export function geocodeORS(query) {
  const url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${Globals.ORS_API_KEY}&text=${encodeURIComponent(query)}`;
  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error("Erreur lors du géocodage");
      return r.json();
    })
    .then(data => {
      if (!data || !data.features) return [];
      return data.features.map(f => ({
        label: f.properties.label,
        coord: [f.geometry.coordinates[1], f.geometry.coordinates[0]]
      }));
    });
}

/**
 * Affiche le panneau d'itinéraire avec un résumé et la liste des étapes.
 * @param {Object} route - Objet contenant les informations de l'itinéraire.
 */
export function showDirectionsPanel(route) {
  const panel = document.getElementById("directions-panel");
  panel.classList.remove("hidden");
  const dist = (route.summary.distance / 1000).toFixed(2);
  const dur = (route.summary.duration / 60).toFixed(0);
  document.getElementById("directions-summary").textContent =
    `Distance : ${dist} km | Durée : ~${dur} min`;

  const stepsUl = document.getElementById("directions-steps");
  stepsUl.innerHTML = "";
  if (route.segments && route.segments.length > 0) {
    route.segments.forEach(seg => {
      seg.steps.forEach(step => {
        const li = document.createElement("li");
        const stDist = (step.distance || 0).toFixed(0);
        const instr = step.instruction || "";
        const name = (step.name && step.name !== "-") ? `(${step.name})` : "";
        li.textContent = `${stDist} m - ${instr} ${name}`;
        stepsUl.appendChild(li);
      });
    });
  }
}

/**
 * Initialise le panneau d'itinéraire en ajoutant le bouton de fermeture.
 */
export function initDirectionsPanel() {
  const closeBtn = document.getElementById("close-directions");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("directions-panel").classList.add("hidden");
    });
  }
}

/**
 * Décode une polyline encodée en tableau de coordonnées.
 * @param {string} encoded - Chaîne encodée.
 * @returns {Array} Tableau de coordonnées [lat, lng].
 */
export function decodePolyline(encoded) {
  let currentPosition = 0, currentLat = 0, currentLng = 0;
  const coords = [];
  while (currentPosition < encoded.length) {
    let shift = 0, result = 0, byte = null;
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
    coords.push([currentLat / 1e5, currentLng / 1e5]);
  }
  return coords;
}

/**
 * Calcule l'itinéraire pédestre via l'API OpenRouteService.
 * Prend en compte les zones à éviter selon les préférences utilisateur.
 * @param {number} lat1 - Latitude du point de départ.
 * @param {number} lng1 - Longitude du point de départ.
 * @param {number} lat2 - Latitude de la destination.
 * @param {number} lng2 - Longitude de la destination.
 * @param {number} cutoff - Seuil minimal de conflit.
 */
export function getRoute(lat1, lng1, lat2, lng2, cutoff = 0) {
  // Affiche l'écran de chargement.
  showLoading();

  // Suppression de l'itinéraire existant, le cas échéant.
  if (Globals.routeLayer) {
    Globals.map.removeLayer(Globals.routeLayer);
    Globals.routeLayer = null;
  }
  // Prépare les données pour la requête à l'API.
  const bodyData = {
    coordinates: [[lng1, lat1], [lng2, lat2]],
    language: "fr",
    instructions: true
  };

  // Ajoute les polygones à éviter en fonction des préférences.
  const avoid = getAvoidPolygons(cutoff);
  if (avoid) {
    bodyData.options = { avoid_polygons: avoid };
  }

  fetch("https://api.openrouteservice.org/v2/directions/foot-walking", {
    method: "POST",
    headers: {
      "accept": "*/*",
      "authorization": Globals.ORS_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify(bodyData)
  })
    .then(r => {
      if (!r.ok) throw new Error("Erreur lors du calcul de l'itinéraire");
      return r.json();
    })
    .then(data => {
      if (!data || !data.routes || data.routes.length === 0) {
        throw new Error("Aucun itinéraire trouvé");
      }
      const route = data.routes[0];
      // Décodage de la polyline encodée en tableau de coordonnées.
      const dec = decodePolyline(route.geometry);
      const routeGeo = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: dec.map(([la, ln]) => [ln, la])
        },
        properties: {}
      };
      // Affichage de l'itinéraire sur la carte.
      Globals.routeLayer = L.geoJSON(routeGeo, { style: { color: "#1976D2", weight: 4 } }).addTo(Globals.map);
      Globals.map.fitBounds(Globals.routeLayer.getBounds(), { padding: [20, 20] });
      hideLoading();
      showDirectionsPanel(route);
    })
    .catch(err => {
      if (cutoff < 5) {
        let newCutoff = cutoff + 1;
        setLoadingMessage(`Pas de chemin trouvé, élimination des polygones avec un conflit inférieur à ${newCutoff}...`);
        setTimeout(() => {
          getRoute(lat1, lng1, lat2, lng2, newCutoff);
        }, 1500);
      } else {
        setLoadingMessage("Pas de chemin trouvé même en éliminant toutes les gênes avec un conflit inférieur à 5.");
        setTimeout(hideLoading, 3000);
      }
    });
}

/**
 * Calcule les polygones à éviter en fonction des préférences utilisateur.
 * Pour chaque polygone, le conflit est calculé :
 *   conflit = intensité du polygone × (note utilisateur / 5)
 * Seuls les polygones dont le conflit est supérieur ou égal au cutoff sont inclus.
 * @param {number} cutoff - Seuil minimal de conflit.
 * @returns {Object|null} Objet MultiPolygon ou null.
 */
export function getAvoidPolygons(cutoff = 0) {
  let polygons = [];
  if (!Globals.cozyRouteData || !Globals.cozyRouteData.features) return null;

  Globals.cozyRouteData.features.forEach(feature => {
    let cls = feature.properties.class;
    let match = cls.match(/^([a-z_]+)-(\d+)$/);
    if (match) {
      let theme = match[1];
      let polyIntensity = parseInt(match[2], 10);
      if (Globals.userData[theme] > 0) {
        let conflict = polyIntensity * (Globals.userData[theme] / 5);
        if (conflict >= cutoff) {
          if (feature.geometry.type === "MultiPolygon") {
            polygons.push(...feature.geometry.coordinates);
          } else if (feature.geometry.type === "Polygon") {
            polygons.push(feature.geometry.coordinates);
          }
        }
      }
    }
  });
  if (polygons.length === 0) return null;
  return {
    type: "MultiPolygon",
    coordinates: polygons
  };
}

/**
 * Définit le message à afficher dans l'écran de chargement.
 * @param {string} msg - Message à afficher.
 */
export function setLoadingMessage(msg) {
  const el = document.getElementById("loading-message");
  if (el) {
    el.textContent = msg;
  }
}

/**
 * Affiche l'écran de chargement et réinitialise le message.
 */
export function showLoading() {
  const splash = document.getElementById("loading-splash");
  if (splash) splash.classList.remove("hidden");
  setLoadingMessage("");
}

/**
 * Masque l'écran de chargement.
 */
export function hideLoading() {
  const splash = document.getElementById("loading-splash");
  if (splash) splash.classList.add("hidden");
  setLoadingMessage("");
}
