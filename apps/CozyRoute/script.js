/*************************************************
 * script.js — version "logs + code simplifié"
 * ---------------------------------------------
 *  - Charge un geojson : feature.properties.class = "handicap-4", etc.
 *  - Applique "handicap-4 intensity-0" comme classes initiales
 *  - Quand on bouge un slider (ex: "handicap"), on remplace
 *    "intensity-X" par "intensity-<valeurSlider>"
 *    pour toutes les lignes qui contiennent "handicap-".
 * 
 *  - Ajout de console.log pour suivre ce qui se passe
 *************************************************/

/***********************************************
 * 0) Variables globales / config
 ***********************************************/
let map = null;              // Carte Leaflet
let cozyRouteLayer = null;   // Couche GEOJSON
const userData = {
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

const themes = [
  "odorat",
  "marchabilite",
  "claustrophobie",
  "agoraphobie",
  "pollution",
  "bruit",
  "eclairage",
  "handicap",
  "trafic_routier"
];

/***********************************************
 * 1) Initialisation globale
 ***********************************************/
window.addEventListener("load", () => {
  console.log("[INIT] Page chargée, on lance initMap");
  initMap();
});

/***********************************************
 * 2) initMap: Créer la carte et charger le GeoJSON
 ***********************************************/
function initMap() {
  // Création de la carte centrée sur Cergy (ex.)
  map = L.map("map").setView([49.0389, 2.0760], 13);
  
  console.log("[MAP] Carte créée");

  // Charger le geojson
  fetch("cozyroute.geojson")
    .then(resp => {
      if (!resp.ok) throw new Error("Erreur réseau (cozyroute.geojson)");
      console.log("[GEOJSON] Fichier chargé OK");
      return resp.json();
    })
    .then(data => {
      console.log(`[GEOJSON] Nombre de features = ${data.features.length}`);

      // Création de la couche
      cozyRouteLayer = L.geoJSON(data, {
        style: feature => {
          const geojsonClass = feature.properties.class || "";
          // On ajoute " intensity-0"
          const finalClass = `${geojsonClass} intensity-0`.trim();
          console.log(`[GEOJSON] Tronçon class="${finalClass}"`);
          return {
            color: "#FFFFFF",
            weight: 3,
            className: finalClass
          };
        }
      }).addTo(map);

      // Ajuste la vue
      map.fitBounds(cozyRouteLayer.getBounds());
      console.log("[MAP] Vue ajustée sur cozyRouteLayer");
    })
    .catch(err => {
      console.error("Erreur chargement geojson:", err);
    });
}

/***********************************************
 * 3) updateQuestionValue : le slider bouge => actualiser userData + logs
 ***********************************************/
function updateQuestionValue(theme, value) {
  console.log(`[SLIDER] Le slider "${theme}" passe à ${value}`);
  userData[theme] = parseInt(value, 10);

  // Met à jour le <span>…/5
  document.getElementById(theme + "-value").textContent = value;

  // On relance la mise à jour de style
  updateRoadStyle();
}

/***********************************************
 * 4) updateRoadStyle: Parcours tous les tronçons
 *    => Si un tronçon a "odorat-" et userVal=4 => "intensity-4"
 ***********************************************/
function updateRoadStyle() {
  if (!cozyRouteLayer) return;

  themes.forEach((theme) => {
    const userVal = userData[theme];

    cozyRouteLayer.eachLayer((layer) => {
      const cName = layer.options.className || "";
      // Si le path a le prefix "theme-"
      if (cName.includes(theme + "-")) {
        const newClass = cName.replace(/intensity-\d+/, `intensity-${userVal}`);
        // On met à jour le style Leaflet (couleur, weight, etc.)
        layer.setStyle({
          color: "#FFFFFF",
          weight: 3
          // NE PAS mettre className ici : Leaflet ne met pas toujours à jour
        });
        // On force la mise à jour de l'attribut class du <path>
        if (layer._path) {
          layer._path.setAttribute("class", newClass + " leaflet-interactive");
        }
        // On garde en mémoire la nouvelle classe si besoin
        layer.options.className = newClass;
      }
    });
  });
}
