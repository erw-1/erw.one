/*********************************************************************
 * CozyRoute - Script principal
 * Gère la carte, le questionnaire, la recherche d'adresses, le mode GPS
 * et le calcul d'itinéraire en fonction des préférences de l'utilisateur.
 *********************************************************************/

// Clé API OpenRouteService
const ORS_API_KEY = "5b3ce3597851110001cf624873a9f82e7dce4b46a1e049860a2c461d";

// Stockage des préférences utilisateur pour chacun des thèmes
let userData = {
  odorat: 0,
  marchabilite: 0,
  claustrophobie: 0,
  agoraphobie: 0,
  pollution: 0,
  bruit: 0,
  eclairage: 0,
  handicap: 0,
  trafic_routier: 0
};

// Variables globales pour la gestion de la carte et des itinéraires
let map = null;
let cozyRouteLayer = null;
let routeLayer = null;
let clickMarkers = [];
let cozyRouteData = null;

// Variables pour le graphique radar (profil utilisateur)
let radarChart = null;
const themes = [
  "odorat", "marchabilite", "claustrophobie", "agoraphobie", "pollution",
  "bruit", "eclairage", "handicap", "trafic_routier"
];

// Variables pour la recherche d'adresses
let lastSuggestions = [];

// Variables pour le mode GPS
let gpsModeActive = false;
let gpsWatchId = null;
let gpsMarker = null;

/**
 * Initialisation dès le chargement de la fenêtre.
 */
window.addEventListener("load", () => {
  initMap();
  initDirectionsPanel();
  initRadarChart();
  initUIButtons();
  initSearchInputEvents();

  // Activation du bouton mode GPS
  const modeGpsBtn = document.getElementById("mode-gps");
  if (modeGpsBtn) {
    modeGpsBtn.addEventListener("click", toggleGpsMode);
  }
});

/**
 * Initialise la carte Leaflet et charge les polygones depuis le fichier GeoJSON.
 */
function initMap() {
  // Création de la carte avec options pour masquer les contrôles de zoom et d'attribution
  map = L.map("map", {
    zoomControl: false,
    attributionControl: false
  }).setView([49.0389, 2.0760], 13);

  // Ajout du fond de carte CartoDB "light_nolabels"
  L.tileLayer("https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png", {
    maxZoom: 19
  }).addTo(map);

  // Activation de la rotation par geste à deux doigts (via le plugin Leaflet.Rotate)
  if (map.touchRotate) {
    map.touchRotate.enable();
  }

  // Chargement du fichier GeoJSON contenant les zones de gêne
  fetch("cozyroute.geojson")
    .then(resp => {
      if (!resp.ok) throw new Error("Erreur lors du chargement du GeoJSON");
      return resp.json();
    })
    .then(data => {
      cozyRouteData = data;
      // Ajout de la couche GeoJSON avec un style par défaut
      cozyRouteLayer = L.geoJSON(data, {
        style: feature => {
          const c = feature.properties.class || "";
          const finalClass = (c + " intensity-0").trim();
          return {
            color: "#FFFFFF",
            weight: 3,
            className: finalClass
          };
        }
      }).addTo(map);
      // Ajustement de la vue pour englober tous les polygones
      map.fitBounds(cozyRouteLayer.getBounds());
    })
    .catch(err => console.error(err));

  // Gestion d'un clic sur la carte
  map.on("click", e => {
    handleMapClick(e.latlng);
  });
}

/**
 * Initialise les événements des boutons de l'interface.
 */
function initUIButtons() {
  // Bouton pour masquer l'overlay questionnaire
  const gotoMapBtn = document.getElementById("goto-map");
  if (gotoMapBtn) {
    gotoMapBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.add("hidden");
    });
  }

  // Bouton "burger" pour afficher/masquer le questionnaire
  const burgerBtn = document.getElementById("burger-menu");
  if (burgerBtn) {
    burgerBtn.addEventListener("click", () => {
      document.getElementById("questionnaire-overlay").classList.toggle("hidden");
    });
  }

  // (Optionnel) Bouton de recherche, si présent dans le HTML
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

