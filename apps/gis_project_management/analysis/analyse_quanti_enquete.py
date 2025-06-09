import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import seaborn as sns
import plotly.graph_objects as go
from sklearn.preprocessing import MinMaxScaler
from sklearn.cluster import KMeans
from sklearn.metrics import pairwise_distances_argmin_min
import networkx as nx
from upsetplot import UpSet
import prince
from wordcloud import WordCloud
from collections import Counter
import re


# --------------------- PALETTES & ORDRES ---------------------
issue_order = ['Succès', 'Échec puis relance', 'Échec (abandon, gel, oubli)', 'Autre']
issue_palette = {
    'Succès': '#43a047',
    'Échec puis relance': '#ffb300',
    'Échec (abandon, gel, oubli)': '#e53935',
    'Autre': '#1e88e5'
}
doc_labels = ['Avec doc', 'Sans doc']
doc_palette = {'Avec doc': "#26a69a", 'Sans doc': "#d84315"}

# Blend function for rgba (simulate gradient link)
def blend(color1, color2, alpha=0.35):
    c1 = tuple(int(color1[i:i+2], 16) for i in (1,3,5))
    c2 = tuple(int(color2[i:i+2], 16) for i in (1,3,5))
    r = int(c1[0]*alpha + c2[0]*(1-alpha))
    g = int(c1[1]*alpha + c2[1]*(1-alpha))
    b = int(c1[2]*alpha + c2[2]*(1-alpha))
    return f"rgba({r},{g},{b},0.7)"

# --------------------- DATA LOAD ---------------------
df = pd.read_csv("resultats_enquete_quanti.csv", encoding='utf-8')
df['issue'] = df['issue'].fillna('Autre')
df['doc'] = df['docs_presence'].apply(lambda x: "Avec doc" if pd.notnull(x) and "Non" not in x else "Sans doc")

# --------------------- Sankey DOC -> ISSUE (dégradé) ---------------------
all_labels = doc_labels + issue_order
doc_idx = {doc: i for i, doc in enumerate(doc_labels)}
issue_idx = {issue: i+len(doc_labels) for i, issue in enumerate(issue_order)}
sources, targets, values, link_colors = [], [], [], []
for d in doc_labels:
    for i in issue_order:
        n = len(df[(df['doc'] == d) & (df['issue'] == i)])
        if n > 0:
            sources.append(doc_idx[d])
            targets.append(issue_idx[i])
            values.append(n)
            color = blend(doc_palette[d], issue_palette[i], alpha=0.35)
            link_colors.append(color)
node_colors = [doc_palette[x] for x in doc_labels] + [issue_palette[x] for x in issue_order]
fig = go.Figure(data=[go.Sankey(
    node=dict(pad=15, thickness=20, label=all_labels, color=node_colors),
    link=dict(source=sources, target=targets, value=values, color=link_colors)
)])
fig.update_layout(title_text="Documentation → Issue du projet SIG (ordre & dégradés)", font_size=13, plot_bgcolor='white')
fig.show()

# --------------------- Sankey TECHNO -> ISSUE (dégradé) ---------------------
def techno_type(x):
    if pd.isnull(x): return 'Autre'
    if "standard" in x.lower() or "ogc" in x.lower(): return "Standard ouvert"
    if "libre" in x.lower() or "open" in x.lower(): return "Open source"
    if "proprio" in x.lower(): return "Propriétaire"
    return "Autre"
df['type_techno'] = df['techno'].apply(techno_type)
techno_labels = ['Standard ouvert', 'Open source', 'Propriétaire', 'Autre']
techno_palette = {'Standard ouvert': "#1976d2", 'Open source': "#388e3c", 'Propriétaire': "#6d4c41", 'Autre': "#757575"}
labels = techno_labels + issue_order
techno_idx = {typ: i for i, typ in enumerate(techno_labels)}
sources, targets, values, link_colors = [], [], [], []
for t in techno_labels:
    for i in issue_order:
        n = len(df[(df['type_techno'] == t) & (df['issue'] == i)])
        if n > 0:
            sources.append(techno_idx[t])
            targets.append(len(techno_labels) + issue_order.index(i))
            values.append(n)
            color = blend(techno_palette[t], issue_palette[i], alpha=0.35)
            link_colors.append(color)
