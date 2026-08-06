# Stage 2 — Photo ML (suggestion layer)

The photo model is a **hint, not a determination**. Per the feasibility report,
photo-only ID of raw hand specimens is unreliable — even experts fail by eye.
The diagnostic key (`../index.html`) stays the primary, scientifically-defensible
engine. This model just produces a ranked shortlist that routes users into the key.

## What's here

- `train.py` — transfer-learns MobileNetV2, exports a quantized `.tflite` + labels file.
  - `python train.py --selfcheck` proves the build→quantize→export pipeline with no dataset.
  - `python train.py --data ./dataset --epochs 15` trains on real images.

## How to train (free GPU)

1. Open [Google Colab](https://colab.research.google.com), **Runtime → Change runtime type → T4 GPU**.
2. `pip install "tensorflow>=2.15"`
3. Upload/mount a dataset laid out as `dataset/<species>/<image>.jpg`.
4. `python train.py --data ./dataset --epochs 15 --out mineral_model.tflite`
5. Bundle `mineral_model.tflite` + `mineral_model_labels.txt` in the app.

Scope to ~20–50 common, visually-distinct species. Expect the model to degrade
badly on rare or weathered specimens — that's expected, lean on the key.

## Datasets — LICENSE-CLEAN ONLY

**Hard rule (from the project constraints): only train on images you may legally
reuse.** A "FOSS" app trained on all-rights-reserved images is not FOSS. Check
each dataset's license before use; prefer CC0 / CC-BY. Do **not** scrape Mindat
or Google Images (copyright + Mindat's explicit anti-scraping/ban stance).

| Dataset | Contents | Notes |
|---|---|---|
| Kaggle "Minerals Identification Dataset" | 7 classes, hand specimens | Small, good starter. Verify license on the dataset page. |
| Kaggle "Mineral photos" | ~39k images / 15 categories | Verify license. |
| Kaggle "Gemstones Images" | 87 gemstone classes | Verify license. |
| MineralImage5k (Kaggle / HuggingFace, Sber AI / MSU) | >5000 classes, ~44k raw-specimen images | Most scientifically serious raw-specimen set. Check terms. |
| Your own photographed specimens | anything | Cleanest license path — you own them. Release under CC-BY. |

Kaggle licenses range CC0 → CC-BY → "all rights reserved" / unspecified. An
unlicensed set is legally unsafe to redistribute inside a FOSS app — use it only
if the license explicitly permits, or photograph your own.

## App integration (later)

The `.tflite` runs on-device via TensorFlow Lite / LiteRT — fully offline, no
server. Output is a softmax over the label list; show top-3 with confidence and a
"suggestion — confirm with tests" banner that links into the diagnostic key.
