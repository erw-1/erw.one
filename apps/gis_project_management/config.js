export const CONFIG = {
   fields: {
     // Champs existants
     lang: {
       label: 'Langue',
       description: 'Choisissez la langue du questionnaire',
       group: 'Général',
       type: 'checkbox', match: 'equals',
       options: { fr: 'Français', en: 'Anglais' },
       colors: { fr: '#4169e1', en: '#ff8c00' },
       dataviz: { type: 'pie' },
       mapTheme: { type: 'color' },
       popup: `<div><strong>Langue :</strong> {lang}</div>`
     },
     issue: {
       label: 'Issue du projet',
       description: 'Choisissez la langue du questionnaire',
       group: 'Général',
       type: 'checkbox', match: 'equals',
       options: { 'Succès': 'Succès', 'Échec puis relance': 'Échec puis relance', 'Échec (abandon, gel, oubli)': 'Échec (abandon, gel, oubli)', 'Autre': 'Autre (voir carte)' },
       colors: { 'Succès': 'green', 'Échec puis relance': 'orange', 'Échec (abandon, gel, oubli)': 'red', 'Autre': 'purple' },
       dataviz: { type: 'pie' },
       mapTheme: { type: 'color' },
       popup: `<div><strong>Issue :</strong> {issue_autre} - {issue}</div>`
     },
     duree: {
       label: 'Durée du projet',
       group: 'Général',
       type: 'checkbox', match: 'equals',
       dataviz: { type: 'bar-horizontal' }
     },
     structure: {
       label: 'Structure',
       description: '',
       group: 'Général',
       type: 'checkbox', match: 'equals',
       options: {
         'Public territorial (collectivité, EPCI, département, région)': 'Public territorial',
         'Public d’État (ministère, service déconcentré, agence nationale)': 'Public d’État',
         'Privé (entreprise, bureau d’études)': 'Privé',
         'Parapublic (syndicat mixte, EPIC…)': 'Parapublic',
         'Autre': 'Autre (voir carte)'
       },
       colors: {
         'Public territorial (collectivité, EPCI, département, région)': '#1f77b4',
         'Public d’État (ministère, service déconcentré, agence nationale)': '#ff7f0e',
         'Privé (entreprise, bureau d’études)': '#2ca02c',
         'Parapublic (syndicat mixte, EPIC…)': '#d62728',
         'Autre': '#9467bd'
       },
       dataviz: { type: 'bar-horizontal' },
       mapTheme: { type: 'color' },
       popup: '<div><strong>Structure :</strong> {structure_autre} - {structure}</div>'
     },
     alea_reprise: {
       label: 'Reprise du projet après un ou des aléas',
       group: 'Général',
       type: 'checkbox', match: 'equals',
       dataviz: { type: 'bar-horizontal' }
     },
     role: {
       label: 'Rôle durant le projet',
       group: 'Acteurs',
       type: 'checkbox', match: 'equals',
       dataviz: { type: 'pie' }
     },
     nb_acteurs_differents: {
       label: 'Nombre d’acteurs impliqués',
       group: 'Acteurs',
       type: 'checkbox', match: 'equals',
       dataviz: { type: 'bar-horizontal' },
       mapTheme: { type: 'color' }
     },
     repartition_roles: {
       label: 'Répartition des rôles clés dans le pilotage',
       group: 'Acteurs',
       type: 'checkbox', match: 'equals',
       dataviz: { type: 'bar-horizontal' },
       mapTheme: { type: 'color' }
     },
     comprehension_sig_acteurs: {
       label: 'Compréhension des acteurs par rapport aux SIG',
       group: 'Acteurs',
       type: 'range', match: 'range',
       dataviz: null
     },
     copil: {
       label: 'Comités de pilotage (COPIL)',
       group: 'Acteurs',
       type: 'checkbox', match: 'equals',
       dataviz: { type: 'bar-horizontal' },
       mapTheme: { type: 'color' }
     },
     docs_presence: {
       label: 'Présence documentation',
       description: 'Qualité ou existence de la documentation',
       group: 'Documentation',
       type: 'checkbox', match: 'equals',
       colors: {
         'Oui, structurée et à jour': '#2ca02c',
         'Oui, mais peu claire ou obsolète': '#ff7f0e',
         'Non, ou documentation informelle': '#d62728',
         'Je ne sais pas': '#7f7f7f'
       },
       dataviz: { type: 'pie' },
       mapTheme: { type: 'color' },
       popup: `<div><strong>Présence documentation :</strong> {docs_presence}</div>`
     },
     docs_formats: {
       label: 'Formats doc.',
       description: 'Formats utilisés (CSV, Docx…)',
       group: 'Documentation',
       type: 'multiva', match: 'hasAny', sep: ', ',
       options: {
         catalog: 'Catalogue de métadonnées',
          qgz: 'Fichier "projet" des logiciels (.qgz, .fmw., .aprx...) et données géographiques',
          docx: 'Fichiers bureautiques : Word, PDF, etc',
          mails: 'Historique des mails, compte-rendus de réunion, Note interne',
          tuto: 'Tutoriels',
          wiki: 'Wiki interne / Confluence',
          comments: 'Commentaires dans le code, Readme'
       },
       colors: {
         catalog: '#1f77b4',
          qgz: '#ff7f0e',
          docx: '#2ca02c',
          mails: '#d62728',
          tuto: '#9467bd',
          wiki: '#8c564b',
          comments: '#e377c2'
       },
       dataviz: { type: 'bar-horizontal', split: ', ' },
       mapTheme: { type: 'pie', multiField: 'docs_formats', sizeField: 'docs_nb_formats' },
       popup: `<div><strong>Formats :</strong> {docs_formats}</div><div><strong>Nb formats :</strong> {docs_nb_formats}</div>`
     },
     docs_nb_formats: {
       label: 'Nb formats',
       description: 'Nombre de formats cités',
       group: 'Documentation',
       type: 'range', match: 'range',
       dataviz: null
     },
     docs_note: {
       label: 'Note du choix de format de documentation',
       description: 'Influence sur la pérennité du projet, 1 = influence très négative, 5 = neutre, 10 = influence très positive',
       group: 'Documentation',
       type: 'range', match: 'range',
       dataviz: { type: 'histogram' }
     },
     // **Champs “texte libre” avec thème dédié**
     specificite_sig: {
       label: 'Spécificité SIG',
       description: 'Texte libre : défis ou points forts liés au SIG ?',
       group: 'Analyse qualitative',
       type: 'text',
       dataviz: { type: 'wordcloud' },
       mapTheme: { type: 'text' },
       popup: `<div><strong>Spécificité SIG :</strong> {specificite_sig}</div>`
     },
     specificite_sig_groupe: {
       label: 'Thèmes des spécificités',
       group: 'Analyse qualitative',
       type: 'multiva', match: 'hasAny', sep: ', ',
       colors: {
         Technique: '#1f77b4',
          Territorial: '#ff7f0e',
          Humain: '#2ca02c',            
         'Pas de différence': '#d62728',
          Organisationnel: '#9467bd',
          Transversalité: '#8c564b',
          Vide:'#777777'
       },
       dataviz: { type: 'bar-horizontal', split: ', ' },
       mapTheme: { type: 'pie', multiField: 'specificite_sig_groupe'},
       popup: `<div><strong>Spécificité SIG :</strong> {specificite_sig}</div><div><strong>Groupe·s :</strong> {specificite_sig_groupe}</div>`
     },
     conseil: {
       label: 'Conseils',
       description: 'Texte libre : conseils ou retours généraux',
       group: 'Analyse qualitative',
       type: 'text',
       dataviz: { type: 'wordcloud' },
       mapTheme: { type: 'text' },
       popup: `<div><strong>Conseil :</strong> {conseil}</div>`
     },
     conseil_groupe: {
       label: 'Thèmes des conseils',
       group: 'Analyse qualitative',
       type: 'multiva', match: 'hasAny', sep: ', ',
       colors: {
         'Cadrage du besoin et parties prenantes': '#1f77b4',
         'Communication et pédagogie': '#ff7f0e',
         'Organisation et pilotage': '#2ca02c',
         'Collaboration et transversalité': '#d62728',
         'Simplicité et pragmatisme': '#9467bd',
         'Qualité des données et documentation': '#8c564b',
         'Compétences et accompagnement': '#e377c2',
         'Choix des outils et interopérabilité': '#7f7f7f',
         'Anticipation et pérennité': '#bcbd22',
         'Leadership et responsabilisation': '#17becf',
          Vide:'#777777'
       },
       dataviz: { type: 'bar-horizontal', split: ', ' },
       mapTheme: { type: 'pie', multiField: 'conseil_groupe'},
       popup: `<div><strong>Conseil : :</strong> {conseil}</div><div><strong>Groupe·s :</strong> {conseil_groupe}</div>`
     },
     techno: {
       label: 'Choix techniques',
       description: 'Technologies différentes utilisées',
       group: 'Technologie',
       type: 'multiva', match: 'hasAny', sep: ', ',
       options: {
          libre: 'Logiciels libres (ex. QGIS, PostGIS…)',
          proprio: 'Solutions propriétaires (ex. ArcGIS, FME…)',
          standards: 'Standards ouverts (OGC, GeoJSON, WMS…)',
          code: 'Scripts internes / code maison',
          nsp: 'Je ne sais pas / non impliqué·e techniquement'
       },
       colors: {
          libre: '#1f77b4',
          proprio: '#ff7f0e',
          standards: '#2ca02c',
          code: '#d62728',
          nsp: '#9467bd'
       },
       dataviz: { type: 'bar-horizontal', split: ', ' },
       mapTheme: { type: 'pie', multiField: 'techno', sizeField: 'techno_nb' },
       popup: `<div><strong>Technologies :</strong> {techno}</div><div><strong>Nombre de technologies utilisées :</strong> {techno_nb}</div>`
     },
     techno_nb: {
       label: 'Nombre de technologies utilisées',
       group: 'Technologie',
       type: 'range', match: 'range',
       dataviz: null
     },
     techno_note: {
       label: 'Note du choix technique',
       description: 'Influence sur la pérennité du projet, 1 = influence très négative, 5 = neutre, 10 = influence très positive',
       group: 'Technologie',
       type: 'range', match: 'range',
       dataviz: { type: 'histogram' }
     },
     methode_proj: {
       label: 'Méthode de gestion de projet choisie',
       group: 'Méthode de gestion',
       type: 'multiva', match: 'hasAny', sep: ', ',
       options: {
         scrum: 'Agile - Scrum',
         kamban: 'Agile - Kanban',
         waterfall: 'Cycle en V / Waterfall',
         prince2: 'PRINCE2',
         lean: 'Lean / DevOps',
         rien: 'Aucune',
         autre: 'Autre (voir carte)',
         nsp: 'Je ne sais pas'
       },
       colors: {
         scrum: '#1f77b4',
         kamban: '#ff7f0e',
         waterfall: '#2ca02c',
         prince2: '#d62728',
         lean: '#9467bd',
         rien: '#8c564b',
         autre: '#e377c2',
         nsp: '#7f7f7f'
       },
       dataviz: { type: 'bar-horizontal', split: ', ' },
       mapTheme: { type: 'pie', multiField: 'methode_proj', sizeField: 'methode_nb' },
       popup: `<div><strong>Méthode de gestion :</strong> {methode_proj}</div><div><strong>Nombre de méthodes utilisées :</strong> {methode_nb}</div>`
     },
     methode_nb: {
       label: 'Nombre de méthodes utilisées',
       group: 'Méthode de gestion',
       type: 'range', match: 'range',
       dataviz: null
     },
     methode_note: {
       label: 'Note du choix de la méthode',
       description: 'Influence sur la pérennité du projet, 1 = influence très négative, 5 = neutre, 10 = influence très positive',
       group: 'Méthode de gestion',
       type: 'range', match: 'range',
       dataviz: { type: 'histogram' }
     },
     outil_proj: {
       label: 'Outils de gestion de projet choisis',
       group: 'Outils de gestion',
       type: 'multiva', match: 'hasAny', sep: ', ',
       options: {
         jira: 'Jira / Jira Software',
         trello: 'Trello',
         monday: 'Monday.com',
         project: 'Microsoft Project',
         asana: 'Asana',
         git: 'GitLab Issues / Boards / GitHub Projects',
         excel: 'Tableur (Excel, LibreOffice Calc, Google Sheets)',
         notion: 'Basecamp / Notion / plateformes collaboratives',
         rien: 'Aucun outil dédié',
         autre: 'Autre (voir carte)'
       },
       colors: {
         jira: '#1f77b4',
         trello: '#ff7f0e',
         monday: '#2ca02c',
         project: '#d62728',
         asana: '#9467bd',
         git: '#8c564b',
         excel: '#e377c2',
         notion: '#7f7f7f',
         rien: '#bcbd22',
         autre: '#17becf'
       },
       dataviz: { type: 'bar-horizontal', split: ', ' },
       mapTheme: { type: 'pie', multiField: 'outil_proj', sizeField: 'outil_proj_nb' },
       popup: `<div><strong>Outils de gestion :</strong> {outil_proj}</div><div><strong>Nombre d'outils utilisées :</strong> {outil_proj_nb}</div>`
     },
     outil_proj_nb: {
       label: "Nombre d'outils utilisés",
       group: 'Outils de gestion',
       type: 'range', match: 'range',
       dataviz: null
     },
     outil_proj_note: {
       label: 'Note du choix des outils de gestion',
       description: 'Influence sur la pérennité du projet, 1 = influence très négative, 5 = neutre, 10 = influence très positive',
       group: 'Outils de gestion',
       type: 'range', match: 'range',
       dataviz: { type: 'histogram' }
     },
     influence: {
       label: 'Causes principales',
       group: 'Influences sur la réussite ou l’échec',
       type: 'multiva', match: 'hasAny', sep: ', ',
       options: {
         Orga: 'Organisationnelles (pilotage, RH, gouvernance…)',
         budget: 'Budgétaires',
         technique: 'Techniques (choix logiciels, dette technique, infrastructure…)',            
         humaine: 'Humaines (compétences, communication, appropriation…)',
         politique: 'Conjoncturelles / politiques (changement d’élus, urgence, opportunité…)',
         autre: 'Autres (voir carte)'
       },
       colors: {
         Orga: '#1f77b4',
         budget: '#ff7f0e',
         technique: '#2ca02c',            
         humaine: '#d62728',
         politique: '#9467bd',
         autre: '#8c564b'
       },
       dataviz: { type: 'bar-horizontal', split: ', ' },
       mapTheme: { type: 'pie', multiField: 'influence', sizeField: 'influence_nb'},
       popup: `<div><strong>Influences :</strong> {influence}</div>`
     },
     influence_orga_com: {
       label: 'Influences organisationnelles',
       group: 'Influences sur la réussite ou l’échec',
       type: 'text',
       dataviz: { type: 'wordcloud' },
       mapTheme: { type: 'text' },
       popup: `<div><strong>Influences organisationnelles (pilotage, RH, gouvernance…) :</strong> {influence_orga_com}</div>`
     },
     influence_budget_com: {
       label: 'Influences budgétaires',
       group: 'Influences sur la réussite ou l’échec',
       type: 'text',
       dataviz: { type: 'wordcloud' },
       mapTheme: { type: 'text' },
       popup: `<div><strong>Influences Budgétaires :</strong> {influence_budget_com}</div>`
     },
     influence_technique_com: {
       label: 'Influences techniques',
       group: 'Influences sur la réussite ou l’échec',
       type: 'text',
       dataviz: { type: 'wordcloud' },
       mapTheme: { type: 'text' },
       popup: `<div><strong>Influences techniques (choix logiciels, dette technique, infrastructure…) :</strong> {influence_technique_com}</div>`
     },
     influence_humaine_com: {
       label: 'Influences humaines',
       group: 'Influences sur la réussite ou l’échec',
       type: 'text',
       dataviz: { type: 'wordcloud' },
       mapTheme: { type: 'text' },
       popup: `<div><strong>Influences humaines (compétences, communication, appropriation…) :</strong> {influence_humaine_com}</div>`
     },
     influence_politique_com: {
       label: 'Influences politiques / conjoncturelles',
       group: 'Influences sur la réussite ou l’échec',
       type: 'text',
       dataviz: { type: 'wordcloud' },
       mapTheme: { type: 'text' },
       popup: `<div><strong>Influences conjoncturelles / politiques (changement d’élus, urgence, opportunité…) :</strong> {influence_politique_com}</div>`
     },
     influence_autre_com: {
       label: 'Autres influences',
       group: 'Influences sur la réussite ou l’échec',
       type: 'text',
       dataviz: { type: 'wordcloud' },
       mapTheme: { type: 'text' },
       popup: `<div><strong>Autres influences :</strong> {influence_autre_com}</div>`
     }
   },
   groupOrder: ['Général', 'Acteurs', 'Influences sur la réussite ou l’échec', 'Analyse qualitative', 'Technologie', 'Documentation', 'Méthode de gestion', 'Outils de gestion'],
   continuousConfig: { outil_proj_note : d3.interpolateWarm, methode_note : d3.interpolateWarm, techno_note : d3.interpolateWarm, docs_note : d3.interpolateWarm }
 }
