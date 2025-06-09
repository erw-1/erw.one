import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
from collections import Counter

# 1. Chargement des données
df = pd.read_csv("analyse_quali_enquete_conseil.csv", sep=";", encoding="latin1")

# 2. Comptage des hypothèses (y compris vides)
all_hypotheses = df['hypotheses'].fillna('').str.replace(" ", "").str.split(",")
flat_hypotheses = [item if item else 'Vide' for sublist in all_hypotheses for item in sublist]
hypotheses_count = Counter(flat_hypotheses)
print("Nombre d'occurrences pour chaque hypothèse (y compris vides) :\n", hypotheses_count)

# 3. Visualisation de la répartition des hypothèses
plt.figure(figsize=(7,4))
pd.Series(flat_hypotheses).value_counts().plot(kind="bar", color='cornflowerblue')
plt.title("Répartition des hypothèses dans les conseils (y compris vides)")
plt.xlabel("Hypothèse")
plt.ylabel("Nombre de conseils")
plt.tight_layout()
plt.show()

# 4. Comptage des groupes (y compris vides)
all_groups = df['groupe'].fillna('Vide').str.replace(" ", "").str.split(",")
flat_groups = [item if item else 'Vide' for sublist in all_groups for item in sublist]
groups_count = Counter(flat_groups)
print("\nNombre d'occurrences pour chaque groupe (y compris vides) :\n", groups_count)

# 5. Visualisation de la répartition des groupes
plt.figure(figsize=(10,4))
pd.Series(flat_groups).value_counts().plot(kind="bar", color='darkorange')
plt.title("Occurrences des groupes dans les conseils (y compris vides)")
plt.xlabel("Groupe thématique")
plt.ylabel("Nombre de conseils")
plt.tight_layout()
plt.show()

# 6. Tableau croisé Hypothèses x Groupes (analyse de cooccurrence)
df_exploded = df.assign(
    hypotheses=df['hypotheses'].fillna('').str.replace(" ", "").str.split(","),
    groupe=df['groupe'].fillna('Vide').str.replace(" ", "").str.split(",")
).explode("hypotheses").explode("groupe")

df_exploded['hypotheses'] = df_exploded['hypotheses'].replace('', 'Vide')
df_exploded['groupe'] = df_exploded['groupe'].replace('', 'Vide')

cross = pd.crosstab(df_exploded["hypotheses"], df_exploded["groupe"])
print("\nTableau croisé hypothèses x groupes :\n", cross)

# 7. Visualisation heatmap des cooccurrences
plt.figure(figsize=(14,7))
sns.heatmap(cross, annot=True, fmt="d", cmap="YlOrRd")
plt.title("Cooccurrence Hypothèses x Groupes dans les conseils")
plt.xlabel("Groupe")
plt.ylabel("Hypothèse")
plt.tight_layout()
plt.show()

# 8. Pourcentage de réponses par groupe (toutes catégories)
total = len(df)
print("\nPourcentage de conseils où chaque groupe est cité (multi-appartenance possible) :")
for g in [
    "Cadragedubesoietpartiesprenantes", "Communicationetpédagogie", "Organisationetpilotage",
    "Collaborationettransversalité", "Simplicitéetpragmatisme", "Qualitédesdonnéesetdocumentation",
    "Compétencesetaccompagnement", "Choixdesoutilsetinteropérabilité", "Anticipationetpérennité",
    "Leadershipetresponsabilisation", "Vide"
]:
    count = sum(df['groupe'].fillna('').str.replace(" ", "").str.contains(g))
    print(f"{g}: {count/total:.2%}")

# 9. Camembert pour le poids des non-réponses / “vide”
labels = pd.Series(flat_hypotheses).replace({'Vide':'Aucune hypothèse'}).value_counts().index
sizes = pd.Series(flat_hypotheses).replace({'Vide':'Aucune hypothèse'}).value_counts().values
plt.figure(figsize=(6,6))
plt.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90, colors=plt.cm.Pastel2.colors)
plt.title("Part des hypothèses dans les conseils (dont vides)")
plt.tight_layout()
plt.show()