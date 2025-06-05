/* =========================================================
   1. Configuration des filtres
   Chaque entrée définit :
   - label      : texte affiché dans la légende
   - type       : 'checkbox' ou 'range'
   - match      : logique appliquée dans `passes()`
   - options    : dictionnaire valeur -> label (pour les checkboxes)
   - sep        : séparateur des listes concaténées (hasAny)
========================================================= */
import FILTERS from './filters.json' assert { type: 'json' };

/* =========================================================
   2. Store : état centralisé + logique métier
   - calcule les valeurs uniques, min/max, totaux globaux
   - expose `passes(feature)` et `liveCounts()`
   - notifie les abonnés lorsqu’un filtre change
========================================================= */
class FilterStore{
  #listeners=[];      // callbacks UI / map
  filters={};        // sélection courante (Set ou [min,max])
  totals={};         // comptes du dataset brut
  ranges={};         // min/max des champs numériques
  constructor(features){ this.features=features; this.#init(); }

  /* -------- initialisation des structures -------- */
  #init(){
    for(const field in FILTERS){
      const cfg=FILTERS[field];

      if(cfg.match==='range'){
        /* champs numériques => min / max */
        const nums=this.features.map(f=>+f.properties[field]).filter(Number.isFinite);
        const min=Math.min(...nums), max=Math.max(...nums);
        this.ranges[field]=[min,max];
        this.filters[field]=[min,max];
      }else{
        /* checkboxes => valeurs uniques */
        this.totals[field]={};
        const set=new Set();
        this.features.forEach(f=>{
          const raw=f.properties[field]??'';
          const vals=cfg.match==='hasAny' ? raw.split(cfg.sep).map(v=>v.trim()).filter(Boolean) : [raw];
          vals.forEach(v=>{ set.add(v); this.totals[field][v]=(this.totals[field][v]||0)+1; });
        });
        if(!cfg.options) cfg.options=Object.fromEntries([...set].map(v=>[v,v]));
        this.filters[field]=new Set(set); // tous sélectionnés par défaut
      }
    }
  }

  /* -------- abonnements (UI / map) -------- */
  subscribe(cb){ this.#listeners.push(cb) }
  #emit(){ this.#listeners.forEach(fn=>fn()) }

  /* -------- mutations -------- */
  toggleCheckbox(field,val,checked){
    checked ? this.filters[field].add(val) : this.filters[field].delete(val);
    this.#emit();
  }
  setRange(field,range){ this.filters[field]=range; this.#emit(); }

  /* -------- test de passage d’un feature -------- */
  passes(f){
    return Object.entries(FILTERS).every(([field,cfg])=>{
      const val=f.properties[field]??'';
      if(cfg.match==='hasAny'){
        return String(val).split(cfg.sep).map(v=>v.trim()).some(v=>this.filters[field].has(v));
      }
      if(cfg.match==='range'){
        const n=+val; return Number.isFinite(n) && n>=this.filters[field][0] && n<=this.filters[field][1];
      }
      return this.filters[field].has(val);
    });
  }

  /* -------- compte les valeurs après filtrage croisé -------- */
  liveCounts(){
    const out={};
    this.features.forEach(f=>{
      if(!this.passes(f)) return;
      for(const [field,cfg] of Object.entries(FILTERS)){
        const raw=f.properties[field]??'';
        const vals=cfg.match==='hasAny' ? raw.split(cfg.sep).map(v=>v.trim()).filter(Boolean) : [raw];
        (out[field]??={}); vals.forEach(v=>out[field][v]=(out[field][v]||0)+1);
      }
    });
    return out;
  }
}

/* =========================================================
   3. Carte Leaflet : affichage des marqueurs filtrés
========================================================= */
const map=L.map('map').setView([46.5,2.5],6);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{ attribution:'© OpenStreetMap' }).addTo(map);
const markerLayer=L.layerGroup().addTo(map);

const renderMarkers=store=>{
  markerLayer.clearLayers();
  store.features.filter(f=>store.passes(f)).forEach(f=>{
    const [x,y]=f.geometry.coordinates;
    L.marker([y,x]).addTo(markerLayer);
  });
};

/* =========================================================
   4. Interface utilisateur (sidebar)
========================================================= */
const side=document.getElementById('sidebar');
const checkboxRefs={}; // accès direct pour mise à jour rapide

/* -- Helpers DOM -- */
const el=(tag,txt)=>Object.assign(document.createElement(tag),txt?{textContent:txt}:{});
const br = ()=>document.createElement('br');

function buildUI(store){
  for(const [field,cfg] of Object.entries(FILTERS)){
    const fs=el('fieldset'); fs.appendChild(el('legend',cfg.label));
    cfg.type==='checkbox' && buildCheckboxGroup(fs,field,cfg,store);
    cfg.type==='range'    && buildRangeSlider(fs,field,cfg,store);
    side.append(fs);
  }
  refreshCounts(store); // première mise à jour
}

function buildCheckboxGroup(fs,field,cfg,store){
  checkboxRefs[field]={};
  for(const [val,label] of Object.entries(cfg.options)){
    const id=`${field}_${val}`;
    const cb = el('input'); cb.type='checkbox'; cb.id=id; cb.value=val;
    const lbl= el('label'); lbl.htmlFor=id;

    /* état initial */
    cb.checked = store.filters[field].has(val);
    cb.disabled= store.totals[field][val]===0; // jamais présent -> définitivement grisé
    lbl.textContent = `${label} [${store.totals[field][val]||0}]`;

    cb.addEventListener('change',()=>store.toggleCheckbox(field,val,cb.checked));
    checkboxRefs[field][val]={cb,lbl};
    fs.append(cb,lbl,br());
  }
}

function buildRangeSlider(fs,field,cfg,store){
  const div=el('div'); fs.append(div);
  const [min,max]=store.ranges[field];
  noUiSlider.create(div,{ start:[min,max], connect:true, step:1, range:{min,max}, tooltips:true,
                          format:{to:v=>Math.round(v), from:v=>+v} });
  div.noUiSlider.on('change',vals=>store.setRange(field,vals.map(Number)));
}

/* -- Mise à jour des compteurs & état UI -- */
function refreshCounts(store){
  const live=store.liveCounts();
  for(const field in checkboxRefs){
    for(const val in checkboxRefs[field]){
      const {cb,lbl}=checkboxRefs[field][val];
      const cnt=(live[field]&&live[field][val])||0;
      lbl.textContent=`${FILTERS[field].options[val]} [${cnt}]`;
      lbl.classList.toggle('zero',cnt===0);
      cb.checked = store.filters[field].has(val);
    }
  }
}

/* =========================================================
   5. Chargement du GeoJSON et bootstrap
========================================================= */
fetch('enquete_sig_testing.geojson')
  .then(r=>r.ok?r.json():Promise.reject('GeoJSON introuvable'))
  .then(data=>{
    const store=new FilterStore(data.features);
    /* Abonnements UI + carte */
    store.subscribe(()=>{ renderMarkers(store); refreshCounts(store); });

    buildUI(store);      // construit la sidebar une fois
    renderMarkers(store); // pose les marqueurs initiaux
  })
  .catch(err=>side.innerHTML=`<p style="color:red">${err}</p>`);
