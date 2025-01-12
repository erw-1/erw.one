
# **Erwan Vinot - Partiel PostGIS**

# Préparation

J'ai (dans l'ordre) :

1. installé **PostgreSQL17** avec **PostGIS** et **pgAdmin 8** sur une session Windows 10 64bit,
2. téléchargé la BD Topo du 95 depuis le site de l'IGN,
3. créé un dossier **C:\partiel_postgis** pour y unzip les données géographiques de la BD Topo,

```cmd
C:\partiel_postgis>tree
C:.
└───bdtopo95
    ├───ADMINISTRATIF
    ├───ADRESSES
    ├───BATI
    ...
```

4. créé une **base de données** sur mon serveur local PostgreSQL, avec le Query Tool visant mon serveur local,
```sql
create database partiel_postgis;
```
5. mis en place l'**extension** PostGIS dans la BDD et j'y ai ajouté un **schéma** pour y placer mes tables. Cela avec le Query Tool visant la BDD partiel_postgis,

```sql
create extension postgis;
create schema bdtopo95;
```

6. ouvert le **shell OSGeo4W** de QGIS 3.34.12 pour me placer dans mon arborescence de travail et **injecter la BD Topo dans mon schéma** bdtopo95 (avec la commande vue dans le cours 3 légèrement modifiée) :

```cmd
cd C:\partiel_postgis\bdtopo95
for /R %f in (*.shp) do ogr2ogr -f PostgreSQL PG:"dbname='partiel_postgis' host='localhost' port='5432' user='postgres' password='postgres'active_schema=bdtopo95" "%f" -lco GEOMETRY_NAME=geom -lco SPATIAL_INDEX=GIST -nlt PROMOTE_TO_MULTI –overwrite

```

Après un refresh dans pgAdmin sur ma BDD partiel_postgis, je vois les tables de la BD Topo dans mon schéma bdtopo95.



&nbsp;

# Concepts

## Question 1 :

**PostGIS** est une extension pour PostgreSQL, un système de gestion de bases de données relationnelles (SGBDR) open source.

Elle ajoute la prise en charge des données géographiques : stockage, indexation, requêtes, analyse... cela avec des fonctions déjà faites que l'on peut utiliser directement en SQL (ex : ST_Centroid qui prend une géométrie comme paramètre et renvoie le centre géométrique).

C'est donc un outil puissant et rapide qui permet de mettre en place une base de données géographique avec Postgre : pour ensuite gérer, administrer et analyser des données spatiales dans des applications SIG ou directement dans pgAdmin.

&nbsp;

## Question 2 :

Avantages du SQL, selon moi :

- **Normé et commun :** SQL est un langage standardisé, largement utilisé pour interagir avec les bases de données. Il marche aussi avec de nombreux SGBDR (PostgreSQL, MySQL, Oracle, etc.)

- **Accessible :** Sa syntaxe est simple, contrairement au JS ou autres usines à gaz.

- **Efficace et flexible :** il permet de manipuler de grandes quantités de données rapidement (insertion, mise à jour, suppression, et requêtes complexes ; ex : jointures, sous-requêtes, et fonctions agrégées....). 

- **Automatisable :** SQL peut être intégré dans des scripts ou des applications pour automatiser les tâches de gestion de données.

- **Utile aux géomaticiens !! :** Avec PostGIS, que j'ai présenté plus haut.

&nbsp;

## Question 3 :

Je travaille en tant que géomaticien dans le service SIG de **Haute-Sâone Numérique** (Syndicat mixte semi-public au service du département 70 et de ses collectivités).
L’utilisation de PostGIS dans mon service répond à notre besoin de stockage de données centralisé : on l'utilise pour administrer notre volume croissant de geodata, pour nos mises à jour régulières, ...

Les avantages de PostgreSQL + PostGIS :

- Ils permettent une centralisation des données et de garantir leur cohérence. En se creusant un peu la tête et en mettant en place des relations, on peut avoir une multitude de couches et de vues à partir d'une seule table contenant des géométries et d'autres tables de données à joindre. On économise ainsi beaucoup de place.

