# Rock &amp; Mineral Diagnostic Key

A free, open-source, **offline-first** tool for identifying rocks, minerals, and
gems by the physical tests you can actually do — hardness, streak, luster,
cleavage, specific gravity, magnetism, acid reaction — plus a rock database keyed
on texture and composition.

No photos required, no login, no subscription, no server. Runs entirely in your
browser from a single file.

## Why

The app-store leaders are proprietary "snap-a-photo" apps gated behind
auto-renewing subscriptions (~$30–40/yr) that repackage largely public-domain
mineralogical knowledge. Photo-only ID of raw specimens is also, per the
peer-reviewed literature, unreliable — even experts can't distinguish many
species by eye. So this project makes the **guided diagnostic key primary** (it's
explainable and scientifically defensible) and treats any photo model as a
labeled *suggestion only*.

See `compass_artifact_*.md` for the full feasibility report.

## Use it

Open `index.html` in any browser (double-click). That's it — works offline.

- **Minerals tab**: filter by hardness range, streak, luster, cleavage, magnetism, acid fizz. 150 species.
- **Rocks tab**: filter by class (igneous/sedimentary/metamorphic), subtype, and grain/texture. 35 common rocks.

## Project layout

| Path | What |
|---|---|
| `index.html` | The whole app — filter UI + results rendering. |
| `minerals.js` | Data: `MINERALS` (150) and `ROCKS` (35) arrays. Facts only. |
| `train/` | Stage 2: on-device photo-ML training script + dataset sourcing (`train/README.md`). |
| `compass_artifact_*.md` | Feasibility &amp; design report. |

## Data & licensing

- **App code**: GPLv3 (see `LICENSE`).
- **Mineral/rock facts** come from open sources (RRUFF, the IMA mineral list,
  standard references like Dana / Klein &amp; Hurlbut). Facts are not copyrightable;
  no proprietary database or photos are bundled.
- **Do not** add Mindat photos (CC BY-NC-SA + all-rights-reserved photos) or
  scraped images — it would make a "FOSS" app non-compliant.
- GPLv3 is incompatible with the Apple App Store; distribute via **F-Droid** and
  direct download. (Dual-license as sole copyright holder if iOS is needed later.)

## Roadmap

- [x] **Stage 1** — diagnostic key (minerals + rocks), offline, zero-dependency.
- [ ] **Stage 2** — on-device photo-ML *suggestion* layer (MobileNetV2 → quantized TFLite). Groundwork in `train/`.
- [ ] Installable PWA (manifest + service worker) for phone home-screen.
- [ ] **Stage 3** — community-contributed, openly-licensed specimen photos; sustainability / co-maintainers.

## Contributing

Add a mineral or rock: append one object to the relevant array in `minerals.js`
(match the field comments at the top). Only add facts from openly-licensed or
public-domain sources, and cite where non-obvious.
