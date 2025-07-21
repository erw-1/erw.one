<!-- id:"aim" title:"Aiming in the game" -->
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
