"""
Soundtrack for the Ryu feature video, synthesized from scratch (no samples).

  python audio/make_audio.py     -> public/audio/{music,sfx-*}.wav

Music: a dark D-minor pad (i-VI-III-VII) with a sidechained pulse, a pluck
arpeggio in the middle act, a riser into the n+1 reveal, and a long tail.
SFX: the app's own UI tones, re-synthesized exactly as apps/app/src/lib/sound.ts
plays them, plus a whoosh and an impact for the edit.
Section times (seconds) must match src/timeline.ts.
"""
import os

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio")
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

# Keep in sync with src/timeline.ts
T_END = 82.0
PULSE_IN, RISER_AT, HIT_AT, CALM_AT, OUTRO_AT = 9.0, 42.5, 45.0, 68.0, 77.0
BPM = 90
BEAT = 60 / BPM


def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)


def lp(x, hz, order=2):
    return sosfilt(butter(order, hz, "low", fs=SR, output="sos"), x)


def hp(x, hz, order=2):
    return sosfilt(butter(order, hz, "high", fs=SR, output="sos"), x)


def saw(f, t, phase=0.0):
    return 2 * ((f * t + phase) % 1.0) - 1


def env_adsr(n, a, r):
    e = np.ones(n)
    na, nr = int(a * SR), int(r * SR)
    e[:na] = np.linspace(0, 1, na)
    if nr:
        e[-nr:] *= np.linspace(1, 0, nr)
    return e


def reverb(x, seconds=3.2, mix=0.35):
    n = int(seconds * SR)
    ir = rng.standard_normal((n, 2)) * np.exp(-np.linspace(0, 7, n))[:, None]
    ir = lp(ir.T, 5000).T
    wet = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)
    wet /= np.max(np.abs(wet)) + 1e-9
    return (1 - mix) * x + mix * wet * np.max(np.abs(x))


total = int(T_END * SR) + SR * 4
mix = np.zeros((total, 2))


def add(sig, at):
    s = int(at * SR)
    e = min(total, s + len(sig))
    if sig.ndim == 1:
        sig = np.stack([sig, sig], 1)
    mix[s:e] += sig[: e - s]


# ── Pad: i–VI–III–VII in D minor, two bars per chord ─────────────────────────
CHORDS = [[50, 57, 62, 65], [46, 53, 58, 62], [53, 60, 65, 69], [48, 55, 60, 64]]
bar = BEAT * 4
chord_len = bar * 2
t_chord = t_axis(chord_len + 1.5)
k = 0
at = 0.0
while at < T_END + 2:
    notes = CHORDS[k % 4]
    left = np.zeros_like(t_chord)
    right = np.zeros_like(t_chord)
    for n in notes:
        for d in (-0.09, 0.0, 0.08):
            f = midi(n) * 2 ** (d / 12)
            left += saw(f, t_chord, rng.random())
            right += saw(f * 1.002, t_chord, rng.random())
    sweep = 700 + 500 * np.sin(np.linspace(0, np.pi, len(t_chord)))
    # Time-varying lowpass approximated by crossfading two fixed filters.
    lo_l, hi_l = lp(left, 600, 4), lp(left, 1400, 4)
    lo_r, hi_r = lp(right, 600, 4), lp(right, 1400, 4)
    w = (sweep - 700) / 500
    pad = np.stack([lo_l * (1 - w) + hi_l * w, lo_r * (1 - w) + hi_r * w], 1)
    pad *= env_adsr(len(t_chord), 1.2, 1.5)[:, None] * 0.018
    add(pad, at)
    at += chord_len
    k += 1

