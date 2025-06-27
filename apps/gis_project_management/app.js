 /**
  * CONSTANTES DE STYLE ET DIMENSIONS
  */
 const STYLE = {
   CHART: {
     PIE: { W: 260, H: 220 },
     BAR: { W: 260, STEP: 20 },
     HIST: { W: 260, H: 150 }
   },
   MAP: {
     BASE_RADIUS: 5,
     MARKER_RADIUS: 6
   },
   LEGEND: {
     MAX_HEIGHT: 200
   },
   SLIDER: {
     STEP: 1
   },
   WORDCLOUD: {
     W: 300,
     H: 200,
     MIN_FONT: 10,
     MAX_FONT: 40
   }
 };

 /**
  * FONCTION GÉNÉRIQUE DE CRÉATION D'ÉLÉMENTS DOM
  */
 function create(tag, { text, className, attrs = {}, children = [] } = {}) {
   const el = document.createElement(tag);
   if (text !== undefined) el.textContent = text;
   if (className) el.className = className;
   Object.entries(attrs).forEach(([k, v]) => {
     if (v === '') el.setAttribute(k, '');
     else el.setAttribute(k, v);
   });
   children.forEach(child => el.append(typeof child === 'string' ? document.createTextNode(child) : child));
   return el;
 }

 /**
  * CONFIGURATION COMPLÈTE
  */
 import { CONFIG } from './config.js';

 /** TABLEAUX CALCULÉS */
 const ALL_FIELDS = Object.keys(CONFIG.fields);

 const GROUPS = CONFIG.groupOrder.map(groupName => {
   const champs = ALL_FIELDS
     .filter(field => CONFIG.fields[field].group === groupName)
     .map(field => ({ field, cfg: CONFIG.fields[field] }));
   return { name: groupName, champs };
 });

 /** ÉTAT GLOBAL DU THÈME */
 let currentTheme = { field: null };

 /** RÉFÉRENCES POUR SLIDERS */
 const sliderRefs = {};

 /** PETITE LISTE DE STOPWORDS FRANÇAIS/ANGLAIS */
 const STOPWORDS = new Set([
   'et','le','la','les','de','des','du','un','une','pour','avec','aux',
   'dans','ce','ces','il','elle','sur','pas','plus','the','of','to',
   'and','in','a','for','is','on','it','that'
 ]);

 /** CLASSE FILTERSTORE */
 class FilterStore {
   #listeners = [];

   constructor(features) {
     this.features = features;
     this.filters = {};
     this.totals = {};
     this.ranges = {};

     // Séparer champs range vs checkbox vs texte
     const { checkbox, range } = ALL_FIELDS.reduce((acc, field) => {
       const cfg = CONFIG.fields[field];
       if (cfg.match === 'range') acc.range.push(field);
       else if (cfg.type === 'checkbox' || cfg.type === 'multiva') acc.checkbox.push(field);
       // type:"text" (wordcloud + thème texte) ne fait pas partie des filtres
       return acc;
     }, { checkbox: [], range: [] });
     this._fieldsCheckbox = checkbox;
     this._fieldsRange = range;

     // Initialisation
     ALL_FIELDS.forEach(field => {
       const cfg = CONFIG.fields[field];
       if (cfg.match === 'range') {
         const nums = this.features
           .map(f => +f.properties[field])
           .filter(Number.isFinite);
         const min = nums.length ? Math.min(...nums) : 0;
         const max = nums.length ? Math.max(...nums) : 0;
         this.ranges[field] = [min, max];
         this.filters[field] = [min, max];
       } else if (cfg.type === 'checkbox' || cfg.type === 'multiva') {
         this.totals[field] = {};
         const valuesSet = new Set();
         this.features.forEach(f => {
           const raw = f.properties[field] || '';
           const vals = (cfg.match === 'hasAny')
             ? raw.split(cfg.sep).map(v => v.trim()).filter(Boolean)
             : [raw];
           vals.forEach(v => {
             valuesSet.add(v);
             this.totals[field][v] = (this.totals[field][v] || 0) + 1;
           });
         });
         if (!cfg.options) {
           cfg.options = Array.from(valuesSet).reduce((acc, v) => { acc[v] = v; return acc; }, {});
         }
         this.filters[field] = new Set(valuesSet);
       }
       // type:"text" => pas de filtre direct
     });

     this._computeFiltered();
   }

   subscribe(cb) {
     this.#listeners.push(cb);
   }

   #emit() {
     this.#listeners.forEach(cb => cb());
   }

   _passes(f) {
     const p = f.properties;
     for (const field of this._fieldsRange) {
       const [min, max] = this.filters[field];
       const n = +p[field];
       if (!Number.isFinite(n) || n < min || n > max) return false;
     }
     for (const field of this._fieldsCheckbox) {
       const cfg = CONFIG.fields[field];
       const raw = p[field] || '';
       if (cfg.match === 'hasAny') {
         const ok = raw.split(cfg.sep).some(v => this.filters[field].has(v.trim()));
         if (!ok) return false;
       } else {
         if (!this.filters[field].has(raw)) return false;
       }
     }
     return true;
   }

   _computeFiltered() {
     this.filtered = this.features.filter(f => this._passes(f));
   }

   toggleCheckbox(field, val, checked) {
     if (checked) this.filters[field].add(val);
     else this.filters[field].delete(val);
     this._computeFiltered();
     this.#emit();
   }

   setRange(field, range) {
     this.filters[field] = range;
     this._computeFiltered();
     this.#emit();
   }

   resetFilters(fields = ALL_FIELDS) {
     fields.forEach(field => {
       const cfg = CONFIG.fields[field];
       if (cfg.match === 'range') {
         this.filters[field] = [...this.ranges[field]];
         if (sliderRefs[field]) {
           sliderRefs[field].set(this.ranges[field]);
         }
       } else if (cfg.type === 'checkbox' || cfg.type === 'multiva') {
         this.filters[field] = new Set(Object.keys(this.totals[field]));
       }
     });
     this._computeFiltered();
     this.#emit();
   }

   liveCounts(fields) {
     const result = {};
     this.filtered.forEach(f => {
       fields.forEach(field => {
         const cfg = CONFIG.fields[field];
         const raw = f.properties[field] || '';
         const vals = (cfg.match === 'hasAny')
           ? raw.split(cfg.sep).map(v => v.trim()).filter(Boolean)
           : [raw];
         if (!result[field]) result[field] = {};
         vals.forEach(v => {
           result[field][v] = (result[field][v] || 0) + 1;
         });
       });
     });
     return result;
   }
 }

 /** UTILITAIRES D3 */
 function withSvg(container, width, height, drawFn) {
   const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
   drawFn(svg);
 }

 function withCenteredGroup(container, width, height, drawFn) {
   const svg = d3.select(container).append('svg').attr('width', width).attr('height', height);
   const grp = svg.append('g').attr('transform', `translate(${width/2},${height/2})`);
   drawFn(grp);
 }

 function drawBarHorizontal(svg, data, { field, maxValue, colorFn }) {
   const width = +svg.attr('width');
   const height = +svg.attr('height');
   const x = d3.scaleLinear().domain([0, maxValue]).range([0, width - 100]);
   const y = d3.scaleBand().domain(data.map(d => d[0])).range([0, height - 10]).padding(0.1);
   svg.selectAll('rect')
     .data(data)
     .enter().append('rect')
     .attr('x', 0)
     .attr('y', d => y(d[0]))
     .attr('width', d => x(d[1]))
     .attr('height', y.bandwidth())
     .attr('fill', d => colorFn(d[0]));

   svg.selectAll('text.count')
     .data(data)
     .enter().append('text')
     .attr('class', 'count')
     .attr('x', d => x(d[1]) + 4)
     .attr('y', d => y(d[0]) + y.bandwidth()/2)
     .attr('dy', '0.35em')
     .text(d => d[1]);

   svg.selectAll('text.label')
     .data(data)
     .enter().append('text')
     .attr('class', 'label')
     .attr('x', 0)
     .attr('y', d => y(d[0]) + y.bandwidth()/2)
     .attr('dy', '0.35em')
     .attr('dx', 2)
     .text(d => CONFIG.fields[field].options[d[0]] || d[0]);
 }

 function drawHistogram(svg, countsArray, { field, maxCount, interpFn }) {
   const width = +svg.attr('width');
   const height = +svg.attr('height');
   const x = d3.scaleLinear().domain([0, maxCount]).range([0, width - 30]);
   const y = d3.scaleLinear().domain([0, countsArray.length]).range([0, height - 20]);
   svg.selectAll('rect')
     .data(countsArray)
     .enter().append('rect')
     .attr('x', 0)
     .attr('y', (d, i) => y(i))
     .attr('width', d => x(d))
     .attr('height', 10)
     .attr('fill', d => interpFn(d / maxCount));
 }

 /** MINI-PIECHART */
 function makeMiniPie(countsObj, radius, colorFn) {
   const entries = Object.entries(countsObj);
   if (entries.length === 1) {
     const [cat] = entries[0];
     const color = colorFn(cat);
     return `<svg width="${radius*2}" height="${radius*2}" class="mini-pie">
               <circle cx="${radius}" cy="${radius}" r="${radius}" fill="${color}" stroke="#fff" stroke-width="0.5"/>
             </svg>`;
   }
   const total = d3.sum(entries, d => d[1]);
   let angleStart = 0;
   let svg = `<svg width="${radius*2}" height="${radius*2}" viewBox="0 0 ${radius*2} ${radius*2}" class="mini-pie">`;
   entries.forEach(([cat, cnt]) => {
     const angle = (cnt / total) * 2 * Math.PI;
     const x1 = radius + radius * Math.cos(angleStart);
     const y1 = radius + radius * Math.sin(angleStart);
     const angleEnd = angleStart + angle;
     const x2 = radius + radius * Math.cos(angleEnd);
     const y2 = radius + radius * Math.sin(angleEnd);
     const largeArc = angle > Math.PI ? 1 : 0;
     const pathD = `M ${radius},${radius} L ${x1},${y1} A ${radius},${radius} 0 ${largeArc} 1 ${x2},${y2} Z`;
     svg += `<path d="${pathD}" fill="${colorFn(cat)}" stroke="#fff" stroke-width="0.5"/>`;
     angleStart = angleEnd;
   });
   svg += `</svg>`;
   return svg;
 }

 /** UTILITAIRES DIV ICON POUR “texte” */
 function createTextIcon() {
   return L.divIcon({
     html: `<span style="font-size:20px;">💬</span>`,
     className: '',
     iconSize: [24, 24],
     iconAnchor: [12, 12]
   });
 }

 /** UTILITAIRE POUR CRÉER LE DÉGRADÉ CSS */
 function createGradientDiv(interpFn, steps = 10) {
   const div = create('div');
   div.style.width = '100%';
   div.style.height = '10px';
   const stops = [];
   for (let i = 0; i <= steps; i++) {
     const t = i / steps;
     stops.push(`${interpFn(t)} ${Math.round(t * 100)}%`);
   }
   div.style.background = `linear-gradient(to right, ${stops.join(', ')})`;
   return div;
 }

 /** UTILITÉ POUR BOUTON DE THÈME */
 function createMapThemeButton(field, onClick) {
   const btn = create('button', {
     text: '🗺️',
     className: 'apply-map-theme',
     attrs: { 'data-field': field, title: 'Appliquer ce thème sur la carte' }
   });
   btn.addEventListener('click', onClick);
   return btn;
 }

 /** GÉNÉRATEUR DE POPUP À PARTIR DU TEMPLATE */
 function generatePopupContent(feature, template) {
   return template.replace(/\{(\w+)\}/g, (match, p1) => {
     const val = feature.properties[p1];
     return (val !== undefined && val !== null && val !== '') ? val : '';
   });
 }

 /** INITIALISATION DE LA CARTE + COUCHE MARQUEURS */
 const map = L.map('map').setView([46.5, 2.5], 6);
 L.tileLayer('https://cartodb-basemaps-a.global.ssl.fastly.net/light_nolabels/{z}/{x}/{y}.png', { attribution: 'cartodb' }).addTo(map);
 const markerLayer = L.layerGroup().addTo(map);

 /** LÉGENDE PERSONNALISÉE */
 const legendControl = L.control({ position: 'bottomright' });
 legendControl.onAdd = function() {
   const div = create('div', { className: 'info legend' });
   div.style.background = 'rgba(255,255,255,0.8)';
   div.style.padding = '6px';
   div.style.borderRadius = '4px';
   div.style.fontSize = '0.85rem';
   div.style.maxHeight = STYLE.LEGEND.MAX_HEIGHT + 'px';
   div.style.overflowY = 'auto';
   this._div = div;
   this.update();
   return div;
 };
 legendControl.update = function(store, countsForTheme) {
   const container = this._div;
   container.innerHTML = '';
   const field = currentTheme.field;
   if (!field) {
     container.append(create('span', { text: 'Aucun thème actif : un clic sur "🗺️" dans le volet des graphs activer un thème et pouvoir cliquer sur les points pour voir les détails', attrs: { style: 'color:#555' } }));
     return;
   }
   const fieldCfg = CONFIG.fields[field];
   const title = create('h5', { text: fieldCfg.label });
   title.style.marginBottom = '4px';
   container.append(title);

   // HISTOGRAMME
   if (fieldCfg.dataviz?.type === 'histogram') {
     const nums = store.filtered.map(f => +f.properties[field]).filter(Number.isFinite);
     if (!nums.length) {
       container.append(create('span', { text: '(aucune donnée)' }));
       return;
     }
     const min = Math.min(...nums), max = Math.max(...nums);
     const grad = createGradientDiv(CONFIG.continuousConfig[field]);
     grad.style.margin = '4px 0';
     container.append(grad);

     const labelsRow = create('div');
     labelsRow.style.display = 'flex';
     labelsRow.style.justifyContent = 'space-between';
     labelsRow.append(create('span', { text: Math.round(min) }), create('span', { text: Math.round(max) }));
     container.append(labelsRow);
     return;
   }

   // MINI-PIE OU LISTE SIMPLIFIÉE
   const isPie = fieldCfg.mapTheme?.type === 'pie';
   const keyField = isPie ? fieldCfg.mapTheme.multiField : field;
   const counts = countsForTheme || store.liveCounts([keyField])[keyField] || {};
   Object.keys(counts).sort().forEach(cat => {
     const alias = CONFIG.fields[keyField].options[cat] || cat;
     const color = COLOR_FNS[keyField](cat);
     const line = create('div', { children: [
       create('span', { className: 'box', attrs: { style: `background:${color}` } }),
       create('span', { text: `${alias} (${counts[cat]})` })
     ]});
     container.append(line);
   });
 };
 legendControl.addTo(map);

 /** COULEURS : color functions pour chaque champ */
 let COLOR_FNS = {};

 /** RÉFÉRENCES DOM */
 const sidebar = document.getElementById('sidebar');
 const chartsContainer = document.getElementById('charts');
 const checkboxRefs = {};

 /** HANDLER UNIQUE POUR TOUTES LES CHECKBOXES */
 function onCheckboxChange(evt) {
   const cb = evt.target;
   const fld = cb.dataset.field;
   const val = cb.dataset.value;
   store.toggleCheckbox(fld, val, cb.checked);
 }

 /** MISE À JOUR GLOBALE */
 function updateAll() {
   const theme = currentTheme.field;
   const countsForTheme = theme ? store.liveCounts([theme])[theme] : null;
   renderMarkers(store, countsForTheme);
   refreshFilterCounts(store);
   legendControl.update(store, countsForTheme);
   renderAllCharts(store);
   renderWordClouds(store);
 }

 /** FONCTION GÉNÉRIQUE POUR CONSTRUIRE UN ACCORDÉON */
 function buildAccordion(parentEl, groupes, buildContentFn) {
   groupes.forEach(({ name, champs }) => {
     const details = create('details', { attrs: { open: '' } });
     const summary = create('summary');
     const titleSpan = create('span', { text: name, className: 'title' });
     const resetBtn = create('button', { text: '↺', className: 'reset-group', title: 'Réinitialiser ce groupe' });
     resetBtn.addEventListener('click', evt => {
       evt.stopPropagation();
       const fieldsToReset = champs.map(({ field }) => field);
       store.resetFilters(fieldsToReset);
     });
     summary.append(titleSpan, resetBtn);

     const content = create('div', { className: 'group-content' });
     champs.forEach(({ field, cfg }) => {
       const node = buildContentFn(field, cfg);
       if (node) content.append(node);
     });

     // N'afficher le groupe que si au moins un filtre a été créé dedans
     if (content.childNodes.length > 0) {
       details.append(summary, content);
       parentEl.append(details);
     }
   });
 }

 /** CONSTRUCTION DE L'INTERFACE DE FILTRES */
 function buildFilterUI(store) {
   // Bouton global Reset
   const resetGlobal = create('button', { text: 'Réinitialiser tous les filtres', className: 'reset-global' });
   resetGlobal.addEventListener('click', () => {
     store.resetFilters();
   });
   sidebar.append(resetGlobal);

   // Préparer les groupes en excluant les champs de type "text"
   const filterGroups = GROUPS.map(g => ({
     name: g.name,
     champs: g.champs.filter(({ cfg }) => cfg.type !== 'text')
   })).filter(g => g.champs.length > 0);

   buildAccordion(sidebar, filterGroups, (field, cfg) => {
     // Ne pas créer d’UI pour les champs de type "text" (wordcloud + thème texte)
     if (cfg.type === 'text') return null;

     const fs = create('fieldset');
     if (cfg.label) fs.append(create('legend', { text: cfg.label }));
     if (cfg.description) fs.append(create('p', { text: cfg.description, className: 'desc' }));

     if (cfg.type === 'checkbox' || cfg.type === 'multiva') {
       checkboxRefs[field] = {};
       Object.entries(cfg.options).forEach(([val, alias]) => {
         const id = `${field}_${val}`;
         const checkbox = create('input', { attrs: { type: 'checkbox', id, value: val, 'data-field': field, 'data-value': val } });
         checkbox.checked = store.filters[field].has(val);
         checkbox.addEventListener('change', onCheckboxChange);

         const label = create('label', { text: `${alias} [${store.totals[field]?.[val] || 0}]`, attrs: { for: id } });
         fs.append(checkbox, label, create('br'));
         checkboxRefs[field][val] = { checkbox, label };
       });
     }

     if (cfg.type === 'range') {
       const sliderDiv = create('div');
       fs.append(sliderDiv);
       const [min, max] = store.ranges[field];
       noUiSlider.create(sliderDiv, {
         start: [min, max],
         connect: true,
         step: STYLE.SLIDER.STEP,
         range: { min, max },
         tooltips: true,
         format: { to: v => Math.round(v), from: v => +v }
       });
       sliderDiv.setAttribute('role', 'group');
       sliderRefs[field] = sliderDiv.noUiSlider;
       sliderDiv.noUiSlider.on('change', values => {
         store.setRange(field, values.map(Number));
       });
     }

     return fs;
   });

   refreshFilterCounts(store);
 }

 function refreshFilterCounts(store) {
   const live = store.liveCounts(ALL_FIELDS);
   Object.entries(checkboxRefs).forEach(([field, refMap]) => {
     Object.entries(refMap).forEach(([val, { checkbox, label }]) => {
       const cnt = live[field]?.[val] || 0;
       const alias = CONFIG.fields[field].options[val] || val;
       label.textContent = `${alias} [${cnt}]`;
       label.classList.toggle('zero', cnt === 0);
       checkbox.checked = store.filters[field].has(val);
     });
   });
 }

 /** CONSTRUCTION DE L'INTERFACE DES GRAPHIQUES */
 function buildChartUI(store) {
   buildAccordion(chartsContainer, GROUPS, (field, cfg) => {
     if (!cfg.dataviz) return null;

     // Pour les wordclouds, on crée un container spécifique avec bouton de thème
     if (cfg.dataviz.type === 'wordcloud') {
       const wrapper = create('div', { className: 'chart-container' });
       const header = create('div', { attrs: { style: 'display:flex; justify-content:space-between; align-items:center;' } });
       const title = create('h4', { text: cfg.label });
       const btn = createMapThemeButton(field, () => {
         currentTheme.field = currentTheme.field === field ? null : field;
         updateAll();
       });
       header.append(title, btn);
       wrapper.append(header);

       // Le DIV où le wordcloud sera dessiné
       const cloudDiv = create('div', {
         className: 'wordcloud-svg',
         attrs: { 'data-field': field }
       });
       wrapper.append(cloudDiv);
       return wrapper;
     }

     // Pour les autres types de dataviz (pie, bar, histogram)
     const wrapper = create('div', { className: 'chart-container' });
     const header = create('div', { attrs: { style: 'display:flex; justify-content:space-between; align-items:center;' } });
     const title = create('h4', { text: cfg.label });
     const btn = createMapThemeButton(field, () => {
       currentTheme.field = currentTheme.field === field ? null : field;
       updateAll();
     });
     header.append(title, btn);
     const chartDiv = create('div', { className: 'chart', attrs: { 'data-field': field } });
     wrapper.append(header, chartDiv);
     return wrapper;
   });

   renderAllCharts(store);
   renderWordClouds(store);
 }

 function renderAllCharts(store) {
   const counts = store.liveCounts(ALL_FIELDS);
   document.querySelectorAll('.chart').forEach(div => {
     const field = div.dataset.field;
     const cfg = CONFIG.fields[field].dataviz;
     if (cfg.type === 'wordcloud') return; // on gère dans renderWordClouds

     const dataObj = counts[field] || {};
     const entries = Object.entries(dataObj).sort((a, b) => b[1] - a[1]);
     div.innerHTML = '';
     if (!entries.length) {
       div.textContent = '(aucune donnée)';
       return;
     }
     if (cfg.type === 'pie') {
       renderPie(div, entries, field);
     } else if (cfg.type === 'bar-horizontal') {
       renderBarHorizontal(div, entries.slice(0, 8), field);
     } else if (cfg.type === 'histogram') {
       renderHistogram(div, entries, field);
     }
   });
 }

 function renderPie(container, data, field) {
   const { W, H } = STYLE.CHART.PIE;
   const radius = Math.min(W, H) / 2;
   withCenteredGroup(container, W, H, svg => {
     const pieGen = d3.pie().value(d => d[1]);
     const arcGen = d3.arc().innerRadius(0).outerRadius(radius - 4);
     svg.selectAll('path')
       .data(pieGen(data))
       .enter().append('path')
       .attr('d', arcGen)
       .attr('fill', d => COLOR_FNS[field](d.data[0]));

     svg.selectAll('text')
       .data(pieGen(data))
       .enter().append('text')
       .attr('transform', d => `translate(${arcGen.centroid(d)})`)
       .attr('dy', '0.35em')
       .attr('text-anchor', 'middle')
       .text(d => CONFIG.fields[field].options[d.data[0]] || d.data[0]);
   });
 }

 function renderBarHorizontal(container, data, field) {
   const width = STYLE.CHART.BAR.W;
   const height = data.length * STYLE.CHART.BAR.STEP + 10;
   withSvg(container, width, height, svg => {
     const maxValue = d3.max(data, d => d[1]);
     drawBarHorizontal(svg, data, {
       field,
       maxValue,
       colorFn: val => COLOR_FNS[field](val)
     });
   });
 }

 function renderHistogram(container, data, field) {
   const width = STYLE.CHART.HIST.W;
   const height = STYLE.CHART.HIST.H;
   withSvg(container, width, height, svg => {
     const countsArray = data.map(d => d[1]);
     const maxCount = d3.max(countsArray);
     drawHistogram(svg, countsArray, {
       field,
       maxCount,
       interpFn: t => CONFIG.continuousConfig[field](t)
     });
   });
 }

 /** RENDU DES MARQUEURS SUR LA CARTE */
 function renderMarkers(store, countsForTheme) {
   markerLayer.clearLayers();
   store.filtered.forEach(f => {
     const [lat, lng] = [f.geometry.coordinates[1], f.geometry.coordinates[0]];
     const field = currentTheme.field;
     const fieldCfg = field ? CONFIG.fields[field] : null;

     // Si thème “texte” actif : n'afficher que si la propriété texte est non vide
     if (fieldCfg?.mapTheme?.type === 'text') {
       const textVal = f.properties[field] || '';
       if (!textVal.trim()) return;  // Si aucune valeur, on ne dessine pas ce point
       const icon = createTextIcon();
       const marker = L.marker([lat, lng], { icon });
       if (fieldCfg.popup) {
         const content = generatePopupContent(f, fieldCfg.popup);
         marker.bindPopup(content);
       }
       marker.addTo(markerLayer);
       return;
     }

     // Sinon, si thème “pie” pour multichamps
     if (fieldCfg?.mapTheme?.type === 'pie') {
       const { multiField, sizeField } = fieldCfg.mapTheme;
       const raw = f.properties[multiField] || '';
       const sep = CONFIG.fields[multiField].sep || ',';
       const vals = raw.split(sep).map(v => v.trim()).filter(Boolean);
       const sizeCount = +f.properties[sizeField] || vals.length;
       const radius = STYLE.MAP.BASE_RADIUS + sizeCount;

       const countsObj = {};
       vals.forEach(v => countsObj[v] = (countsObj[v] || 0) + 1);
       const svgHTML = makeMiniPie(countsObj, radius, cat => COLOR_FNS[multiField](cat));
       const icon = L.divIcon({ html: svgHTML, className: '', iconSize: [radius*2, radius*2] });
       const marker = L.marker([lat, lng], { icon });
       if (fieldCfg.popup) {
         const content = generatePopupContent(f, fieldCfg.popup);
         marker.bindPopup(content);
       }
       marker.addTo(markerLayer);

     } else {
       // Sinon, thème “color” ou pas de thème : cercle coloré
       const defaultColor = '#3388ff';
       const color = field ? COLOR_FNS[field](f.properties[field] || '') : defaultColor;
       const marker = L.circleMarker([lat, lng], {
         radius: STYLE.MAP.MARKER_RADIUS,
         fillColor: color,
         color: '#fff',
         weight: 1,
         fillOpacity: 0.8
       });
       if (fieldCfg?.popup) {
         const content = generatePopupContent(f, fieldCfg.popup);
         marker.bindPopup(content);
       }
       marker.addTo(markerLayer);
     }
   });
 }

 /** RENDRE LES WORDCLOUDS POUR “specificite_sig” et “conseil” */
 function renderWordClouds(store) {
   // Extraction des textes filtrés
   const texts = {
     specificite_sig: [],
     conseil: []
   };

   store.filtered.forEach(f => {
     const t1 = (f.properties.specificite_sig || '').trim();
     if (t1) texts.specificite_sig.push(t1);
     const t2 = (f.properties.conseil || '').trim();
     if (t2) texts.conseil.push(t2);
   });

   Object.keys(texts).forEach(field => {
     const allWords = texts[field]
       .join(' ')
       .toLowerCase()
       .replace(/[.,;:!?()\[\]\"']/g, ' ')
       .split(/\s+/)
       .filter(w => w && !STOPWORDS.has(w));

     // Fréquence
     const freq = {};
     allWords.forEach(w => {
       freq[w] = (freq[w] || 0) + 1;
     });
     const wordsArray = Object.entries(freq).map(([word, count]) => ({ word, count }));
     wordsArray.sort((a, b) => b.count - a.count);
     const topWords = wordsArray.slice(0, 100); // on garde top 100

     // Layout d3.layout.cloud
     const layout = d3.layout.cloud()
       .size([STYLE.WORDCLOUD.W, STYLE.WORDCLOUD.H])
       .words(topWords.map(d => ({ text: d.word, size: d.count })))
       .padding(5)
       .rotate(() => (Math.random() < 0.5 ? 0 : 90))
       .fontSize(d => {
         const counts = topWords.map(d2 => d2.count);
         const mn = d3.min(counts), mx = d3.max(counts);
         if (mx === mn) return (STYLE.WORDCLOUD.MIN_FONT + STYLE.WORDCLOUD.MAX_FONT) / 2;
         return STYLE.WORDCLOUD.MIN_FONT + (d.size - mn) / (mx - mn) * (STYLE.WORDCLOUD.MAX_FONT - STYLE.WORDCLOUD.MIN_FONT);
       })
       .on('end', words => drawCloud(words, field));

     layout.start();
   });
 }

 function drawCloud(words, field) {
   // On récupère le DIV créé par buildChartUI (data-field=field)
   const container = document.querySelector(`.wordcloud-svg[data-field="${field}"]`);
   if (!container) return;

   // Vider l’ancien contenu
   container.innerHTML = '';

   // Créer le SVG dans ce container
   const svg = d3.select(container)
     .append('svg')
     .attr('width', STYLE.WORDCLOUD.W)
     .attr('height', STYLE.WORDCLOUD.H)
     .append('g')
     .attr('transform', `translate(${STYLE.WORDCLOUD.W/2},${STYLE.WORDCLOUD.H/2})`);

   svg.selectAll('text')
     .data(words)
     .enter().append('text')
     .style('font-size', d => `${d.size}px`)
     .style('fill', () => d3.schemeCategory10[Math.floor(Math.random()*10)])
     .attr('text-anchor', 'middle')
     .attr('transform', d => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
     .text(d => d.text);
 }

 /** CHARGEMENT DES DONNÉES ET INITIALISATION GLOBALE */
 let store;
 fetch('https://raw.githubusercontent.com/erw-1/erw.one/refs/heads/main/apps/gis_project_management/enquete_sig_testing.geojson')
   .then(response => {
     if (!response.ok) throw 'GeoJSON introuvable';
     return response.json();
   })
   .then(data => {
     store = new FilterStore(data.features);

     // Construire COLOR_FNS
     COLOR_FNS = {};
     ALL_FIELDS.forEach(field => {
       const cfg = CONFIG.fields[field];
       if (cfg.colors) {
         COLOR_FNS[field] = val => cfg.colors[val] || '#ccc';
       } else if (cfg.dataviz?.type === 'histogram') {
         const nums = store.features.map(f => +f.properties[field]).filter(Number.isFinite);
         const min = nums.length ? Math.min(...nums) : 0;
         const max = nums.length ? Math.max(...nums) : 1;
         const scale = d3.scaleLinear().domain([min, max]).range([0, 1]);
         COLOR_FNS[field] = val => {
           const n = +val;
           return Number.isFinite(n) ? CONFIG.continuousConfig[field](scale(n)) : '#ccc';
         };
       } else if (cfg.mapTheme?.type === 'pie') {
         const multi = cfg.mapTheme.multiField;
         const multiCfg = CONFIG.fields[multi];
         if (multiCfg.colors) {
           COLOR_FNS[multi] = v => multiCfg.colors[v] || '#ccc';
         } else {
           const sortedVals = Object.keys(store.totals[multi] || {}).sort();
           COLOR_FNS[multi] = v => {
             const idx = sortedVals.indexOf(v);
             return d3.schemeTableau10[idx % 10] || '#ccc';
           };
         }
         COLOR_FNS[field] = v => COLOR_FNS[multi](v);
       } else {
         const sortedVals = Object.keys(store.totals[field] || {}).sort();
         COLOR_FNS[field] = v => {
           const idx = sortedVals.indexOf(v);
           return d3.schemeTableau10[idx % 10] || '#ccc';
         };
       }
     });

     // Abonnement global
     store.subscribe(updateAll);

     // Construire UI
     buildFilterUI(store);
     buildChartUI(store);

     // Premier rendu
     updateAll();
   })
   .catch(error => {
     const sidebarEl = document.getElementById('sidebar');
     const mapEl = document.getElementById('map');
     sidebarEl.innerHTML = `<p style="color:red">${error}</p>`;
     mapEl.innerHTML = `<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);color:red;font-weight:600;">Erreur de chargement des données</div>`;
   });
