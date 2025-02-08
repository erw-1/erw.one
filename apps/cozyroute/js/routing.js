// js/routing.js
// Routing logic: calculates avoid_polygons based on user sensitivity,
// fetches route data from OpenRouteService, and decodes polylines.

import { ORS_API_KEY, userData, themes } from "./config.js";
import { cozyRouteData } from "./map.js";
import { setLoadingMessage, showLoading, hideLoading } from "./ui-utils.js";

let routeLayer; // Local variable to hold the current route layer

/**
 * Calculate the avoid_polygons object based on the user's ratings and polygon intensity.
 * The conflict for a polygon is computed as:
 *    conflict = polygonIntensity × (userRating / 5)
 * A user rating of 5 (high intolerance) uses a multiplier of 1,
 * whereas a lower rating (e.g., 1) results in a multiplier of 0.2.
 * Only polygons with conflict >= cutoff are included.
 *
 * @param {number} cutoff - The threshold for conflict.
 * @returns {Object|null} A GeoJSON MultiPolygon object or null if no polygons qualify.
 */
export function getAvoidPolygons(cutoff = 0) {
  let polygons = [];
  if (!cozyRouteData || !cozyRouteData.features) return null;
  cozyRouteData.features.forEach(feature => {
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
 * Fetch a walking route from OpenRouteService using avoid_polygons options.
 * In case of failure, the cutoff is increased progressively to remove less conflicting polygons.
 *
 * @param {number} lat1 - Starting latitude.
 * @param {number} lng1 - Starting longitude.
 * @param {number} lat2 - Destination latitude.
 * @param {number} lng2 - Destination longitude.
 * @param {number} cutoff - The current conflict cutoff threshold.
 */
export function getRoute(lat1, lng1, lat2, lng2, cutoff = 0) {
  showLoading();
  // Prepare the request body.
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
      if (!r.ok) throw new Error("Routing error");
      return r.json();
    })
    .then(data => {
      if (!data || !data.routes || data.routes.length === 0) {
        throw new Error("No route found");
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
      // Add the route to the map.
      routeLayer = L.geoJSON(routeGeo, { style: { color: "#1976D2", weight: 4 } }).addTo(window.map);
      window.map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
      hideLoading();
      // Assume showDirectionsPanel is defined globally (or import it from another module).
      if (window.showDirectionsPanel) {
        window.showDirectionsPanel(route);
      }
    })
    .catch(err => {
      if (cutoff < 5) {
        const newCutoff = cutoff + 1;
        setLoadingMessage(`No route found; eliminating polygons with conflict below ${newCutoff}...`);
        setTimeout(() => {
          getRoute(lat1, lng1, lat2, lng2, newCutoff);
        }, 1500);
      } else {
        setLoadingMessage("No route found even after eliminating polygons with conflict below 5.");
        setTimeout(hideLoading, 3000);
      }
    });
}

/**
 * Decode an encoded polyline string into an array of [lat, lng] coordinates.
 * Implements the Google polyline decoding algorithm.
 *
 * @param {string} encoded - The encoded polyline.
 * @returns {Array} An array of coordinates [lat, lng].
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