node_colors = [techno_palette[x] for x in techno_labels] + [issue_palette[x] for x in issue_order]
fig = go.Figure(data=[go.Sankey(
    node=dict(label=labels, color=node_colors),
    link=dict(source=sources, target=targets, value=values, color=link_colors)
)])
fig.update_layout(title_text="Technologie → Issue du projet SIG (ordre & dégradés)", font_size=13, plot_bgcolor='white')
fig.show()

# --------------------- Sankey FORMAT DOC -> ISSUE (dégradé) ---------------------
docs_format_types = ['docx', 'mails', 'tuto', 'wiki', 'catalog', 'qgz', 'comments']
format_palette = dict(zip(docs_format_types, sns.color_palette("Set2", n_colors=len(docs_format_types)).as_hex()))
labels = docs_format_types + issue_order
format_idx = {f: i for i, f in enumerate(docs_format_types)}
sources, targets, values, link_colors = [], [], [], []
for f in docs_format_types:
    for i in issue_order:
        n = df[(df['docs_formats'].fillna('').str.contains(f)) & (df['issue'] == i)].shape[0]
        if n > 0:
            sources.append(format_idx[f])
            targets.append(len(docs_format_types) + issue_order.index(i))
            values.append(n)
            color = blend(format_palette[f], issue_palette[i], alpha=0.35)
            link_colors.append(color)
node_colors = [format_palette[x] for x in docs_format_types] + [issue_palette[x] for x in issue_order]
fig = go.Figure(data=[go.Sankey(
    node=dict(label=labels, color=node_colors),
    link=dict(source=sources, target=targets, value=values, color=link_colors)
)])
fig.update_layout(title_text="Format de documentation → Issue du projet SIG (ordre & dégradés)", font_size=13, plot_bgcolor='white')
fig.show()

# --------------------- Violin plot avec ordre/palette fixée ---------------------
df['hybridite'] = df[['methode_nb', 'techno_nb', 'outil_proj_nb', 'docs_nb_formats']].sum(axis=1)
sns.violinplot(x='issue', y='hybridite', data=df, order=issue_order, palette=issue_palette)
plt.title("Score d’hybridité des projets SIG selon l’issue")
plt.xlabel("Issue"); plt.ylabel("Score d'hybridité (méthodes + outils + docs)")
plt.tight_layout()
plt.show()

# --------------------- Scatterplot durée/transmission avec palette fixée ---------------------
duree_map = {
    'Moins de 1 mois': 0.1, '1 à 6 mois': 0.5, '6 mois à 1 an': 0.75, '1 à 3 ans': 2, 
    '3 à 5 ans': 4, 'Plus de 5 ans': 7
}
df['duree_num'] = df['duree'].map(duree_map)
df['transmission_score'] = (
    (df['docs_presence'].str.contains('Non', na=False) == False).astype(int) +
    (df['docs_nb_formats'] > 1).astype(int) +
    (df['docs_note'] > 5).astype(int) +
    (df['repartition_roles'].str.contains('plusieurs|tournant', case=False, na=False)).astype(int) +
    (df['copil'].str.contains('oui', case=False, na=False)).astype(int) +
    (df['alea_reprise'].str.contains('reprise', case=False, na=False)).astype(int)
)
sns.scatterplot(x='transmission_score', y='duree_num', hue='issue', data=df, hue_order=issue_order, palette=issue_palette)
plt.title("Score de transmission/maintenance vs durée et issue")
plt.xlabel("Score de transmission/maintenance")
plt.ylabel("Durée du projet (années)")
plt.tight_layout()
plt.show()

# --------------------- Barplot rupture mémoire ---------------------
df['rupture_memoire'] = (
    (df['repartition_roles'].str.contains('une personne clé|1 seul', case=False, na=False)) &
    (df['docs_presence'].str.contains('Non', na=False)) &
    (df['copil'].str.contains('non', case=False, na=False))
)
rupture_tab = pd.crosstab(df['rupture_memoire'], df['issue'], normalize='index')[issue_order]
rupture_tab.plot(kind='bar', stacked=True, color=[issue_palette[x] for x in issue_order])
plt.title("Proportion d’issues pour les projets à risque de rupture de mémoire")
plt.ylabel("Part (%)")
plt.xlabel("Rupture de mémoire")
plt.tight_layout()
plt.show()

