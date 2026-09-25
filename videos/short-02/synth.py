#!/usr/bin/env python3
"""
Sintetizador de la partitura: lee score.gen.json (el mismo que mueve la animación)
y toca cada evento en su tiempo exacto. Mismo enfoque que ghosty-reel/harness-reel/music.py
(numpy, 48 kHz, sin modelos ni catálogo), pero conducido por eventos y no por un loop.

Un instrumento por rol:
  @plan  → campana (FM)          @build → marimba (senoidal + parcial 4x)
  @check → pluck (Karplus-Strong) Ghosty → pad (sierras desafinadas con pasabajas)
  bombo senoidal con barrido de tono, hats y barridos de ruido para las cortinillas,
  sello (golpe grave + ruido) y confeti (arpegio rápido).

Uso:  python3 synth.py [salida.wav]
"""

import json
import os
import sys
import wave

import numpy as np

SR = 48_000
HERE = os.path.dirname(os.path.abspath(__file__))
SCORE = json.load(open(os.path.join(HERE, "score.gen.json")))
DUR = SCORE["duration"]
N = int(SR * DUR)
out = np.zeros((N, 2))
rng = np.random.default_rng(7)  # determinista


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(sig, t, pan=0.0, gain=1.0):
    """Suma una señal mono a partir del segundo t, con paneo (-1 izq, 1 der)."""
    a = int(round(t * SR))
    if a >= N:
        return
    sig = sig[: N - a] * gain
    l, r = np.sqrt((1 - pan) / 2), np.sqrt((1 + pan) / 2)
    out[a: a + len(sig), 0] += sig * l
    out[a: a + len(sig), 1] += sig * r


def tt(dur):
    return np.arange(int(dur * SR)) / SR


def adsr(n_s, a=0.004, decay=0.25):
    x = tt(n_s)
    e = np.exp(-x / decay)
    at = int(a * SR)
    if at:
        e[:at] *= np.linspace(0, 1, at)
    return e


# ---------------- instrumentos ----------------
def bell(m, dur, vel):
    x = tt(dur + 0.8)
    f = hz(m)
    mod = np.sin(2 * np.pi * f * 3.5 * x) * 2.2 * np.exp(-x / 0.25)
    return np.sin(2 * np.pi * f * x + mod) * adsr(dur + 0.8, 0.002, 0.45) * vel * 0.30


def marimba(m, dur, vel):
    x = tt(dur + 0.4)
    f = hz(m)
    s = np.sin(2 * np.pi * f * x) + 0.35 * np.sin(2 * np.pi * f * 4 * x) * np.exp(-x / 0.03)
    return s * adsr(dur + 0.4, 0.002, 0.22) * vel * 0.34


def pluck(m, dur, vel):
    f = hz(m)
    n = int((dur + 0.5) * SR)
    p = int(SR / f)
    buf = rng.uniform(-1, 1, p)
    y = np.zeros(n)
    for i in range(n):  # Karplus-Strong
        y[i] = buf[i % p]
        buf[i % p] = 0.5 * (buf[i % p] + buf[(i + 1) % p]) * 0.996
    return y * vel * 0.32


def kick(vel):
    x = tt(0.45)
    f = 45 + 105 * np.exp(-x / 0.035)  # barrido 150 → 45 Hz
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-x / 0.16) * vel * 0.85


def hat(vel):
    x = tt(0.05)
    nz = rng.uniform(-1, 1, len(x))
    nz = nz - np.convolve(nz, np.ones(4) / 4, "same")  # pasaaltas barato
    return nz * np.exp(-x / 0.012) * vel * 0.22


def click(m, vel):
    x = tt(0.04)
    return (np.sin(2 * np.pi * hz(m) * x) * 0.6 + rng.uniform(-1, 1, len(x)) * 0.4) * np.exp(-x / 0.008) * vel * 0.35


def sweep(dur, vel):
    """Ruido con pasabanda que sube mientras la cortinilla cierra; termina justo en el corte."""
    x = tt(dur)
    nz = rng.uniform(-1, 1, len(x))
    f = 600 * (8 ** (x / dur))  # 600 → 4800 Hz
    # resonador de un polo que sigue a f
    y = np.zeros(len(x))
    lp = 0.0
    bp = 0.0
    for i in range(len(x)):
        g = 2 * np.sin(np.pi * f[i] / SR)
        hp = nz[i] - lp - 0.35 * bp
        bp += g * hp
        lp += g * bp
        y[i] = bp
    e = np.linspace(0.05, 1, len(x)) ** 2
    return y / (np.abs(y).max() + 1e-9) * e * vel * 0.28


def boing(m, dur, vel):
    """salto: senoidal que sube de tono (el personaje despega) con un poco de vibrato"""
    x = tt(dur)
    f = hz(m) * (0.6 + 0.8 * (x / dur) ** 0.6) * (1 + 0.02 * np.sin(2 * np.pi * 18 * x))
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-x / (dur * 0.7)) * vel * 0.3


