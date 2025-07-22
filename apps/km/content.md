<!-- 
id:"home"
title:"Home"
tags:"home,intro,info"
 -->
# km – Knowledge Map

Bienvenue sur **km**, un wiki 100 % statique propulsé par Markdown !

- [Game Mechanics](#mechanics) — concepts de jeu
- [About](https://github.com/erw-1/erw.one/tree/main/apps/km) — code source

## How it works
1. Organise tes notes en dossiers / sous-dossiers.
2. Dans chaque fichier `.md`, ajoute la ligne d’entête ci-dessus.
3. Pousse ton repo sur GitHub Pages, c’est tout !

> *Tip :* `home.md` à chaque niveau sert de page d’accueil.

## Quick demo
| Feature | Description |
|---------|-------------|
| Breadcrumb | Navigation hiérarchique avec dropdown |
| Graph | Vue réseau interactive (D3) |
| Prev / Next | Parcours linéaire des fichiers d’un dossier |

```js
// Exemple de code mis en valeur
function hello() {
  console.log("Hello km!");
}
```

<!-- 
parent:"home"
id:"mechanics"
title:"Game Mechanics" 
tags:"mechanics, technical" 
-->
# Game Mechanics

_Sous-rubriques_ :

- 🔫 **[Aim](#mechanics#aim)** : tirs, précision, bloom …  
- 🏃 **[Movement](#mechanics#movement)** : déplacements, vitesse, parkour …

## Pourquoi ces notes ?
Rassembler les règles / formules utilisées dans nos prototypes afin de les réutiliser facilement.

![Cover](https://placehold.co/600x140/2a2a2a/FFFFFF?text=Mechanics+Banner)

<!-- 
parent:"mechanics" 
id:"aim" 
title:"Aiming in the game" 
tags:"mouse, sensitivity, aim" 
-->
# Aiming in the Game

## TL;DR
- **FOV :** 90° par défaut  
- **Bloom :** augmente de `0.05°` par tir, se réduit après `300 ms` sans tirer  
- **Crit multiplier :** `×1.5` sur head-shot

## Maths derrière le recul 🔢
```math
spread(t) = spread₀ + shots * k  
k = 0.05°
````

### Implementation note

```csharp
if (triggerPulled)
    currentSpread = Mathf.Min(maxSpread, currentSpread + k);
```

### See also

* [Movement penalties](#mechanics#movement)
* Retour à la [page Mechanics](#mechanics)


<!-- 
parent:"aim" 
id:"predicting_movement" 
title:"Predicting Movement" 
tags:"strategies, skils, aim" 
-->
# You can predict where people are going


<!-- 
parent:"mechanics" 
id:"movement" 
title:"Movement in the game" 
tags:"mouse, sensitivity, aim" 
-->
# Movement in the Game

## Parameters
| State | Speed (u/s) | Accel (u/s²) |
|-------|-------------|--------------|
| Walk  | 250         | 8            |
| Sprint| 320         | 10           |
| Crouch| 140         | 6            |

## Parkour
> Les sauts muraux et glissades consomment de l’**endurance** ; voir la boucle d’énergie dans _design doc v2_.

## Navigation
- ⇠ [Aim](#mechanics#aim)  
- ⇡ [Back to Mechanics](#mechanics)
