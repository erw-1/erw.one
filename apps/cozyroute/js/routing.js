// js/routing.js
// Logique de routage : calcule les zones d'évitement en fonction des gênes,
// effectue l'appel à l'API d'OpenRouteService et décode la polyline.

import { ORS_API_KEY, userData, themes } from "./config.js";
import { setLoadingMessage, showLoading, hideLoading } from "./ui-utils.js";

/**
 * Calcule l'objet avoid_polygons en fonction des notes utilisateur et de l'intensité du polygone.
 * Le conflit est calculé ainsi :
 *    conflit = intensité du polygone × (note utilisateur / 5)
 * Une note utilisateur de 5 (intolérance élevée) donne un multiplicateur de 1,
 * tandis qu'une note faible (par exemple 1) donne un multiplicateur de 0,2.
 * Seuls les polygones dont le conflit est supérieur ou égal au cutoff sont retenus.
 *
 * @param {number} cutoff - Seuil de conflit.
 * @returns {Object|null} Un objet GeoJSON MultiPolygon ou null.
 */
export function getAvoidPolygons(cutoff = 0) {
  let polygons = [];
  if (!window.cozyRouteData || !window.cozyRouteData.features) return null;
  window.cozyRouteData.features.forEach(feature => {
    const cls = feature.properties.class;
    const match = cls.match(/^([a-z_]+)-(\d+)$/);
    if (match) {
      const theme = match[1];
      const polyIntensity = parseInt(match[2], 10);
      if (userData[theme] > 0) {
        const conflict = polyIntensity * (userData[theme] / 5);
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
 * Récupère un itinéraire pédestre depuis OpenRouteService en utilisant les options avoid_polygons.
 * En cas d'échec, le cutoff est progressivement augmenté pour éliminer les polygones à conflit faible.
 *
 * @param {number} lat1 - Latitude de départ.
 * @param {number} lng1 - Longitude de départ.
 * @param {number} lat2 - Latitude de destination.
 * @param {number} lng2 - Longitude de destination.
 * @param {number} cutoff - Seuil de conflit courant.
 */
export function getRoute(lat1, lng1, lat2, lng2, cutoff = 0) {
  showLoading();
  const bodyData = {
    coordinates: [[lng1, lat1], [lng2, lat2]],
    language: "fr",
    instructions: true
  };
  const avoid = getAvoidPolygons(cutoff);
  if (avoid) {
    bodyData.options = { avoid_polygons: avoid };
  }
  fetch("https://api.openrouteservice.org/v2/directions/foot-walking", {
    method: "POST",
    headers: {
      "accept": "*/*",
      "authorization": ORS_API_KEY,
      "content-type": "application/json"
    },
    body: JSON.stringify(bodyData)
  })
    .then(r => {
      if (!r.ok) throw new Error("Erreur de routage");
      return r.json();
    })
    .then(data => {
      if (!data || !data.routes || data.routes.length === 0) {
        throw new Error("Aucun itinéraire trouvé");
      }
      const route = data.routes[0];
      const dec = decodePolyline(route.geometry);
      const routeGeo = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: dec.map(([la, ln]) => [ln, la])
        },
        properties: {}
      };
      // Ajoute la couche d'itinéraire sur la carte.
      const routeLayer = L.geoJSON(routeGeo, { style: { color: "#1976D2", weight: 4 } }).addTo(window.map);
      window.map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
      hideLoading();
      if (window.showDirectionsPanel) {
        window.showDirectionsPanel(route);
      }
    })
    .catch(err => {
      if (cutoff < 5) {
        const newCutoff = cutoff + 1;
        setLoadingMessage(`Aucun itinéraire trouvé ; élimination des polygones avec conflit inférieur à ${newCutoff}...`);
        setTimeout(() => {
          getRoute(lat1, lng1, lat2, lng2, newCutoff);
        }, 1500);
      } else {
        setLoadingMessage("Aucun itinéraire trouvé même après élimination des polygones avec conflit inférieur à 5.");
        setTimeout(hideLoading, 3000);
      }
    });
}

/**
 * Décode une polyline encodée en un tableau de coordonnées [lat, lng].
 * Implémente l'algorithme de décodage de polyline de Google.
 *
 * @param {string} encoded - La polyline encodée.
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