# --------------------- Durée moyenne par issue (ordre/couleur) ---------------------
durée_moyenne = df.groupby('issue')['duree_num'].mean().reindex(issue_order)
plt.bar(durée_moyenne.index, durée_moyenne.values, color=[issue_palette[x] for x in issue_order])
plt.title("Durée moyenne des projets SIG selon l'issue")
plt.ylabel("Durée moyenne (années)")
plt.xticks(rotation=30)
plt.tight_layout()
plt.show()

# --------------------- Radar plot : profils moyens par issue (ordre/couleur) ---------------------
radar_vars = ['docs_note','methode_note','outil_proj_note','techno_note','comprehension_sig_acteurs']
means = df.groupby('issue')[radar_vars].mean().reindex(issue_order)
angles = np.linspace(0, 2*np.pi, len(radar_vars), endpoint=False).tolist()
angles += angles[:1]
fig = plt.figure(figsize=(7,7))
ax = plt.subplot(111, polar=True)
for i, issue in enumerate(issue_order):
    values = means.loc[issue].tolist()
    values += values[:1]
    ax.plot(angles, values, label=issue, color=issue_palette[issue])
    ax.fill(angles, values, alpha=0.10, color=issue_palette[issue])
ax.set_xticks(angles[:-1])
ax.set_xticklabels(radar_vars)
plt.legend(loc='upper right', bbox_to_anchor=(1.3,1.1))
plt.title("Profil moyen par issue de projet")
plt.show()

# Harmonisation des variables clés
df['issue'] = df['issue'].fillna('Autre')
df['copil'] = df['copil'].fillna('Non')
df['docs_presence'] = df['docs_presence'].fillna('Non')
for col in ['methode_nb', 'outil_proj_nb', 'docs_nb_formats', 'docs_note', 'methode_note', 'outil_proj_note']:
    df[col] = pd.to_numeric(df[col], errors='coerce')

# ----------- Analyse des causes ------------

# 1. Nuages de mots des causes citées selon l'issue -- innovant 
issue_texts = {issue: [] for issue in issue_palette}
for idx, row in df[['influence','issue']].dropna().iterrows():
    for cause in [e.strip() for e in re.split(',|;', str(row['influence']).lower()) if e.strip()]:
        if row['issue'] in issue_texts:
            issue_texts[row['issue']].append(cause)
fig, axes = plt.subplots(1, len(issue_palette), figsize=(5*len(issue_palette), 6))
for i, (issue, color) in enumerate(issue_palette.items()):
    ax = axes[i] if len(issue_palette) > 1 else axes
    counts = Counter(issue_texts[issue])
    total = sum(counts.values())
    freqs = {k: v/total for k, v in counts.items()} if total > 0 else {}
    wc = WordCloud(width=600, height=600, background_color='white', color_func=lambda *args, **kwargs: color)
    wc.generate_from_frequencies(freqs)
    ax.imshow(wc, interpolation='bilinear')
    ax.set_title(issue, fontsize=16, color=color)
    ax.axis("off")
plt.suptitle("Causes citées dans chaque issue (taille = proportion)", fontsize=18)
plt.tight_layout()
plt.subplots_adjust(top=0.82)
plt.show()

# 2. Top causes toutes issues confondues
causes = df['influence'].dropna().apply(lambda x: [c.strip() for c in re.split(',|;', x.lower()) if c.strip()])
all_causes = [c for sublist in causes for c in sublist]
cause_counts = Counter(all_causes)
cause_df = pd.DataFrame.from_dict(cause_counts, orient='index', columns=['count']).sort_values('count', ascending=False)
cause_df.head(10).plot(kind='bar', legend=False, color=issue_palette['Autre'])
plt.title('Principales causes citées (toutes issues)')
plt.xlabel('Cause')
plt.ylabel('Nb de citations')
plt.tight_layout()
plt.show()

# 3. Heatmap causes x issue (proportion)
cause_issue = {}
for idx, row in df[['influence','issue']].dropna().iterrows():
    for c in [e.strip() for e in re.split(',|;', str(row['influence']).lower()) if e.strip()]:
        if c not in cause_issue:
            cause_issue[c] = Counter()
        cause_issue[c][row['issue']] += 1
cause_issue_df = pd.DataFrame(cause_issue).T.fillna(0)[issue_order]
cause_issue_prop = cause_issue_df.div(cause_issue_df.sum(axis=0), axis=1) * 100
plt.figure(figsize=(14,8))
sns.heatmap(cause_issue_prop, annot=True, fmt=".1f", cmap='YlOrRd', cbar_kws={'label': 'Pourcentage (%)'}, linewidths=0.7)
plt.title("Proportion des causes citées selon l'issue du projet")
plt.xlabel("Issue")
plt.ylabel("Cause")
plt.tight_layout()
plt.show()

