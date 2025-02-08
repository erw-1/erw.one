// js/map.js
// Map initialization, marker management, and GPS handling for CozyRoute

import { ORS_API_KEY, themes, userData } from "./config.js";

// Global state variables related to the map.
export let map = null;
export let cozyRouteLayer = null;
export let routeLayer = null;
export let clickMarkers = [];
export let cozyRouteData = null;

export let gpsModeActive = false;
export let gpsWatchId = null;
export let gpsMarker = null;

/**
 * Initialize the Leaflet map and load the GeoJSON data.
 */
export function initMap() {
  map = L.map("map").setView([49.0389, 2.0760], 13);
  fetch("data/cozyroute.geojson")
    .then(resp => {
      if (!resp.ok) throw new Error("GeoJSON load error");
      return resp.json();
    })
    .then(data => {
      cozyRouteData = data;
      // Create a GeoJSON layer with a style based on the feature's properties.
      cozyRouteLayer = L.geoJSON(data, {
        style: feature => {
          const cls = feature.properties.class || "";
          const finalClass = (cls + " intensity-0").trim();
          return {
            color: "#FFFFFF",
            weight: 3,
            className: finalClass
          };
        }
      }).addTo(map);
      map.fitBounds(cozyRouteLayer.getBounds());
    })
    .catch(err => console.error(err));

  // Listen for map clicks to add markers.
  map.on("click", e => {
    handleMapClick(e.latlng);
  });
}

/**
 * Handle a map click event to add markers.
 * In GPS mode, if a starting (GPS) marker exists, add a destination marker.
 * Otherwise, add markers in the normal (non‑GPS) way.
 *
 * @param {Object} latlng - The {lat, lng} coordinates of the click.
 */
export function handleMapClick(latlng) {
  if (gpsModeActive && clickMarkers.length === 1) {
    // In GPS mode, add destination marker (black circle)
    const destMarker = L.circleMarker([latlng.lat, latlng.lng], {
      radius: 6,
      color: "black",
      fillColor: "black",
      fillOpacity: 1
    }).addTo(map);
    clickMarkers.push(destMarker);
  } else if (!gpsModeActive) {
    // In non‑GPS mode, clear markers if two already exist and then add a new marker.
    if (clickMarkers.length === 2) {
      clearRouteAndMarkers();
    }
    const marker = L.circleMarker([latlng.lat, latlng.lng], {
      radius: 6,
      color: "black",
      fillColor: "black",
      fillOpacity: 1
    }).addTo(map);
    clickMarkers.push(marker);
  }
  // If two markers are set, trigger route calculation.
  if (clickMarkers.length === 2 && window.getRoute) {
    const A = clickMarkers[0].getLatLng();
    const B = clickMarkers[1].getLatLng();
    window.getRoute(A.lat, A.lng, B.lat, B.lng);
  }
}

/**
 * Clear all route layers and markers from the map.
 */
export function clearRouteAndMarkers() {
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  clickMarkers.forEach(m => map.removeLayer(m));
  clickMarkers = [];
  if (gpsMarker) {
    map.removeLayer(gpsMarker);
    gpsMarker = null;
  }
}

/**
 * Toggle GPS mode. When activated, clears existing markers and starts geolocation tracking.
 */
export function toggleGpsMode() {
  gpsModeActive = !gpsModeActive;
  const btn = document.getElementById("mode-gps");
  if (gpsModeActive) {
    btn.classList.add("active");
    clearRouteAndMarkers();
    if (!gpsWatchId) {
      gpsWatchId = navigator.geolocation.watchPosition(updateGpsPosition, errorGps, { enableHighAccuracy: true });
    }
  } else {
    btn.classList.remove("active");
    if (gpsWatchId) {
      navigator.geolocation.clearWatch(gpsWatchId);
      gpsWatchId = null;
    }
    if (gpsMarker) {
      map.removeLayer(gpsMarker);
      gpsMarker = null;
    }
  }
}

/**
 * Update the GPS marker position as the device moves.
 *
 * @param {Object} position - The geolocation position object.
 */
export function updateGpsPosition(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  if (!gpsMarker) {
    // Create a dynamic GPS marker (blue circle)
    gpsMarker = L.circleMarker([lat, lng], {
      radius: 8,
      color: "#1976D2",
      fillColor: "#1976D2",
      fillOpacity: 1
    }).addTo(map);
    // Use the GPS marker as the starting point.
    clickMarkers = [gpsMarker];
  } else {
    gpsMarker.setLatLng([lat, lng]);
  }
}

/**
 * Log GPS errors.
 *
 * @param {Object} err - The geolocation error.
 */
export function errorGps(err) {
  console.error(err);
}