// Dictionnaire contenant les informations pour chaque facteur
const infoContent = {
  odorat: {
    title: "Odeurs",
    description:
      "Le malaise lié aux odeurs peut être causé par des émissions désagréables (pollution, déchets, industries) ou des senteurs trop intenses. Des odeurs persistantes peuvent provoquer des nausées, des maux de tête, ou simplement affecter votre bien-être général. Sur l'échelle de 0 à 5, plus la note est proche de 5, plus vous êtes sensible et dérangé(e) par les odeurs fortes."
  },
  bruit: {
    title: "Bruit",
    description:
      "Le malaise lié au bruit peut provenir de sons ambiants constants, du trafic, de travaux de construction ou d'environnements bruyants. Une exposition prolongée à des niveaux de bruit élevés peut causer du stress, de la fatigue, des difficultés de concentration ou des maux de tête. Sur l'échelle de 0 à 5, plus la note est proche de 5, plus vous êtes sensible et dérangé(e) par les environnements bruyants."
  },
  pollution: {
    title: "Pollution",
    description:
      "Le malaise lié à la pollution peut être causé par une mauvaise qualité de l'air, des émissions industrielles, des gaz d'échappement des véhicules ou une accumulation de déchets. L'exposition à la pollution peut entraîner des problèmes respiratoires, des irritations oculaires ou simplement une sensation de malaise dans certaines zones. Sur l'échelle de 0 à 5, plus la note est proche de 5, plus vous êtes sensible et affecté(e) par la pollution environnementale."
  },
  trafic_routier: {
    title: "Trafic routier",
    description:
      "Le malaise lié au trafic routier peut provenir d'une forte congestion, du bruit constant des véhicules, de la pollution due aux gaz d'échappement ou de conditions piétonnes dangereuses. Des niveaux élevés de trafic peuvent créer du stress, des retards et une sensation générale d'inconfort. Sur l'échelle de 0 à 5, plus la note est proche de 5, plus vous êtes sensible et dérangé(e) par le trafic routier et ses impacts."
  },
  handicap: {
    title: "Handicap",
    description:
      "Le malaise lié au handicap fait référence aux difficultés rencontrées par les personnes à mobilité réduite pour se déplacer. Des trottoirs en mauvais état, l'absence de rampes, des passages piétons inaccessibles ou un terrain irrégulier peuvent rendre le déplacement difficile et stressant. Sur l'échelle de 0 à 5, plus la note est proche de 5, plus vous trouvez l'environnement difficile à parcourir pour les personnes à mobilité réduite."
  },
  eclairage: {
    title: "Faible éclairage",
    description:
      "L'inconfort lié au faible éclairage provient de la difficulté à voir clairement dans des zones peu éclairées, ce qui peut créer un sentiment d'insécurité. Un mauvais éclairage peut rendre la détection des obstacles, la navigation sécurisée ou la prise de conscience de son environnement plus difficile, augmentant ainsi le risque d'accidents ou de situations dangereuses. Sur l'échelle de 0 à 5, plus la note est proche de 5, plus vous vous sentez mal à l'aise et en insécurité dans des environnements faiblement éclairés."
  },
  agoraphobie: {
    title: "Agoraphobie",
    description:
      "L'agoraphobie est la peur des espaces ouverts ou bondés, où il peut sembler difficile de s'échapper ou de trouver de l'aide. Elle peut être déclenchée par de grandes zones publiques, des rues animées ou des lieux sans sortie évidente. Cette peur peut entraîner de l'anxiété, un inconfort ou même une évitement de ces environnements. Sur l'échelle de 0 à 5, plus la note est proche de 5, plus vous ressentez de l'anxiété et de l'inconfort dans les espaces ouverts ou bondés."
  },
  claustrophobie: {
    title: "Claustrophobie",
    description:
      "La claustrophobie est la peur des espaces confinés ou clos, où le mouvement est restreint et l'évasion semble difficile. Elle peut être déclenchée par des ascenseurs, des couloirs étroits, des pièces surpeuplées ou des espaces souterrains. Cette peur peut provoquer de l'anxiété, des paniques ou un fort désir de quitter les lieux. Sur l'échelle de 0 à 5, plus la note est proche de 5, plus vous ressentez de l'anxiété et de l'inconfort dans les espaces confinés."
  },
  marchabilite: {
    title: "Marchabilité",
    description:
      "L'inconfort lié à la marchabilité provient de la difficulté ou du danger de se déplacer dans certaines rues ou chemins. Des trottoirs étroits, l'absence de passages piétons, un trafic à grande vitesse ou des chemins mal entretenus peuvent créer un sentiment d'insécurité. Se sentir en danger en marchant peut entraîner du stress, l'évitement de certains itinéraires ou le recours à d'autres moyens de transport. Sur l'échelle de 0 à 5, plus la note est proche de 5, plus vous vous sentez mal à l'aise et en insécurité lors de vos déplacements."
  }
};