# ── Sub pulse on eighths with sidechain duck, D pedal following the chord ────
root_of = lambda tt: CHORDS[int(tt // chord_len) % 4][0] - 12
eighth = BEAT / 2
tt = PULSE_IN
while tt < OUTRO_AT + 2 * bar:
    if RISER_AT <= tt < HIT_AT:  # drop out under the riser
        tt += eighth
        continue
    level = 0.55 if tt < CALM_AT else 0.3
    d = eighth * 0.9
    tp = t_axis(d)
    f = midi(root_of(tt))
    s = (np.sin(2 * np.pi * f * tp) + 0.35 * saw(f, tp)) * np.exp(-tp * 9) * level * 0.22
    add(lp(s, 900), tt)
    tt += eighth

# Soft kick on each beat of the middle act (quarter notes).
tt = PULSE_IN + bar
while tt < CALM_AT:
    if not (RISER_AT <= tt < HIT_AT):
        tk = t_axis(0.35)
        f = 110 * np.exp(-tk * 30) + 45
        kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tk * 11) * 0.28
        add(kick, tt)
    tt += BEAT

# ── Pluck arpeggio after the reveal ──────────────────────────────────────────
tt = HIT_AT
step = BEAT / 2
i = 0
while tt < CALM_AT + bar:
    notes = CHORDS[int(tt // chord_len) % 4]
    n = notes[[0, 2, 1, 3, 2, 1][i % 6]] + 12
    tp = t_axis(0.6)
    s = saw(midi(n), tp) * np.exp(-tp * 7)
    s = lp(s, 2600) * 0.05
    pan = 0.5 + 0.35 * np.sin(i * 0.9)
    add(np.stack([s * (1 - pan), s * pan], 1) * 1.6, tt)
    tt += step
    i += 1

# ── Riser into the n+1 reveal, then an impact ────────────────────────────────
rdur = HIT_AT - RISER_AT
tr = t_axis(rdur)
noise = rng.standard_normal(len(tr))
riser = hp(noise, 400) * (tr / rdur) ** 2.2 * 0.16
tone = saw(110 * 2 ** (tr / rdur * 2), tr) * (tr / rdur) ** 2 * 0.05
add(lp(riser + tone, 7000), RISER_AT)

ti = t_axis(3.0)
boom = np.sin(2 * np.pi * np.cumsum(60 * np.exp(-ti * 3) + 32) / SR) * np.exp(-ti * 2.2) * 0.55
air = lp(hp(rng.standard_normal(len(ti)), 800), 6000) * np.exp(-ti * 5) * 0.12
add(boom + air, HIT_AT)

# ── Master: reverb, fades, normalise ─────────────────────────────────────────
mix = reverb(mix, 3.4, 0.3)
n_end = int((T_END + 1.5) * SR)
mix = mix[:n_end]
fade_in = int(1.5 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
fade_out = int(4.0 * SR)
mix[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None] ** 1.5
mix = np.tanh(mix / (np.max(np.abs(mix)) + 1e-9) * 1.3) * 0.82
wavfile.write(os.path.join(OUT, "music.wav"), SR, (mix * 32767).astype(np.int16))


# ── SFX: the app's own tones (apps/app/src/lib/sound.ts) ─────────────────────
def app_tone(freq, at, dur, gain, kind="sine"):
    tt = t_axis(at + dur + 0.1)
    s = np.zeros_like(tt)
    m = tt >= at
    tl = tt[m] - at
    osc = {
        "sine": np.sin(2 * np.pi * freq * tl),
        "triangle": 2 * np.abs(2 * ((freq * tl) % 1) - 1) - 1,
        "square": np.sign(np.sin(2 * np.pi * freq * tl)),
    }[kind]
    e = np.where(tl < 0.012, tl / 0.012, np.exp(np.log(0.0001) * (tl - 0.012) / max(dur - 0.012, 1e-3)))
    s[m] = osc * e * gain
    return s


def mixdown(parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


APP = {
    "open": [(1320, 0, 0.18, 0.035)],
    "notice": [(988, 0, 0.35, 0.05), (1480, 0.07, 0.5, 0.04)],
    "rec": [(440, 0, 0.5, 0.05, "triangle"), (660, 0.09, 0.6, 0.04)],
    "stop": [(660, 0, 0.3, 0.05, "triangle"), (440, 0.08, 0.45, 0.04)],
    "done": [(f, i * 0.07, 0.6, 0.035) for i, f in enumerate([784, 988, 1175, 1568])],
}
for name, tones in APP.items():
    s = mixdown([app_tone(*t) for t in tones])
    s = reverb(np.stack([s, s], 1), 1.2, 0.25)
    s = s / (np.max(np.abs(s)) + 1e-9) * 0.7
    wavfile.write(os.path.join(OUT, f"sfx-{name}.wav"), SR, (s * 32767).astype(np.int16))

# Whoosh (scene transitions) and a soft UI blip (callouts).
tw = t_axis(0.7)
wh = lp(hp(rng.standard_normal(len(tw)), 300), 3000) * np.sin(np.pi * tw / 0.7) ** 2 * 0.5
wavfile.write(os.path.join(OUT, "sfx-whoosh.wav"), SR, (reverb(np.stack([wh, wh * 0.8], 1), 1.0, 0.3) * 32767 * 0.6).astype(np.int16))
tb = t_axis(0.25)
blip = (np.sin(2 * np.pi * 1760 * tb) * 0.6 + np.sin(2 * np.pi * 2637 * tb) * 0.25) * np.exp(-tb * 22) * 0.35
wavfile.write(os.path.join(OUT, "sfx-blip.wav"), SR, (np.stack([blip, blip], 1) * 32767).astype(np.int16))
print("wrote", sorted(os.listdir(OUT)))