def pop(vel):
    """pop seco: tono corto que sube (420→760 Hz) en 70 ms, con un chasquido; sin cola de campana"""
    x = tt(0.09)
    f = 420 + 340 * (1 - np.exp(-x / 0.012))
    ph = 2 * np.pi * np.cumsum(f) / SR
    tick = rng.uniform(-1, 1, len(x)) * np.exp(-x / 0.003) * 0.3
    return (np.sin(ph) * np.exp(-x / 0.022) + tick) * vel * 0.7


def knock(vel):
    """golpe de sello de madera: cuerpo grave + «toc» en medios (180 Hz) + chasquido filtrado en 1–3 kHz,
    para que se oiga en bocinas de celular y encima de la voz"""
    x = tt(0.35)
    body = np.sin(2 * np.pi * (60 + 50 * np.exp(-x / 0.02)) * x) * np.exp(-x / 0.09)
    toc = np.sin(2 * np.pi * 180 * x) * np.exp(-x / 0.05) + 0.5 * np.sin(2 * np.pi * 410 * x) * np.exp(-x / 0.03)
    nz = rng.uniform(-1, 1, len(x))
    hp = nz - np.convolve(nz, np.ones(9) / 9, "same")          # quita graves
    bp = np.convolve(hp, np.ones(3) / 3, "same")                # quita lo muy agudo → 1–3 kHz aprox.
    slap = bp * np.exp(-x / 0.018)
    return (body * 0.7 + toc * 0.8 + slap * 0.9) * vel * 0.8


def stamp(vel):
    x = tt(0.5)
    body = np.sin(2 * np.pi * (70 + 60 * np.exp(-x / 0.02)) * x) * np.exp(-x / 0.12)
    slap = rng.uniform(-1, 1, len(x)) * np.exp(-x / 0.02)
    return (body * 0.9 + slap * 0.5) * vel * 0.8


def confetti(vel):
    # arpegio en fusas (1/32 = 0.0625 s) sobre Do mayor, subiendo y bajando
    notes = [72, 76, 79, 84, 88, 91, 96, 91, 88, 84, 88, 91, 96, 100]
    y = np.zeros(int(1.6 * SR))
    for i, m in enumerate(notes):
        s = bell(m, 0.25, 0.6)
        a = int(i * 0.0625 * SR)
        y[a: a + len(s)] += s[: len(y) - a]
    return y * vel


def pad(notes, t, dur, gain=1.0, release=0.03):
    x = tt(dur)
    s = np.zeros(len(x))
    for m in notes:
        for det in (-0.08, 0.08):
            f = hz(m + det)
            s += 2 * ((x * f) % 1) - 1  # sierra
    # pasabajas de un polo, con trémolo lento de 8 Hz (octavos)
    y = np.zeros(len(s))
    a = 0.06
    acc = 0.0
    for i in range(len(s)):
        acc += a * (s[i] - acc)
        y[i] = acc
    trem = 0.85 + 0.15 * np.sin(2 * np.pi * 4 * x)
    e = np.ones(len(x))
    at = int(0.02 * SR)
    rl = int(release * SR)  # por defecto corte seco; en la espera de la firma, cola larga
    e[:at] = np.linspace(0, 1, at)
    e[-rl:] = np.linspace(1, 0, rl)
    place(y * trem * e * 0.05 / len(notes) * 3 * gain, t)


# ---------------- tocar ----------------
PAN = {"bell": -0.25, "marimba": 0.25, "pluck": 0.15, "click": 0.0}
PART = sys.argv[2] if len(sys.argv) > 2 else "all"   # bed | sfx | all


def play(e):
    inst, t, m, d, v = e["inst"], e["t"], e["note"], e["dur"], e["vel"]
    if inst == "bell": place(bell(m, d, v), t, PAN["bell"])
    elif inst == "marimba": place(marimba(m, d, v), t, PAN["marimba"])
    elif inst == "pluck": place(pluck(m, d, v), t, PAN["pluck"])
    elif inst == "kick": place(kick(v), t)
    elif inst == "hat": place(hat(v), t, 0.35)
    elif inst == "click": place(click(m, v), t)
    elif inst == "sweep": place(sweep(d, v), t)
    elif inst == "stamp": place(stamp(v), t)
    elif inst == "knock": place(knock(v), t)
    elif inst == "pop": place(pop(v), t)
    elif inst == "boing": place(boing(m, d, v), t)
    elif inst == "confetti": place(confetti(v), t)


if PART in ("bed", "all"):
    for p in SCORE["pads"]:
        pad(p["notes"], p["t"], p["dur"], p.get("gain", 1.0), p.get("release", 0.03))
    for e in SCORE.get("bed", []): play(e)
if PART in ("sfx", "all"):
    for e in SCORE.get("sfx", []): play(e)
for e in SCORE.get("events", []): play(e)

peak = np.abs(out).max()
out *= 0.89 / peak  # cada pista a -1 dBFS; la mezcla las nivela por LUFS
dst = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "music.wav")
with wave.open(dst, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((out * 32767).astype("<i2").tobytes())
print(f"{dst}: {DUR:.1f} s, {PART}, pico normalizado a -1 dBFS")