// Fonction pour ouvrir la modale avec le contenu adapté
function openInfoModal(theme) {
  const modal = document.getElementById("info-modal");
  const titleEl = document.getElementById("modal-title");
  const descEl = document.getElementById("modal-description");

  if (infoContent[theme]) {
    titleEl.textContent = infoContent[theme].title;
    descEl.textContent = infoContent[theme].description;
  } else {
    titleEl.textContent = "";
    descEl.textContent = "Aucune information disponible.";
  }

  modal.classList.remove("hidden");
}

// Fonction pour fermer la modale
function closeInfoModal() {
  const modal = document.getElementById("info-modal");
  modal.classList.add("hidden");
}

// Ajout des écouteurs sur les boutons info
document.querySelectorAll(".info-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    const theme = btn.getAttribute("data-theme");
    openInfoModal(theme);
  });
});

// Gestion de la fermeture via le bouton "×"
document.querySelector(".close-modal").addEventListener("click", closeInfoModal);

// Ferme la modale si on clique en dehors du contenu
document.getElementById("info-modal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    closeInfoModal();
  }
});

/**
 * Initialise les événements du champ de recherche.
 */
function initSearchInputEvents() {
  const input = document.getElementById("search-input");
  if (!input) return;

  // Mise à jour des suggestions lors de la saisie
  input.addEventListener("input", (e) => {
    onAddressInput(e.target.value);
  });
  // Gestion de la touche "Entrée"
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleEnterPress();
    }
  });
}

/**
 * Gère l'appui sur "Entrée" dans le champ de recherche.
 * Utilise la première suggestion disponible pour centrer la carte.
 */
function handleEnterPress() {
  if (lastSuggestions.length > 0) {
    const first = lastSuggestions[0];
    handleMapClick({ lat: first.coord[0], lng: first.coord[1] });
    displaySuggestions([]);
    document.getElementById("search-input").blur();
  }
}

/**
 * Récupère et affiche les suggestions d'adresses à partir d'OpenRouteService.
 * @param {string} val - Texte saisi par l'utilisateur.
 */
function onAddressInput(val) {
  if (val.length < 4) {
    displaySuggestions([]);
    return;
  }
  geocodeORS(val)
    .then(sugs => {
      lastSuggestions = sugs.slice(0, 3);
      displaySuggestions(lastSuggestions);
    })
    .catch(err => {
      lastSuggestions = [];
      displaySuggestions([]);
    });
}

/**
 * Appel à l'API de géocodage d'OpenRouteService pour récupérer des suggestions.
 * @param {string} query - Requête d'adresse.
 * @returns {Promise<Array>} Liste d'objets avec label et coordonnées.
 */
