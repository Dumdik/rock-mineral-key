# Stage 2 — Full Photo Auto-ID: What It Actually Takes

Scope of this doc: the honest end-to-end cost of "take a photo → app names the
mineral/rock." Not the camera button (trivial) — the *identification*.

## 0. The honest ceiling (read first)

Per the feasibility report and the peer-reviewed literature, **photo-only ID of
raw hand specimens is unreliable** — even human experts can't distinguish many
species by eye. The 98%+ numbers in papers come from lab conditions (Raman
spectra, thin-sections under polarized light, microscope images, tiny curated
class sets), which do **not** transfer to a phone photo of a dirty rock.

Realistic target for our use case: **~70–85% top-3 accuracy on a scoped set of
20–50 common, visually distinct species**, degrading badly on rare/weathered
specimens. So the model must ship as a ranked *suggestion* that routes into the
diagnostic key — never a single confident answer. If you accept that framing,
Stage 2 is worth doing. If you expect "point and get the right species every
time," it will disappoint and no amount of engineering fixes it.

## 1. The pipeline, end to end

```
label set (20–50 species)  ->  collect license-clean images  ->  clean/split
   ->  transfer-learn MobileNetV2 (train/train.py, already written)
   ->  export quantized .tflite + labels
   ->  run on-device in the app (camera capture -> preprocess -> infer -> top-3)
   ->  show ranked suggestions -> link into the diagnostic key to confirm
```

Two of these are already done: `train/train.py` (training + quantized export,
with a `--selfcheck`) and the camera-capture UI (Stage 2a, no ML). Everything
else below is the work.

## 2. Data — this is the real project (≈70–80% of total effort)

The bottleneck is **not code, it's labeled, license-clean, raw-specimen images.**

- **Quantity:** transfer learning needs ~**hundreds to low-thousands of images
  per class**. For 40 classes at ~300–500 usable images each, that's
  **12,000–20,000 images** — sourced, verified, cleaned, and correctly labeled.
- **License:** must be CC0 / CC-BY / CC-BY-SA or public domain (same rule as the
  reference photos). Do **not** train on Mindat or scraped Google images — that
  makes a "FOSS" model non-compliant and legally unsafe to redistribute.
- **Sources, best-first:**
  - **MineralImage5k** (Sber AI / MSU, ~44k raw-specimen images, >5000 classes) — most scientifically serious raw-specimen set. Check terms; subset to your classes.
  - **Wikimedia Commons** — license-clean, but per-species counts are thin (often 10–50), not enough alone.
  - **Kaggle sets** ("Mineral photos" ~39k/15 cats, "Gemstones" 87 classes, "Minerals Identification" 7 classes) — **verify each license individually**; many are unlicensed/ARR.
  - **Your own photographed specimens** — cleanest license (you own them, release CC-BY) and best match to real user conditions. Realistically you'll shoot a few hundred yourself to cover gaps.
- **The hard part is the long tail:** common species (quartz, pyrite, calcite)
  have plenty of images; the ones users actually struggle to ID often don't.
- **Quality work:** de-duplicate, remove lab/thin-section/microscope shots that
  won't match phone use, strip watermarked/mislabeled images, balance classes,
  hold out a **raw-specimen test set that looks like real user photos** (this is
  what you benchmark on — not the training distribution).

## 3. Training — mostly done

`train/train.py` already does transfer learning (frozen MobileNetV2 + new head),
augmentation, and quantized `.tflite` export. Remaining:
- **Two-phase fine-tune:** after the head trains, unfreeze the top ~30 base
  layers at a low learning rate for a few more epochs (usually +5–10% accuracy).
- **Class-imbalance handling** (class weights) and better augmentation for
  lighting/rotation robustness.
- **Compute:** free Google Colab T4 GPU is enough at this scale (hours, not days).
  Cost ≈ $0.
- **Iterate:** most gains come from *better data*, not more training. Expect
  several data-cleanup → retrain loops.

## 4. On-device inference in the app

The current app is vanilla JS/HTML. To run the model in-browser, offline:
- **TensorFlow.js** (`tfjs` + `tfjs-tflite` / WebGL backend) loads the `.tflite`
  and runs it client-side. ~1–3 MB model, tens of ms per inference.
- **Wiring:** camera capture (already there) → resize to 224×224, scale to
  [-1,1] → `model.predict` → softmax → map top-3 indices to labels file → render
  ranked cards with confidence + "suggestion — confirm with tests" banner linking
  into the key.
- **Artifact caveat:** the sandboxed artifact's CSP blocks external model/CDN
  fetches; the model + tfjs must be bundled/inlined, or ship this as a real PWA
  (which you'll want anyway for camera + offline). ~1 day of integration once a
  model exists.

## 5. Effort & time (motivated non-developer, AI-assisted)

| Phase | Work | Rough time |
|---|---|---|
| Label-set design | pick 20–50 scoped species | days |
| **Data collection + cleaning** | source, license-check, dedupe, label, hold-out set | **weeks — the bulk** |
| Training + tuning | run train.py, fine-tune, iterate on data | days–weeks (overlaps data) |
| App integration | tfjs, camera→infer→top-3 UI, as a PWA | ~1 week |
| Validation | benchmark on real raw-specimen photos | ongoing |

**Total: ~1–3 months of mostly *data* work**, not coding. Compute cost ~$0
(Colab). The dominant cost is your time curating images.

## 6. Risks & decision gates

- **Accuracy gate:** if top-3 on your own held-out *raw-specimen* photos isn't
  ≥~70–80% on the common set, keep ML narrow or defer it — that low result is
  *expected* per the literature, not a bug. Lean on the key.
- **Data licensing:** one ARR image in the training set compromises the FOSS
  claim. Track provenance per image.
- **Maintenance:** models rot (OS/browser updates, dependency churn). A solo
  maintainer + an ML app is the report's #1 delivery risk. Recruit a co-maintainer.
- **Scope creep:** 50 clean classes shipped beats 500 half-labeled. Start narrow.

## 7. Recommended sequence

1. **Ship Stage 2a now** (photos + camera manual-compare, no ML) — real value, days.
2. **Pilot the model on ~15 easy, visually-distinct species** (quartz, pyrite,
   malachite, obsidian, amethyst, galena, sulfur, azurite…) to prove the whole
   pipeline end-to-end with a small dataset.
3. Only then decide whether the accuracy justifies scaling to 40–50 classes and
   the weeks of data work that requires.

Bottom line: the code is largely solved and mostly written. **Stage 2 is a data
project wearing an ML costume**, with a hard accuracy ceiling you design around,
not through.
