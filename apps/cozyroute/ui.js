/**
 * ui.js
 * Module de gestion des interactions de l'interface utilisateur.
 */
import { Globals } from "./globals.js";
import { handleMapClick, updateGpsPosition, errorGps, clearRouteAndMarkers } from "./map.js";
import { geocodeORS } from "./routing.js";

/**
 * Initialise les événements des boutons de l'interface.
 */
export function initUIButtons() {
  // Bouton pour fermer le questionnaire et afficher la carte.
  const gotoMapBtn = document.getElementById("goto-map");
  if (gotoMapBtn) {
    gotoMapBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.add("hidden");
    });
  }

  // Bouton "burger" pour afficher/masquer le questionnaire.
  const burgerBtn = document.getElementById("burger-menu");
  if (burgerBtn) {
    burgerBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.toggle("hidden");
    });
  }

  // (Optionnel) Bouton de recherche, si présent.
  const searchBtn = document.getElementById("search-button");
  if (searchBtn) {
    searchBtn.addEventListener("click", () => {
      const address = document.getElementById("search-input").value.trim();
      if (!address) {
        alert("Veuillez saisir une adresse.");
        return;
      }
      handleEnterPress();
    });
  }
}

/**
 * Initialise les événements du champ de recherche.
 */
export function initSearchInputEvents() {
  const input = document.getElementById("search-input");
  if (!input) return;

  // Affiche les suggestions lors de la saisie.
  input.addEventListener("input", (e) => {
    onAddressInput(e.target.value);
  });
  // Gère la touche "Entrée".
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEnterPress();
    }
  });
}

/**
 * Gère l'appui sur "Entrée" dans le champ de recherche.
 * Utilise la première suggestion pour centrer la carte.
 */
export function handleEnterPress() {
  if (Globals.lastSuggestions.length > 0) {
    const first = Globals.lastSuggestions[0];
    handleMapClick({ lat: first.coord[0], lng: first.coord[1] });
    displaySuggestions([]);
    document.getElementById("search-input").blur();
  }
}

/**
 * Met à jour et affiche les suggestions d'adresses.
 * @param {string} val - Texte saisi par l'utilisateur.
 */
export function onAddressInput(val) {
  if (val.length < 4) {
    displaySuggestions([]);
    return;
  }
  geocodeORS(val)
    .then(sugs => {
      Globals.lastSuggestions = sugs.slice(0, 3);
      displaySuggestions(Globals.lastSuggestions);
    })
    .catch(err => {
      Globals.lastSuggestions = [];
      displaySuggestions([]);
    });
}

/**
 * Affiche la liste des suggestions sous le champ de recherche.
 * @param {Array} list - Liste de suggestions.
 */
export function displaySuggestions(list) {
  const container = document.getElementById("autocomplete-results");
  if (!container) return;
  container.innerHTML = "";
  list.forEach(item => {
    const li = document.createElement("li");
    li.textContent = item.label;
    li.style.cursor = "pointer";
    li.addEventListener("click", () => {
      handleMapClick({ lat: item.coord[0], lng: item.coord[1] });
      container.innerHTML = "";
      document.getElementById("search-input").blur();
    });
    container.appendChild(li);
  });
}

/**
 * Bascule l'activation du mode GPS.
 * En mode activé, la position de l'utilisateur est suivie et affichée sur la carte.
 */
export function toggleGpsMode() {
  Globals.gpsModeActive = !Globals.gpsModeActive;
  const btn = document.getElementById("mode-gps");
  if (Globals.gpsModeActive) {
    btn.classList.add("active");
    // Effacer les marqueurs et l'itinéraire existants.
    clearRouteAndMarkers();
    // Démarrer le suivi GPS si non déjà actif.
    if (!Globals.gpsWatchId) {
      Globals.gpsWatchId = navigator.geolocation.watchPosition(
        updateGpsPosition,
        errorGps,
        { enableHighAccuracy: true }
      );
    }
  } else {
    btn.classList.remove("active");
    if (Globals.gpsWatchId) {
      navigator.geolocation.clearWatch(Globals.gpsWatchId);
      Globals.gpsWatchId = null;
    }
    if (Globals.gpsMarker) {
      Globals.map.removeLayer(Globals.gpsMarker);
      Globals.gpsMarker = null;
    }
  }
}
