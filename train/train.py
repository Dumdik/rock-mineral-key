#!/usr/bin/env python3
"""Transfer-learn a MobileNetV2 mineral classifier and export a quantized .tflite.

Stage 2 of the Rock Project. This produces the *suggestion* model — NOT a
determination. Per the feasibility report, photo-only ID of raw specimens is
unreliable; the diagnostic key (index.html) stays primary. Scope this model to
~20-50 common, visually-distinct species and always show ranked top-k, never a
single confident answer.

USAGE
  # Real training (needs a dataset laid out as data_dir/<species>/<image>.jpg):
  python train.py --data ./dataset --epochs 15 --out mineral_model.tflite

  # Pipeline self-check (no dataset needed — proves build+quantize+export work):
  python train.py --selfcheck

Run the real training on Google Colab (free GPU): Runtime > Change runtime type
> T4 GPU. Upload/mount your dataset, then run the first command.

Deps:  pip install "tensorflow>=2.15"
Data licensing: see README.md — only train on CC0 / CC-BY images you may reuse.
"""
import argparse
import numpy as np
import tensorflow as tf

IMG_SIZE = 224  # MobileNetV2 native input


def build_model(num_classes):
    """Frozen ImageNet MobileNetV2 base + a fresh classifier head."""
    base = tf.keras.applications.MobileNetV2(
        input_shape=(IMG_SIZE, IMG_SIZE, 3), include_top=False, weights="imagenet")
    base.trainable = False  # transfer learning: only train the head first
    model = tf.keras.Sequential([
        tf.keras.layers.Input((IMG_SIZE, IMG_SIZE, 3)),
        # MobileNetV2 expects inputs scaled to [-1, 1]
        tf.keras.layers.Rescaling(1. / 127.5, offset=-1),
        base,
        tf.keras.layers.GlobalAveragePooling2D(),
        tf.keras.layers.Dropout(0.2),
        tf.keras.layers.Dense(num_classes, activation="softmax"),
    ])
    model.compile(optimizer="adam", loss="sparse_categorical_crossentropy",
                  metrics=["accuracy"])
    return model


def load_data(data_dir, batch=32, val_split=0.2):
    """data_dir/<class_name>/*.jpg  ->  (train_ds, val_ds, class_names)."""
    common = dict(image_size=(IMG_SIZE, IMG_SIZE), batch_size=batch,
                  validation_split=val_split, seed=42, label_mode="int")
    train = tf.keras.utils.image_dataset_from_directory(data_dir, subset="training", **common)
    val = tf.keras.utils.image_dataset_from_directory(data_dir, subset="validation", **common)
    names = train.class_names
    ac = tf.data.AUTOTUNE
    # ponytail: light augmentation only; raw-specimen data is scarce, don't overfit
    aug = tf.keras.Sequential([
        tf.keras.layers.RandomFlip("horizontal"),
        tf.keras.layers.RandomRotation(0.1),
        tf.keras.layers.RandomZoom(0.1),
    ])
    train = train.map(lambda x, y: (aug(x, training=True), y), num_parallel_calls=ac)
    return train.prefetch(ac), val.prefetch(ac), names


def export_tflite(model, out_path, rep_ds):
    """Full-integer-friendly dynamic-range quantization. rep_ds yields sample
    input tensors so the converter can calibrate ranges (smaller, faster model)."""
    conv = tf.lite.TFLiteConverter.from_keras_model(model)
    conv.optimizations = [tf.lite.Optimize.DEFAULT]
    conv.representative_dataset = rep_ds
    tflite = conv.convert()
    with open(out_path, "wb") as f:
        f.write(tflite)
    return len(tflite)


def _rep_from_dataset(ds, n=100):
    def gen():
        count = 0
        for imgs, _ in ds.unbatch().batch(1):
            yield [tf.cast(imgs, tf.float32)]
            count += 1
            if count >= n:
                break
    return gen


def train(data_dir, epochs, out):
    train_ds, val_ds, names = load_data(data_dir)
    print(f"{len(names)} classes: {names}")
    model = build_model(len(names))
    model.fit(train_ds, validation_data=val_ds, epochs=epochs)
    size = export_tflite(model, out, _rep_from_dataset(train_ds))
    # Save labels next to the model so the app can map output index -> species.
    with open(out.rsplit(".", 1)[0] + "_labels.txt", "w") as f:
        f.write("\n".join(names))
    print(f"Wrote {out} ({size/1024:.0f} KB) + labels file.")


def selfcheck():
    """Prove build -> quantize -> export works end to end on random data.
    No dataset required. This is the runnable check for the pipeline logic."""
    n_classes = 5
    model = build_model(n_classes)
    x = np.random.rand(8, IMG_SIZE, IMG_SIZE, 3).astype("float32") * 255
    y = np.random.randint(0, n_classes, size=8)
    model.fit(x, y, epochs=1, verbose=0)  # one step just to exercise the graph

    def rep():
        for i in range(8):
            yield [x[i:i + 1]]
    size = export_tflite(model, "_selfcheck.tflite", rep)

    # The exported model must load and produce a probability vector per class.
    interp = tf.lite.Interpreter(model_path="_selfcheck.tflite")
    interp.allocate_tensors()
    inp, out = interp.get_input_details()[0], interp.get_output_details()[0]
    interp.set_tensor(inp["index"], x[:1].astype(inp["dtype"]))
    interp.invoke()
    probs = interp.get_tensor(out["index"])
    assert probs.shape == (1, n_classes), f"bad output shape {probs.shape}"
    assert abs(float(probs.sum()) - 1.0) < 1e-2, f"softmax should sum to 1, got {probs.sum()}"
    import os
    os.remove("_selfcheck.tflite")
    print(f"OK selfcheck: built, quantized ({size/1024:.0f} KB), inferred {probs.shape}, softmax sums to 1.")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--data", help="dataset dir: <class>/<image>.jpg")
    p.add_argument("--epochs", type=int, default=15)
    p.add_argument("--out", default="mineral_model.tflite")
    p.add_argument("--selfcheck", action="store_true", help="prove pipeline, no dataset")
    a = p.parse_args()
    if a.selfcheck or not a.data:
        selfcheck()
    else:
        train(a.data, a.epochs, a.out)
