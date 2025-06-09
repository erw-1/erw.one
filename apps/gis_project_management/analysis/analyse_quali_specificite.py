import pandas as pd
import matplotlib.pyplot as plt
from collections import Counter
import seaborn as sns

# 1. Chargement des données
df = pd.read_csv("analyse_quali_enquete_specificite.csv", sep=";", encoding="latin1")

# 2. Comptage des hypothèses, y compris les réponses vides
all_hypotheses = df['hypotheses'].fillna('').str.replace(" ", "").str.split(",")
flat_hypotheses = [item if item else 'Vide' for sublist in all_hypotheses for item in sublist]
hypotheses_count = Counter(flat_hypotheses)
print("Nombre d'occurrences pour chaque hypothèse (y compris vides) :\n", hypotheses_count)

# 3. Visualisation de la répartition des hypothèses
plt.figure(figsize=(7,4))
pd.Series(flat_hypotheses).value_counts().plot(kind="bar", color='cornflowerblue')
plt.title("Répartition des hypothèses dans les réponses (y compris vides)")
plt.xlabel("Hypothèse")
plt.ylabel("Nombre de réponses")
plt.tight_layout()
plt.show()

# 4. Comptage des groupes
# On inclut explicitement les valeurs manquantes dans la liste (utile si "Pas de différence")
all_groups = df['groupe'].fillna('Vide').str.replace(" ", "").str.split(",")
flat_groups = [item if item else 'Vide' for sublist in all_groups for item in sublist]
groups_count = Counter(flat_groups)
print("\nNombre d'occurrences pour chaque groupe (y compris vides) :\n", groups_count)

# 5. Visualisation de la répartition des groupes
plt.figure(figsize=(8,4))
pd.Series(flat_groups).value_counts().plot(kind="bar", color='darkseagreen')
plt.title("Occurrences des groupes dans les réponses (y compris vides)")
plt.xlabel("Groupe thématique")
plt.ylabel("Nombre de réponses")
plt.tight_layout()
plt.show()

# 6. Tableau croisé Hypothèses x Groupes (analyse de cooccurrence)
df_exploded = df.assign(
    hypotheses=df['hypotheses'].fillna('').str.replace(" ", "").str.split(","),
    groupe=df['groupe'].fillna('Vide').str.replace(" ", "").str.split(",")
).explode("hypotheses").explode("groupe")

# On convertit les vides éventuels en chaîne "Vide" pour la clarté des tableaux/plots
df_exploded['hypotheses'] = df_exploded['hypotheses'].replace('', 'Vide')
df_exploded['groupe'] = df_exploded['groupe'].replace('', 'Vide')

cross = pd.crosstab(df_exploded["hypotheses"], df_exploded["groupe"])
print("\nTableau croisé hypothèses x groupes :\n", cross)

# 7. Visualisation heatmap des cooccurrences (seulement si assez de données)
plt.figure(figsize=(10,6))
sns.heatmap(cross, annot=True, fmt="d", cmap="YlGnBu")
plt.title("Cooccurrence Hypothèses x Groupes")
plt.xlabel("Groupe")
plt.ylabel("Hypothèse")
plt.tight_layout()
plt.show()

# 8. Pourcentage de réponses par groupe (toutes catégories)
total = len(df)
print("\nPourcentage de réponses où chaque groupe est cité (calcul multi-appartenance possible) :")
for g in ["Technique", "Organisationnel", "Humain", "Territorial", "Transversalité", "Pasdedifférence", "Vide"]:
    count = sum(df['groupe'].fillna('').str.contains(g))
    print(f"{g}: {count/total:.2%}")

# 9. Camembert pour le poids des non-réponses / “pas de différence”
labels = pd.Series(flat_hypotheses).replace({'Vide':'Aucune hypothèse'}).value_counts().index
sizes = pd.Series(flat_hypotheses).replace({'Vide':'Aucune hypothèse'}).value_counts().values
plt.figure(figsize=(6,6))
plt.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90, colors=plt.cm.Pastel1.colors)
plt.title("Part des hypothèses (dont réponses vides)")
plt.tight_layout()
plt.show()