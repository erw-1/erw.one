// js/ui.js
// Initialisation de l'interface et fonctions d'assistance pour l'autocomplétion et la gestion des événements.

import { ORS_API_KEY, lastSuggestions } from "./config.js";
import { handleMapClick } from "./map.js";

/**
 * Initialise les boutons de l'interface (menu burger, bouton de recherche, etc.).
 */
export function initUIButtons() {
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
      handleEnterPress();
    });
  }
}

/**
 * Initialise les événements liés au champ de recherche (entrée et autocomplétion).
 */
export function initSearchInputEvents() {
  const input = document.getElementById("search-input");
  if (!input) return;
  input.addEventListener("input", (e) => {
    onAddressInput(e.target.value);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEnterPress();
    }
  });
}

/**
 * Gère la touche "Entrée" pour sélectionner la première suggestion.
 */
export function handleEnterPress() {
  if (lastSuggestions.length > 0) {
    const first = lastSuggestions[0];
    handleMapClick({ lat: first.coord[0], lng: first.coord[1] });
    displaySuggestions([]);
    document.getElementById("search-input").blur();
  }
}

/**
 * Traite la saisie utilisateur pour l'autocomplétion.
 * @param {string} val - La valeur saisie dans le champ.
 */
export function onAddressInput(val) {
  if (val.length < 4) {
    displaySuggestions([]);
    return;
  }
  geocodeORS(val)
    .then(sugs => {
      lastSuggestions.splice(0, lastSuggestions.length, ...sugs.slice(0, 3));
      displaySuggestions(lastSuggestions);
    })
    .catch(err => {
      lastSuggestions.splice(0, lastSuggestions.length);
      displaySuggestions([]);
    });
}

/**
 * Interroge l'API de géocodage d'OpenRouteService pour obtenir des suggestions.
 * @param {string} query - La requête d'adresse.
 * @returns {Promise<Array>} Une promesse résolvant un tableau de suggestions.
 */
export function geocodeORS(query) {
  const url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${ORS_API_KEY}&text=${encodeURIComponent(query)}`;
  return fetch(url)
    .then(r => {
      if (!r.ok) throw new Error("Erreur de géocodage");
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
 * Affiche les suggestions d'autocomplétion dans l'interface.
 * @param {Array} list - Tableau d'objets suggestion.
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
