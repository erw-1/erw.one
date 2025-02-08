/**
 * map.js
 * Module de gestion de la carte et des interactions géographiques.
 */
import { Globals } from "./globals.js";
import { getRoute } from "./routing.js";

/**
 * Initialise la carte Leaflet, charge le GeoJSON et définit l'écouteur de clic.
 */
export function initMap() {
  // Création de la carte centrée sur une position par défaut.
  Globals.map = L.map("map").setView([49.0389, 2.0760], 13);

  // Chargement du fichier GeoJSON contenant les zones de gêne.
  fetch("cozyroute.geojson")
    .then(resp => {
      if (!resp.ok) throw new Error("Erreur lors du chargement du GeoJSON");
      return resp.json();
    })
    .then(data => {
      Globals.cozyRouteData = data;
      // Ajout de la couche GeoJSON avec un style par défaut.
      Globals.cozyRouteLayer = L.geoJSON(data, {
        style: feature => {
          const c = feature.properties.class || "";
          const finalClass = (c + " intensity-0").trim();
          return {
            color: "#FFFFFF",
            weight: 3,
            className: finalClass
          };
        }
      }).addTo(Globals.map);
      // Ajustement de la vue pour englober tous les polygones.
      Globals.map.fitBounds(Globals.cozyRouteLayer.getBounds());
    })
    .catch(err => console.error(err));

  // Ajout d'un écouteur pour les clics sur la carte.
  Globals.map.on("click", e => {
    handleMapClick(e.latlng);
  });
}

/**
 * Gère le clic sur la carte : ajoute un marqueur et, si deux sont présents,
 * lance le calcul de l'itinéraire.
 * @param {Object} latlng - Objet contenant les propriétés lat et lng.
 */
export function handleMapClick(latlng) {
  // En mode GPS, le premier marqueur est la position actuelle.
  if (Globals.gpsModeActive && Globals.clickMarkers.length === 1) {
    const destMarker = L.circleMarker([latlng.lat, latlng.lng], {
      radius: 6,
      color: "black",
      fillColor: "black",
      fillOpacity: 1
    }).addTo(Globals.map);
    Globals.clickMarkers.push(destMarker);
  }
  // En mode non-GPS, gestion classique du placement des marqueurs.
  else if (!Globals.gpsModeActive) {
    // Si deux marqueurs existent déjà, les effacer pour un nouveau calcul.
    if (Globals.clickMarkers.length === 2) {
      clearRouteAndMarkers();
    }
    const marker = L.circleMarker([latlng.lat, latlng.lng], {
      radius: 6,
      color: "black",
      fillColor: "black",
      fillOpacity: 1
    }).addTo(Globals.map);
    Globals.clickMarkers.push(marker);
  }
  // Dès que deux marqueurs sont présents, on calcule l'itinéraire.
  if (Globals.clickMarkers.length === 2) {
    const A = Globals.clickMarkers[0].getLatLng();
    const B = Globals.clickMarkers[1].getLatLng();
    getRoute(A.lat, A.lng, B.lat, B.lng);
  }
}

/**
 * Met à jour la position du marqueur GPS sur la carte.
 * @param {Position} position - Objet retourné par l'API de géolocalisation.
 */
export function updateGpsPosition(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  if (!Globals.gpsMarker) {
    // Création du marqueur GPS (cercle bleu) pour la position actuelle.
    Globals.gpsMarker = L.circleMarker([lat, lng], {
      radius: 8,
      color: "#1976D2",
      fillColor: "#1976D2",
      fillOpacity: 1
    }).addTo(Globals.map);
    // Le marqueur GPS devient le point de départ.
    Globals.clickMarkers = [Globals.gpsMarker];
  } else {
    // Mise à jour de la position du marqueur existant.
    Globals.gpsMarker.setLatLng([lat, lng]);
  }
}

/**
 * Gère les erreurs liées à la géolocalisation.
 * @param {Error} err - Erreur retournée par l'API de géolocalisation.
 */
export function errorGps(err) {
  console.error(err);
}

/**
 * Efface les marqueurs et l'itinéraire existants sur la carte.
 */
export function clearRouteAndMarkers() {
  if (Globals.routeLayer) {
    Globals.map.removeLayer(Globals.routeLayer);
    Globals.routeLayer = null;
  }
  Globals.clickMarkers.forEach(m => Globals.map.removeLayer(m));
  Globals.clickMarkers = [];
  if (Globals.gpsMarker) {
    Globals.map.removeLayer(Globals.gpsMarker);
    Globals.gpsMarker = null;
  }
}

/**
 * Met à jour le style des polygones de la couche GeoJSON en fonction des préférences utilisateur.
 */
export function updateRoadStyle() {
  if (!Globals.cozyRouteLayer) return;
  for (const theme of Globals.themes) {
    const userVal = Globals.userData[theme];
    Globals.cozyRouteLayer.eachLayer(layer => {
      const oldClass = layer.options.className || "";
      if (oldClass.includes(theme + "-")) {
        const newClass = oldClass.replace(/intensity-\d+/, `intensity-${userVal}`);
        layer.setStyle({ color: "#FFFFFF", weight: 3 });
        if (layer._path) {
          layer._path.setAttribute("class", newClass + " leaflet-interactive");
        }
        layer.options.className = newClass;
      }
    });
  }
}

/**
 * Demande la géolocalisation de l'utilisateur et ajoute sa position sur la carte.
 */
export function askUserLocation() {
  if (!navigator.geolocation) {
    alert("La géolocalisation n'est pas supportée par votre navigateur.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude,
            lng = pos.coords.longitude;
      handleMapClick({ lat, lng });
    },
    err => {
      console.warn(err);
    },
    { enableHighAccuracy: true }
  );
}
