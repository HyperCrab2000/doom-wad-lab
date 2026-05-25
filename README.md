# Doom WAD Lab

Recovered from `gl-doom-redo`, with the working Doom/Doom II WAD level renderer and Slab6/KVX voxel loader kept together in one Vite app.

## Run

```sh
npm install
npm run dev
```

The app has two modes:

- `Level Viewer`: loads a WAD and lets you select maps for the WebGL level renderer.
- `Voxel Viewer`: previews Doom things from the Voxel Doom `VOXELDEF` catalog using the Slab6/KVX loader, with rotating 3D voxels plus top/bottom/front/back/side projections.

## Assets

- Put `DOOM.WAD` and `DOOM2.WAD` in `public/wads/`.
- Put Voxel Doom `.kvx` files in `public/voxels/`, for example `SARGA.kvx`, `SARGC.kvx`, or `HEADA.kvx`. The voxel UI already knows the expected filenames from `VOXELDEF` and will auto-load the selected model when the matching file exists.
- A small recovered `test.wad` is copied into `public/wads/test.wad` so the app has a bundled WAD option.

The Voxel Doom metadata is preserved under `voxel_doom/`, but the actual `.kvx` model files were not present in the recovered source tree.

The Slab6 viewer lives in `src/components/VoxelModelViewer.tsx`; the older standalone `rendererTest` copy was removed so there is only one working KVX viewer path.

## Deploy

Hosting uses **S3 + CloudFront + WAF** with **GitHub Actions OIDC** (no AWS keys stored in GitHub). See [`infra/README.md`](infra/README.md) for bootstrap and DNS details.

Production URLs (after infra apply):

- https://wadlab.computingandtooting.com
- https://wadlab.tootingandcomputing.com

## Checks

```sh
npm run build
npm test
```