# ----------- Hypothèse 1 : Méthodes, outils, doc, équipe ------------

# 1. Nombre de formats de documentation selon issue
sns.boxplot(x='issue', y='docs_nb_formats', data=df, order=issue_order, palette=issue_palette)
plt.title('Nombre de formats de documentation selon issue')
plt.xlabel('Issue')
plt.tight_layout()
plt.show()

# 2. Note de doc selon taille d'équipe x issue (heatmap)  -- innovant 
df['taille_num'] = df['nb_acteurs_differents'].replace({'1 seul':1, '2 – 3':2.5, '4 – 5':4.5, 'Plus de 5':6})
pivot = df.pivot_table(index='taille_num', columns='issue', values='docs_note', aggfunc='mean')[issue_order]
sns.heatmap(pivot, annot=True, cmap='Blues')
plt.title("Note moyenne de documentation selon taille d'équipe et issue")
plt.xlabel("Taille d'équipe")
plt.ylabel("Issue")
plt.tight_layout()
plt.show()

# 3. Issue vs nombre de méthodes/outils (proportion)
df['methode_nb_cat'] = pd.cut(df['methode_nb'], bins=[-1,0,1,2,10], labels=["0","1","2","3 et +"])
sns.histplot(data=df, x="methode_nb_cat", hue="issue", multiple="fill", palette=issue_palette, hue_order=issue_order, stat="probability", shrink=.85)
plt.title("Issue selon le nombre de méthodes utilisées")
plt.xlabel("Nombre de méthodes")
plt.ylabel("Part (%)")
plt.legend(title="issue", bbox_to_anchor=(1.02, 1), loc='upper left')
plt.tight_layout()
plt.show()

df['outil_proj_nb_cat'] = pd.cut(df['outil_proj_nb'], bins=[-1,0,1,2,10], labels=["0","1","2","3 et +"])
sns.histplot(data=df, x="outil_proj_nb_cat", hue="issue", multiple="fill", palette=issue_palette, hue_order=issue_order, stat="probability", shrink=.85)
plt.title("Issue selon le nombre d'outils de gestion utilisés")
plt.xlabel("Nombre d'outils de gestion")
plt.ylabel("Part (%)")
plt.legend(title="issue", bbox_to_anchor=(1.02, 1), loc='upper left')
plt.tight_layout()
plt.show()

# 4. Présence de documentation
sns.histplot(data=df, x="docs_presence", hue="issue", multiple="fill", palette=issue_palette, hue_order=issue_order, stat="probability", shrink=.85)
plt.title("Issue selon la présence de documentation")
plt.xlabel("Présence de documentation")
plt.ylabel("Part (%)")
plt.legend(title="issue", bbox_to_anchor=(1.02, 1), loc='upper left')
plt.tight_layout()
plt.show()

# ----------- Hypothèse 2 : Standards ouverts, modularité, dépendance ------------

# 1. Standards ouverts et open source
df['utilise_standard_ouvert'] = df['techno'].fillna('').str.contains('OGC|GeoJSON|WMS|WFS|GML|standard', case=False, na=False)
df['utilise_open_source'] = df['techno'].fillna('').str.contains('libre|open|qgis|code', case=False, na=False)

sns.histplot(data=df, x="utilise_standard_ouvert", hue="issue", multiple="fill", palette=issue_palette, hue_order=issue_order, stat="probability", shrink=.85)
plt.title("Issue selon usage de standards ouverts")
plt.xlabel("Utilise standard ouvert")
plt.ylabel("Part (%)")
plt.legend(title="issue", bbox_to_anchor=(1.02, 1), loc='upper left')
plt.tight_layout()
plt.show()

sns.histplot(data=df, x="utilise_open_source", hue="issue", multiple="fill", palette=issue_palette, hue_order=issue_order, stat="probability", shrink=.85)
plt.title("Issue selon usage de technologies open source")
plt.xlabel("Utilise techno open source")
plt.ylabel("Part (%)")
plt.legend(title="issue", bbox_to_anchor=(1.02, 1), loc='upper left')
plt.tight_layout()
plt.show()

