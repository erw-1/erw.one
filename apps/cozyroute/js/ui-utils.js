// js/ui-utils.js
// Fonctions utilitaires pour gérer l'overlay de chargement.

export function setLoadingMessage(msg) {
  const el = document.getElementById("loading-message");
  if (el) {
    el.textContent = msg;
  }
}

export function showLoading() {
  const splash = document.getElementById("loading-splash");
  if (splash) splash.classList.remove("hidden");
  setLoadingMessage("");
}

export function hideLoading() {
  const splash = document.getElementById("loading-splash");
  if (splash) splash.classList.add("hidden");
  setLoadingMessage("");
}
