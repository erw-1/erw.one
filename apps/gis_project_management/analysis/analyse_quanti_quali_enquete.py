import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from collections import Counter

# 1. Chargement des jeux de données
df_quanti = pd.read_csv("resultats_enquete_quanti.csv", sep=",", encoding="utf-8")
df_spec = pd.read_csv("analyse_quali_enquete_specificite.csv", sep=";", encoding="latin1")
df_conseil = pd.read_csv("analyse_quali_enquete_conseil.csv", sep=";", encoding="latin1")

# 2. Harmonisation de la clé d'appariement (id doit être une chaîne)
for df in [df_quanti, df_spec, df_conseil]:
    df['id'] = df['id'].astype(str)

# 3. Fusion des jeux quali/quanti sur 'id'
df_spec_merged = df_spec.merge(df_quanti, on='id', how='left')
df_conseil_merged = df_conseil.merge(df_quanti, on='id', how='left')

# --------- EXEMPLE 1 : Répartition des hypothèses de conseil selon le type de structure ---------
plt.figure(figsize=(10,5))
sns.countplot(
    data=df_conseil_merged.explode('hypotheses'),
    x='structure',
    hue='hypotheses',
    palette='Set2'
)
plt.title("Conseils : Répartition des hypothèses selon le type de structure")
plt.ylabel("Nombre de répondants")
plt.xlabel("Structure")
plt.xticks(rotation=30, ha="right")
plt.tight_layout()
plt.show()

# --------- EXEMPLE 2 : Conseils selon la réussite du projet ---------
plt.figure(figsize=(10,5))
sns.countplot(
    data=df_conseil_merged.explode('hypotheses'),
    x='issue',
    hue='hypotheses',
    palette='Set1'
)
plt.title("Conseils : Répartition des hypothèses selon le succès ou l'échec du projet")
plt.ylabel("Nombre de répondants")
plt.xlabel("Type d'issue projet")
plt.xticks(rotation=30, ha="right")
plt.tight_layout()
plt.show()

# --------- EXEMPLE 3 : Groupes de conseil par rôle du répondant ---------
plt.figure(figsize=(13,6))
conseil_long = df_conseil_merged.assign(
    groupe=df_conseil_merged['groupe'].fillna('').str.split(", ")
).explode("groupe")
sns.countplot(
    data=conseil_long,
    x='role',
    hue='groupe',
    palette='tab20'
)
plt.title("Conseils : Groupes thématiques selon le rôle du répondant")
plt.ylabel("Nombre de conseils")
plt.xlabel("Rôle")
plt.xticks(rotation=45, ha="right")
plt.tight_layout()
plt.show()

# --------- EXEMPLE 4 : Hypothèse de conseil vs hypothèse de spécificité pour le même répondant ---------
cross = df_spec[['id', 'hypotheses']].merge(
    df_conseil[['id', 'hypotheses']], on='id', suffixes=('_spec', '_conseil')
)
def split_flat(s):
    if pd.isna(s): return []
    return [x.strip() for x in str(s).split(",") if x.strip()]

flat_cross = []
for _, row in cross.iterrows():
    for h_spec in split_flat(row['hypotheses_spec']):
        for h_conseil in split_flat(row['hypotheses_conseil']):
            flat_cross.append((h_spec, h_conseil))

cross_df = pd.DataFrame(flat_cross, columns=['Hypothèse_Spécificité', 'Hypothèse_Conseil'])
cross_tab = pd.crosstab(cross_df['Hypothèse_Spécificité'], cross_df['Hypothèse_Conseil'])
plt.figure(figsize=(8,6))
sns.heatmap(cross_tab, annot=True, fmt="d", cmap="Blues")
plt.title("Cooccurrence des hypothèses : spécificité vs conseil (même répondant)")
plt.tight_layout()
plt.show()
print("\nTableau croisé hypothèses (spécificités vs conseils) :\n", cross_tab)

# --------- EXEMPLE 5 : Groupes de conseil selon la durée du projet ---------
plt.figure(figsize=(12,5))
sns.countplot(
    data=conseil_long,
    x='duree',
    hue='groupe',
    palette='tab10'
)
plt.title("Conseils : Groupes thématiques selon la durée du projet")
plt.ylabel("Nombre de conseils")
plt.xlabel("Durée du projet")
plt.xticks(rotation=45, ha="right")
plt.tight_layout()
plt.show()

# --------- EXEMPLE 6 : Conseils x profils extrêmes (petite vs grande équipe, nb_acteurs_differents) ---------
plt.figure(figsize=(11,5))
sns.countplot(
    data=conseil_long,
    x='nb_acteurs_differents',
    hue='groupe',
    palette='tab20c'
)
plt.title("Conseils : Groupes thématiques selon le nombre d'acteurs différents")
plt.ylabel("Nombre de conseils")
plt.xlabel("Nb d'acteurs différents")
plt.tight_layout()
plt.show()

# --------- EXEMPLE 7 : Barres empilées des groupes de conseils par type d'issue ---------
group_issue = pd.crosstab(conseil_long['issue'], conseil_long['groupe'])
group_issue.plot(kind='bar', stacked=True, figsize=(12,6), colormap='tab20')
plt.title("Conseils : répartition des groupes par issue (succès, échec, etc.)")
plt.ylabel("Nombre de conseils")
plt.xlabel("Type d'issue")
plt.tight_layout()
plt.show()

# --------- EXEMPLE 8 : Citations illustratives pour chaque hypothèse ---------
for hyp in ['H1','H2','H3']:
    print(f"\nExemple(s) de conseil pour l'hypothèse {hyp} :")
    ex = df_conseil[df_conseil['hypotheses'].str.contains(hyp, na=False)].sample(2, random_state=1)
    for _, row in ex.iterrows():
        print(f"- {row['conseil']}")

# --------- EXEMPLE 9 : Tableau croisé Hypothèse de conseil x Structure ---------
cross_hyp_struct = pd.crosstab(
    df_conseil_merged['hypotheses'].fillna('Vide'), df_conseil_merged['structure']
)
print("\nTableau croisé hypothèse de conseil x structure :\n", cross_hyp_struct)

# --------- EXEMPLE 10 : Graphe camembert réussite/échec du projet ---------
plt.figure(figsize=(6,6))
df_conseil_merged['issue'].value_counts().plot.pie(autopct='%1.1f%%', startangle=90, colors=plt.cm.Pastel2.colors)
plt.title("Répartition des conseils selon la réussite ou l'échec du projet")
plt.ylabel("")
plt.tight_layout()
plt.show()