# 2. Nombre de technologies différentes vs issue
df['techno_nb_cat'] = pd.cut(df['techno_nb'], bins=[-1,0,1,2,10], labels=["0","1","2","3 et +"])
sns.histplot(data=df, x="techno_nb_cat", hue="issue", multiple="fill", palette=issue_palette, hue_order=issue_order, stat="probability", shrink=.85)
plt.title("Issue selon le nombre de technologies différentes utilisées")
plt.xlabel("Nombre de technologies")
plt.ylabel("Part (%)")
plt.legend(title="issue", bbox_to_anchor=(1.02, 1), loc='upper left')
plt.tight_layout()
plt.show()

# ----------- Hypothèse 3 : Gouvernance partagée, rôles ------------

df['un_seul'] = df['repartition_roles'].str.contains("une personne clé|1 seul", case=False, na=False)
df['gouvernance_partagee'] = ~df['un_seul']

sns.boxplot(x='gouvernance_partagee', y='comprehension_sig_acteurs', data=df, palette=["#e53935", "#1e88e5"])
plt.xticks([0,1], ["1 personne clé", "Gouvernance partagée"])
plt.title("Compréhension SIG selon gouvernance")
plt.xlabel("Gouvernance")
plt.ylabel("Score de compréhension SIG")
plt.tight_layout()
plt.show()

tab_roles = pd.crosstab(df['repartition_roles'], df['issue'], normalize='index')[issue_order]
sns.heatmap(tab_roles, annot=True, cmap='RdBu')
plt.title("Répartition des rôles vs issue")
plt.xlabel("Issue")
plt.ylabel("Répartition des rôles")
plt.tight_layout()
plt.show()

# Présence COPIL et répartition des rôles vs issue (proportion)
for col, label in [('copil', "Présence d’un COPIL"), ('repartition_roles', "Répartition des rôles")]:
    tab = pd.crosstab(df[col], df['issue'], normalize='index')[issue_order]
    tab.plot(kind='bar', stacked=True, color=[issue_palette[i] for i in issue_order])
    plt.title(f"Proportion d’issues selon : {label}")
    plt.ylabel("Part (%)")
    plt.xlabel(label)
    plt.legend(title="issue", bbox_to_anchor=(1.02, 1), loc='upper left')
    plt.tight_layout()
    plt.show()

# ----------- Impact perçu par aspect (diverging bar) ------------  innovant 

note_cols = {
    "techno_note": "Choix technique",
    "docs_note": "Format documentation",
    "methode_note": "Méthode projet",
    "outil_proj_note": "Outil projet"
}
means = df.groupby('issue')[[*note_cols.keys()]].mean().reindex(issue_order)
means_centered = means - 5
aspects = list(note_cols.values())
col_keys = list(note_cols.keys())

fig, axes = plt.subplots(nrows=len(means_centered.index), ncols=1, figsize=(8, 10), sharex=True)
for i, issue in enumerate(means_centered.index):
    ax = axes[i]
    vals = means_centered.loc[issue, col_keys]
    colors = ['#e53935' if v < 0 else '#1e88e5' for v in vals]
    bars = ax.barh(aspects, vals, color=colors)
    ax.axvline(0, color='grey', linewidth=1)
    ax.set_title(issue, color=issue_palette[issue])
    for bar, v in zip(bars, vals):
        ax.text(v + (0.1 if v > 0 else -0.1), bar.get_y() + bar.get_height()/2, f"{v:+.1f}", va='center', ha='left' if v > 0 else 'right', fontsize=11)
plt.xlabel("Impact relatif (négatif = effet perçu négatif, positif = effet perçu positif)")
plt.suptitle("Impact perçu sur la pérennité par issue du projet")
plt.tight_layout(rect=[0, 0.03, 1, 0.97])
plt.show()

# ----------- Corrélation nombre de formats/note de doc ------------

plt.figure(figsize=(6,4))
sns.regplot(x='docs_nb_formats', y='docs_note', data=df, scatter_kws={'alpha':0.6})
plt.xlabel("Nombre de formats de documentation")
plt.ylabel("Note de documentation")
plt.title("Corrélation : nombre de formats et qualité de la documentation")
plt.tight_layout()
plt.show()

corr = df[['docs_nb_formats', 'docs_note']].corr().iloc[0,1]
print(f"Corrélation (Pearson) entre nombre de formats et note de documentation : {corr:.2f}")