function geocodeORS(query) {
  const url = `https://api.openrouteservice.org/geocode/autocomplete?api_key=${ORS_API_KEY}&text=${encodeURIComponent(query)}`;
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
 * Affiche les suggestions d'adresse dans la liste sous le champ de recherche.
 * @param {Array} list - Liste de suggestions.
 */
function displaySuggestions(list) {
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
 * Active ou désactive le mode GPS.
 * En mode activé, la position de l'utilisateur est suivie et affichée sur la carte.
 */
function toggleGpsMode() {
  gpsModeActive = !gpsModeActive;
  const btn = document.getElementById("mode-gps");
  if (gpsModeActive) {
    btn.classList.add("active");
    // Effacer les marqueurs et l'itinéraire existants
    clearRouteAndMarkers();
    // Démarrer le suivi GPS si non déjà actif
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
 * Met à jour la position du marqueur GPS sur la carte.
 * @param {Position} position - Position géographique retournée par l'API de géolocalisation.
 */
function updateGpsPosition(position) {
  const lat = position.coords.latitude;
  const lng = position.coords.longitude;
  if (!gpsMarker) {
    // Création du marqueur dynamique (cercle bleu) pour la position GPS
    gpsMarker = L.circleMarker([lat, lng], {
      radius: 8,
      color: "#1976D2",
      fillColor: "#1976D2",
      fillOpacity: 1
    }).addTo(map);
    // Le marqueur GPS devient le point de départ
    clickMarkers = [gpsMarker];
  } else {
    // Mise à jour de la position du marqueur existant
    gpsMarker.setLatLng([lat, lng]);
  }
}

/**
 * Gère les erreurs liées à la géolocalisation.
 * @param {PositionError} err - Erreur retournée par l'API de géolocalisation.
 */
function errorGps(err) {
  console.error(err);
}

/**
 * Gestion d'un clic sur la carte.
 * Selon le mode (GPS ou non), le clic ajoute un marqueur et déclenche éventuellement le calcul de l'itinéraire.
 * @param {Object} latlng - Objet contenant lat et lng.
 */
function handleMapClick(latlng) {
  // En mode GPS, le premier marqueur est la position actuelle, et le second le point de destination
  if (gpsModeActive && clickMarkers.length === 1) {
    const destMarker = L.circleMarker([latlng.lat, latlng.lng], {
      radius: 6,
      color: "black",
      fillColor: "black",
      fillOpacity: 1
    }).addTo(map);
    clickMarkers.push(destMarker);
  }
  // En mode non-GPS, on gère le placement classique de marqueurs
  else if (!gpsModeActive) {
    // Si deux marqueurs existent déjà, on les efface pour un nouveau calcul
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
  // Lorsque deux marqueurs sont présents, lancer le calcul de l'itinéraire
  if (clickMarkers.length === 2) {
    const A = clickMarkers[0].getLatLng();
    const B = clickMarkers[1].getLatLng();
    getRoute(A.lat, A.lng, B.lat, B.lng);
  }
}

/**
 * Efface les itinéraires et marqueurs existants sur la carte.
 */
function clearRouteAndMarkers() {
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
 * Calcule et retourne les polygones à éviter selon les préférences utilisateur.
 * Pour chaque polygone, le "conflit" est calculé :
 *   conflit = intensité du polygone × (note utilisateur / 5)
 * Seuls les polygones dont le conflit dépasse le seuil cutoff sont retournés.
 * @param {number} cutoff - Seuil minimal de conflit.
 * @returns {Object|null} Objet MultiPolygon ou null si aucun polygone ne correspond.
 */
function getAvoidPolygons(cutoff = 0) {
  let polygons = [];
  if (!cozyRouteData || !cozyRouteData.features) return null;

  cozyRouteData.features.forEach(feature => {
    let cls = feature.properties.class;
    let match = cls.match(/^([a-z_]+)-(\d+)$/);
    if (match) {
      let theme = match[1];
      let polyIntensity = parseInt(match[2], 10);
      // Si l'utilisateur a noté une gêne (> 0) pour ce thème
      if (userData[theme] > 0) {
        let conflict = polyIntensity * (userData[theme] / 5);
        if (conflict >= cutoff) {
          // Gestion des différents types de géométries
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
function setLoadingMessage(msg) {
  const el = document.getElementById("loading-message");
  if (el) {
    el.textContent = msg;
  }
}

/**
 * Affiche l'écran de chargement.
 */
function showLoading() {
  const splash = document.getElementById("loading-splash");
  if (splash) splash.classList.remove("hidden");
  setLoadingMessage("");
}

/**
 * Masque l'écran de chargement.
 */
function hideLoading() {
  const splash = document.getElementById("loading-splash");
  if (splash) splash.classList.add("hidden");
  setLoadingMessage("");
}

/**
 * Appelle l'API d'OpenRouteService pour calculer l'itinéraire à pied.
 * Intègre dynamiquement les zones à éviter (polygones) en fonction des préférences.
 * Si aucun itinéraire n'est trouvé, augmente progressivement le cutoff pour relâcher les contraintes.
 * @param {number} lat1 - Latitude du point de départ.
 * @param {number} lng1 - Longitude du point de départ.
 * @param {number} lat2 - Latitude de la destination.
 * @param {number} lng2 - Longitude de la destination.
 * @param {number} cutoff - Seuil minimal de conflit.
 */
function getRoute(lat1, lng1, lat2, lng2, cutoff = 0) {
  showLoading();
  // Suppression de l'itinéraire existant, le cas échéant
  if (routeLayer) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  // Préparation des données pour la requête à l'API
  const bodyData = {
    coordinates: [[lng1, lat1], [lng2, lat2]],
    language: "fr",
    instructions: true
  };

  // Ajout des polygones à éviter, si applicable
  const avoid = getAvoidPolygons(cutoff);
  if (avoid) {
    bodyData.options = { avoid_polygons: avoid };
  }

  // Requête POST à l'API pour obtenir l'itinéraire pédestre
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
      if (!r.ok) throw new Error("Erreur lors du calcul de l'itinéraire");
      return r.json();
    })
    .then(data => {
      if (!data || !data.routes || data.routes.length === 0) {
        throw new Error("Aucun itinéraire trouvé");
      }
      const route = data.routes[0];
      // Décodage de la polyline encodée en coordonnées
      const dec = decodePolyline(route.geometry);
      const routeGeo = {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: dec.map(([la, ln]) => [ln, la])
        },
        properties: {}
      };
      // Ajout de l'itinéraire sur la carte avec un style bleu
      routeLayer = L.geoJSON(routeGeo, { style: { color: "#1976D2", weight: 4 } }).addTo(map);
      map.fitBounds(routeLayer.getBounds(), { padding: [20, 20] });
      hideLoading();
      showDirectionsPanel(route);
    })
    .catch(err => {
      // Si aucun itinéraire n'est trouvé, on augmente le cutoff pour éliminer moins de contraintes
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
 * Décode une polyline encodée (format OpenRouteService) en tableau de coordonnées.
 * @param {string} encoded - Chaîne encodée de la polyline.
 * @returns {Array} Tableau de coordonnées [latitude, longitude].
 */
function decodePolyline(encoded) {
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
 * Affiche le panneau d'itinéraire avec un résumé et la liste des étapes.
 * @param {Object} route - Objet contenant les informations de l'itinéraire.
 */
function showDirectionsPanel(route) {
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
function initDirectionsPanel() {
  const closeBtn = document.getElementById("close-directions");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      document.getElementById("directions-panel").classList.add("hidden");
    });
  }
}

/**
 * Initialise le graphique radar pour afficher le profil utilisateur.
 * Utilise Chart.js et crée un gradient de couleurs pour l'affichage.
 */
function initRadarChart() {
  const ctx = document.getElementById("radarChart");
  if (!ctx) return;

  // Récupère la valeur d'une variable CSS
  function getCssVar(varName) {
    return getComputedStyle(document.documentElement)
      .getPropertyValue(varName)
      .trim();
  }
  // Ajoute un canal alpha à une couleur hexadécimale
  function addHexAlpha(hex, alpha = "90") {
    if (/^#[0-9A-F]{6}$/i.test(hex)) {
      return hex + alpha;
    }
    return hex;
  }

  // Détermine les couleurs des points du graphique en fonction des variables CSS
  const pointColors = themes.map(theme => {
    const baseColor = getCssVar(`--${theme}-color`);
    return addHexAlpha(baseColor, "FF");
  });

  // Crée un gradient conique pour l'arrière-plan du graphique (si supporté)
  function createConicGradient(context) {
    const chart = context.chart;
    const scale = chart.scales.r || chart.scales.radialLinear;
    if (
      !scale ||
      !Number.isFinite(scale.xCenter) ||
      !Number.isFinite(scale.yCenter) ||
      typeof chart.ctx.createConicGradient !== "function"
    ) {
      return "#673AB790";
    }
    const { xCenter, yCenter } = scale;
    const gradient = chart.ctx.createConicGradient(-Math.PI / 2, xCenter, yCenter);
    const colorVars = [
      "--odorat-color",
      "--marchabilite-color",
      "--claustrophobie-color",
      "--agoraphobie-color",
      "--pollution-color",
      "--bruit-color",
      "--eclairage-color",
      "--handicap-color",
      "--trafic_routier-color"
    ];
    colorVars.forEach((varName, i) => {
      const base = getCssVar(varName);
      const withAlpha = addHexAlpha(base, "90");
      gradient.addColorStop(i / colorVars.length, withAlpha);
    });
    const firstColor = getCssVar(colorVars[0]);
    gradient.addColorStop(1, addHexAlpha(firstColor, "90"));
    return gradient;
  }

  // Création du graphique radar avec Chart.js
  radarChart = new Chart(ctx, {
    type: "radar",
    data: {
      labels: themes.map(t => t.charAt(0).toUpperCase() + t.slice(1)),
      datasets: [
        {
          label: "Mon profil",
          data: themes.map(t => userData[t]),
          fill: true,
          backgroundColor: createConicGradient,
          borderColor: "#666",
          borderWidth: 1,
          pointBackgroundColor: pointColors,
          pointBorderColor: pointColors,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        r: {
          min: 0,
          max: 5
        }
      }
    }
  });
}

/**
 * Met à jour le graphique radar en fonction des nouvelles préférences utilisateur.
 */
function updateRadarChart() {
  if (!radarChart) return;
  radarChart.data.datasets[0].data = themes.map(t => userData[t]);
  radarChart.update();
}

/**
 * Mise à jour de la note d'un thème, actualisation du graphique radar
 * et modification du style des routes en conséquence.
 * @param {string} theme - Nom du thème (ex. "odorat").
 * @param {string|number} value - Valeur sélectionnée (entre 0 et 5).
 */
function updateQuestionValue(theme, value) {
  userData[theme] = parseInt(value, 10);
  document.getElementById(theme + "-value").textContent = value;
  updateRadarChart();
  updateRoadStyle();
}

/**
 * Met à jour le style des polygones de la couche GeoJSON en fonction des notes utilisateur.
 * Pour chaque polygone associé à un thème, la classe CSS est modifiée pour refléter l'intensité.
 */
function updateRoadStyle() {
  if (!cozyRouteLayer) return;
  for (const theme of themes) {
    const userVal = userData[theme];
    cozyRouteLayer.eachLayer(layer => {
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
 * Demande la géolocalisation de l'utilisateur et ajoute la position sur la carte.
 * (Fonction utilitaire, éventuellement à déclencher via un bouton.)
 */
function askUserLocation() {
  if (!navigator.geolocation) {
    alert("La géolocalisation n'est pas supportée par votre navigateur.");
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      handleMapClick({ lat, lng });
    },
    err => {
      console.warn(err);
    },
    { enableHighAccuracy: true }
  );
}