- Travail collaboratif simplifié et synchronisé : Tous mes collègues accèdent aux mêmes données et les mises à jour affectent tous nos projets concernés en même temps. Et ce n'est pas que pour nos cartes statiques, c'est encore plus pertinent pour nos carto web, qui sont connectées directement à notre base de données prod.

- Avoir une base de données géographique bien administrée permet de sécuriser ses données, en utilisant la gestion des droits d'accès et de modification par exemple. J'ai mis en place un accès 'read only' pour une utilisation sur QGIS, ce qui permet d'éviter des missclicks destructeurs.... et on peut faire des backups facilement également.

- On peut aussi faire des analyses et des traitements rapides et efficaces en SQL avec les fonctions de PostGIS, que j'ai présenté plus haut.

&nbsp;

# **SQL**

Toutes les questions sont répondues à l'aide de code SQL exécuté avec le Query Tool de pgAdmin, qui vise la BDD partiel_postgis.

## Question 4 :

Après avoir cherché les **codes INSEE** des trois villes (pour minimiser le risque d'erreur de saisie) :
- Cergy : 95127
- Pontoise : 95500
- Marines : 95370

Je fais la requête suivante pour faire la somme (**sum**) de leur **population** trouvée dans la table **commune**  :

#### Code :

```sql
select sum(population)
from bdtopo95.commune
where insee_com in ('95127', '95500', '95370')
```

#### Résultat (1 row) : **103097 habitants au total.**
| **sum** (numeric)|
|-------------|
| 103097      |

&nbsp;

## Question 5 :

Je cherche à connaitre le **nom** des communes recherchées pour en faire une liste, depuis la table **"commune"**. Je reprends la requête de la question 4 que j'encapsule dans un **where** où je compare la **population** à la somme précédente.

#### Code :

```sql
select nom 
from bdtopo95.commune
where population > 
	(select sum(population)
	from bdtopo95.commune
	where insee_com in ('95127', '95500', '95370'))
```
#### Résultat (3 rows) : **Les trois communes ci-dessous ont plus d'habitants que Cergy, Pointoise et Marines réunies :** 
|   | **nom** (character varying (80))|
|---|-------------|
| 1 | Paris       |
| 2 | Saint-Denis |
| 3 | Argenteuil  |

Note: comme c'est une donnée pertinente, j'aurais pû afficher la population des villes trouvées avec **select nom, population** à la place de **select nom**.

&nbsp;


## Question 6 :
Pour répondre à cette question, j'utilise la page https://postgis.net/docs/reference.html qui liste toutes les commandes PostGIS. 

1. Je pense qu'une commande très commune à mentionner est **ST_MakePoint**, qui crée un point à partir de coordonnées X, Y et Z si on travaille en 3D.

#### Syntaxe SQL :
```sql
SELECT ST_MakePoint(x, y);    -- En 2D
SELECT ST_MakePoint(x, y, z); -- En 3D
```
Source : https://postgis.net/docs/ST_MakePoint.html

&nbsp;


2. Une autre commande qui revient très souvent est **ST_Buffer** qui permet de générer une zone tampon ou *buffer* (zone radiale de rayon "*radius*" ) autour d’un point ou d’une géométrie.

#### Syntaxe SQL :
```sql
SELECT ST_Buffer(geometry, radius);
```
Source : https://postgis.net/docs/ST_Buffer.html -- J'ai fait une version très simplifiée ici, la vraie doc a plus détails sur paramètres optionnels comme *"endcap"* par exemple. 

&nbsp;

3. Exemple en utilisant les deux commandes : **Création un buffer de 50 mètres autour du point positionné en 10,20** :

```sql
SELECT ST_Buffer(ST_MakePoint(10, 20), 50);
```


&nbsp;


## Question 7 :

Je veux faire la somme (**sum**) des longeurs (**ST_Length**) des segments de haie de la commune de Pontoise (**INSEE = 95500**).
Pour cela, je fais une intersection (**ST_Intersects**) entre la commune et les haies de la BD Topo 95 :


#### Code :

```sql
select SUM(ST_Length(a.geom))
from bdtopo95.haie a
join bdtopo95.commune b on ST_Intersects(a.geom, b.geom)
where b.insee_com = '95500';
```

#### Résultat (1 row) : **3005,3 mètres de haies à Pontoise**
| **Sum** (double precision)|
|-------------|
| 3005.3234348963574       |

&nbsp;

# Exercice

1. Création du **schéma bpe**
```sql
create schema bpe
```

&nbsp;


2. Restauration du schéma avec le fichier fourni
```cmd
C:\Users\Work\AppData\Local\Programs\pgAdmin 4\runtime\pg_restore.exe --host "localhost" --port "5432" --username "postgres" --no-password --dbname "partiel_postgis" --verbose --schema "bpe" "C:\\partiel_postgis\\bpe95.sql"
```

&nbsp;

3. Création de la géométrie (**geom**) en Lambert 93 (**EPSG:2154**): 

```sql
alter table bpe.bpe21_95
add column geom geometry(Point, 2154);
update bpe.bpe21_95
set geom = ST_SetSRID(ST_MakePoint(Lambert_X, Lambert_Y), 2154);
```

&nbsp;

Pour faire les étapes suivantes, je consulte la documentation de l'INSEE :

| C1 | ENSEIGNEMENT DU PREMIER DEGRÉ | Ce sont les écoles maternelles, primaires et élémentaires. |
|----|-------------------------------|-----------------------------------------------------------|
	
| A504 | RESTAURANT - RESTAURATION RAPIDE |
|----|-------------------------------|

| B316 | STATION-SERVICE |
|----|-------------------------------|


Source : https://www.insee.fr/fr/metadonnees/source/fichier/BPE23_liste_hierarchisee_TYPEQU.html

&nbsp;

4. Création d'une vue (**view**) pour les restaurants : 

#### Code :
```sql
create view bpe.vue_resto as
select geom
from bpe.bpe21_95
where typequ ilike 'A504';
```

&nbsp;

5. Création d'une vue pour les établissements du 1er degré :

#### Code :
```sql
create view bpe.vue_etab_deg_1 as
select *
from bpe.bpe21_95
where sdom ilike 'C1';
```

&nbsp;

6. Création d'une vue des station-service à 500 mètres de l'A15 dans le 95 :
&nbsp;

Pour répondre à cette question, je dois mobiliser des tables de deux schémas différents (**bpe** et **bdtopo95**) avec un tampon de **500** mètres (**ST_Buffer**, que j'ai présenté en question 6) autour de l'autoroute A15. J'utilise aussi le code "**B316**" pour ne sélectionner que les stations-service (source plus haut).

#### Code :
```sql
create view bpe.vue_stations_a15_500m AS
select distinct *
from bpe.bpe21_95 equip
join (
    select ST_Buffer(route.geom, 500) AS buffer
    from bdtopo95.route_numerotee_ou_nommee route
    where route.numero = 'A15'
) as a15
on ST_Intersects(equip.geom, a15.buffer)
where equip.typequ = 'B316';
```

&nbsp;


## Question bonus :

J'ai utilisé cette requête pour identifier les tables du schéma bdtopo95 contenant des géométries de type **MULTIPOINT**, en croisant les **métadonnées** des colonnes avec celles des géométries via un filtre précis sur le type et le schéma.

#### Code :
```sql
select distinct table_name
from information_schema.columns c
join geometry_columns geom_col
    on c.table_schema = geom_col.f_table_schema and c.table_name = geom_col.f_table_name
where geom_col.type = 'MULTIPOINT' and c.table_schema = 'bdtopo95';
```

#### Résultat (18 rows) : **18 tables ont des multipoints**
| #  | table_name                        |
|----|-----------------------------------|
| 1  | adresse_ban                       |
| 2  | batiment_rnb_lien_bdtopo          |
| 3  | construction_ponctuelle           |
| 4  | detail_hydrographique             |
| 5  | detail_orographique               |
| 6  | erp                               |
| 7  | lieu_dit_non_habite               |
| 8  | noeud_hydrographique              |
| 9  | non_communication                 |
| 10 | point_de_repere                   |
| 11 | point_du_reseau                   |
| 12 | pylone                            |
| 13 | toponymie_bati                    |
| 14 | toponymie_hydrographie            |
| 15 | toponymie_lieux_nommes            |
| 16 | toponymie_services_et_activites   |
| 17 | toponymie_transport               |
| 18 | toponymie_zones_reglementees      |
&nbsp;

Fin.
