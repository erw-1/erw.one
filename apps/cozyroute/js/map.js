// js/map.js
// Initialisation de la carte Leaflet, gestion des marqueurs et du mode GPS

import { ORS_API_KEY, themes, userData } from "./config.js";

// Variables globales liées à la carte.
export let map = null;
export let cozyRouteLayer = null;
export let routeLayer = null;
export let clickMarkers = [];
export let cozyRouteData = null;

export let gpsModeActive = false;
export let gpsWatchId = null;
export let gpsMarker = null;

/**
 * Initialise la carte Leaflet et charge les données GeoJSON.
 */
export function initMap() {
  map = L.map("map").setView([49.0389, 2.0760], 13);
  fetch("data/cozyroute.geojson")
    .then(resp => {
      if (!resp.ok) throw new Error("Erreur lors du chargement du GeoJSON");
      return resp.json();
    })
    .then(data => {
      cozyRouteData = data;
      // Création d'une couche GeoJSON avec un style basé sur les propriétés.
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

  // Écoute des clics sur la carte.
  map.on("click", e => {
    handleMapClick(e.latlng);
  });
}

/**
 * Gère le clic sur la carte pour ajouter des marqueurs.
 * En mode GPS, si le marqueur GPS existe, le clic ajoute un marqueur de destination.
 * Sinon, les marqueurs sont ajoutés normalement.
 * @param {Object} latlng - Un objet {lat, lng}.
 */
export function handleMapClick(latlng) {
  if (gpsModeActive && clickMarkers.length === 1) {
    // En mode GPS : ajouter un marqueur de destination (rond noir)
    const destMarker = L.circleMarker([latlng.lat, latlng.lng], {
      radius: 6,
      color: "black",
      fillColor: "black",
      fillOpacity: 1
    }).addTo(map);
    clickMarkers.push(destMarker);
  } else if (!gpsModeActive) {
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
  // Si deux marqueurs sont présents, lancer le calcul de l'itinéraire.
  if (clickMarkers.length === 2 && window.getRoute) {
    const A = clickMarkers[0].getLatLng();
    const B = clickMarkers[1].getLatLng();
    window.getRoute(A.lat, A.lng, B.lat, B.lng);
  }
}

/**
 * Supprime toutes les couches de l'itinéraire et les marqueurs de la carte.
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
 * Bascule le mode GPS : efface les marqueurs existants et démarre/arrête la géolocalisation.
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
 * Met à jour la position du marqueur GPS au fur et à mesure du déplacement.
 * @param {Object} position - L'objet position retourné par la géolocalisation.
 */
export function updateGpsPosition(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  if (!gpsMarker) {
    // Création d'un marqueur dynamique pour le mode GPS (rond bleu)
    gpsMarker = L.circleMarker([lat, lng], {
      radius: 8,
      color: "#1976D2",
      fillColor: "#1976D2",
      fillOpacity: 1
    }).addTo(map);
    // Ce marqueur devient le point de départ.
    clickMarkers = [gpsMarker];
  } else {
    gpsMarker.setLatLng([lat, lng]);
  }
}

/**
 * Affiche les erreurs de géolocalisation dans la console.
 * @param {Object} err - L'erreur de géolocalisation.
 */
export function errorGps(err) {
  console.error(err);
}
