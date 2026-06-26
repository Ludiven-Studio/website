# Arbres du Labo

`island_lod0.glb` / `island_lod1.glb` = **Island Tree 02** (Poly Haven, CC0), décimé via
`@gltf-transform/cli` (≈1,07 M tris → 212k / 62k) + textures WebP, puis chargé en LOD `<Detailed>`
dans `src/components/Trees.tsx`.

Pour régénérer/remplacer depuis un brut Poly Haven (CC0, API scriptable, User-Agent requis) :

```bash
# 1) télécharger le .gltf + .bin + textures dans _treeraw/<id>/ (API api.polyhaven.com/files/<id>)
# 2) décimer en 2 LODs (géométrie simplifiée, textures WebP) :
npx @gltf-transform/cli simplify _treeraw/<id>/<id>_1k.gltf public/models/trees/<id>_lod0.glb --ratio 0.20 --error 0.008
npx @gltf-transform/cli simplify _treeraw/<id>/<id>_1k.gltf public/models/trees/<id>_lod1.glb --ratio 0.06 --error 0.02
npx @gltf-transform/cli webp public/models/trees/<id>_lod0.glb public/models/trees/<id>_lod0.glb --quality 80
npx @gltf-transform/cli webp public/models/trees/<id>_lod1.glb public/models/trees/<id>_lod1.glb --quality 78
# 3) supprimer _treeraw (on ne committe que les LODs allégés)
```

Stratégie perf : peu d'arbres 3D (~40) au moyen plan ; la **HDRI** fournit la forêt lointaine et le
**fogExp2** masque le raccord. Pas de Draco (évite un décodeur runtime) — géométrie non compressée.
