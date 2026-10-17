# 게임 음악 생성기 (직접 작곡한 칩튠 악보 → WAV)
#
# 결과
#   bgm.wav   : 반복 재생용 배경음악 (BPM 150, 16마디, 다장조)
#   start.wav : 게임 시작 효과음 "띠링" (1초)
#   clear.wav : 스테이지 클리어 효과음 (1.2초)
#   over.wav  : 게임 오버 효과음 (1.6초)
#   brick.wav : 벽돌 깨는 효과음 (0.25초)
#   stomp.wav : 악마가 패들을 밟는 효과음 (0.2초)
#
# 사용: python compose_music.py <출력 폴더>
import sys
import wave
import numpy as np

RATE = 44100
BPM = 150
EIGHTH = 60.0 / BPM / 2          # 8분음표 길이 (초)
BAR = EIGHTH * 8

NOTE_INDEX = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5,
              "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def freq(name):
    """'A4' 같은 음 이름 → 주파수"""
    pitch, octave = name[:-1], int(name[-1])
    midi = 12 * (octave + 1) + NOTE_INDEX[pitch]
    return 440.0 * 2 ** ((midi - 69) / 12)


# ---------- 파형 ----------
def square(f, t, duty=0.25):
    return np.where((t * f) % 1.0 < duty, 1.0, -1.0)


def triangle(f, t):
    return 4.0 * np.abs((t * f) % 1.0 - 0.5) - 1.0


def envelope(n, attack=0.004, decay=0.08, sustain=0.6, release=0.02):
    t = np.arange(n) / RATE
    dur = n / RATE
    env = np.where(t < attack, t / attack,
                   sustain + (1 - sustain) * np.exp(-(t - attack) / decay))
    rel = np.clip((dur - t) / release, 0, 1)
    return env * rel


def add(buf, start_sec, wavearr):
    i = int(start_sec * RATE)
    j = min(len(buf), i + len(wavearr))
    buf[i:j] += wavearr[:j - i]


def tone(f, length_sec, kind="square", duty=0.25, gate=0.8, vol=1.0, **env):
    n = int(length_sec * gate * RATE)
    t = np.arange(n) / RATE
    w = square(f, t, duty) if kind == "square" else triangle(f, t)
    return w * envelope(n, **env) * vol


# ---------- 악보 ----------
# (음, 8분음표 개수), "r" 은 쉼표. 한 마디 = 8
MELODY = [
    # A 파트
    [("G5", 1), ("r", 1), ("E5", 1), ("G5", 1), ("C6", 2), ("G5", 2)],              # C
    [("A5", 1), ("r", 1), ("E5", 1), ("A5", 1), ("C6", 2), ("B5", 1), ("A5", 1)],   # Am
    [("F5", 1), ("r", 1), ("A5", 1), ("C6", 1), ("F6", 2), ("E6", 1), ("D6", 1)],   # F
    [("D6", 1), ("r", 1), ("B5", 1), ("G5", 1), ("B5", 2), ("D6", 2)],              # G
    [("E6", 1), ("r", 1), ("D6", 1), ("C6", 1), ("G5", 2), ("C6", 2)],              # C
    [("E6", 1), ("r", 1), ("D6", 1), ("C6", 1), ("A5", 2), ("C6", 1), ("D6", 1)],   # Am
    [("C6", 1), ("r", 1), ("A5", 1), ("F5", 1), ("A5", 1), ("C6", 1), ("D6", 1), ("E6", 1)],  # F
    [("D6", 3), ("r", 1), ("G5", 1), ("A5", 1), ("B5", 1), ("D6", 1)],              # G
    # B 파트
    [("C6", 1), ("A5", 1), ("C6", 1), ("F6", 2), ("E6", 1), ("C6", 2)],             # F
    [("B5", 1), ("G5", 1), ("B5", 1), ("D6", 2), ("C6", 1), ("B5", 2)],             # G
    [("G5", 1), ("E5", 1), ("G5", 1), ("B5", 2), ("A5", 1), ("G5", 2)],             # Em
    [("A5", 1), ("E5", 1), ("A5", 1), ("C6", 2), ("B5", 1), ("A5", 2)],             # Am
    [("F5", 1), ("A5", 1), ("C6", 1), ("F6", 1), ("E6", 1), ("F6", 1), ("G6", 2)],  # F
    [("G6", 2), ("F6", 1), ("E6", 1), ("D6", 2), ("B5", 2)],                        # G
    [("C6", 2), ("E6", 2), ("G6", 2), ("E6", 1), ("C6", 1)],                        # C
    [("C6", 3), ("r", 1), ("G5", 2), ("r", 2)],                                     # C
]

# 마디별 화음 (근음, 화음 구성음)
CHORDS = {
    "C":  ("C3", ["C5", "E5", "G5"]),
    "Am": ("A2", ["A4", "C5", "E5"]),
    "F":  ("F2", ["F4", "A4", "C5"]),
    "G":  ("G2", ["G4", "B4", "D5"]),
    "Em": ("E2", ["E4", "G4", "B4"]),
}
PROGRESSION = ["C", "Am", "F", "G", "C", "Am", "F", "G",
               "F", "G", "Em", "Am", "F", "G", "C", "C"]


def octave_up(name):
    return name[:-1] + str(int(name[-1]) + 1)


def compose_bgm():
    bars = len(PROGRESSION)
    total = bars * BAR
    lead = np.zeros(int(total * RATE) + RATE)
    bass = np.zeros_like(lead)
    arp = np.zeros_like(lead)
    drum = np.zeros_like(lead)
    rng = np.random.default_rng(7)

    for b in range(bars):
        bar_start = b * BAR

        # 멜로디: 25% 사각파, 짧게 끊어서 톡톡 튀게
        pos = 0
        for note, steps in MELODY[b]:
            if note != "r":
                add(lead, bar_start + pos * EIGHTH,
                    tone(freq(note), steps * EIGHTH, "square", duty=0.25,
                         gate=0.7 if steps == 1 else 0.85, vol=0.32))
            pos += steps

        root, chord = CHORDS[PROGRESSION[b]]
        for s in range(8):
            t0 = bar_start + s * EIGHTH
            # 베이스: 근음과 옥타브 위를 번갈아 (통통 튀는 느낌)
            bnote = root if s % 2 == 0 else octave_up(root)
            add(bass, t0, tone(freq(bnote), EIGHTH, "triangle", gate=0.75, vol=0.5,
                              decay=0.05, sustain=0.5))
            # 반주: 화음 구성음을 16분음표로 빠르게 돌리는 아르페지오
            for k in range(2):
                n = chord[(s * 2 + k) % 3]
                add(arp, t0 + k * EIGHTH / 2,
                    tone(freq(n), EIGHTH / 2, "square", duty=0.125, gate=0.6, vol=0.09,
                         decay=0.03, sustain=0.2))

            # 드럼
            if s in (0, 4):          # 킥: 음높이가 빠르게 떨어지는 사인파
                n = int(0.12 * RATE)
                t = np.arange(n) / RATE
                f = 120 * np.exp(-t * 25) + 45
                add(drum, t0, np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t * 22) * 0.6)
            if s in (2, 6):          # 스네어: 잡음 + 짧은 음
                n = int(0.1 * RATE)
                t = np.arange(n) / RATE
                add(drum, t0, (rng.uniform(-1, 1, n) * 0.35 + np.sin(2 * np.pi * 190 * t) * 0.2)
                    * np.exp(-t * 30))
            if s % 2 == 1:           # 하이햇: 아주 짧은 잡음
                n = int(0.03 * RATE)
                t = np.arange(n) / RATE
                noise = rng.uniform(-1, 1, n)
                noise = np.diff(noise, prepend=0)      # 고음만 남기기
                add(drum, t0, noise * np.exp(-t * 120) * 0.12)

    mix = lead + bass + arp + drum
    mix = mix[:int(total * RATE)]      # 정확히 16마디로 잘라 끊김 없이 반복되게
    return mix


def compose_start():
    """게임 시작 효과음: 빠르게 올라가는 아르페지오 + 맑게 울리는 마지막 음 (1초)"""
    length = 1.0
    buf = np.zeros(int(length * RATE))
    notes = ["C6", "E6", "G6"]
    step = 0.055
    for i, n in enumerate(notes):
        add(buf, i * step, tone(freq(n), step * 1.4, "square", duty=0.5, gate=1.0, vol=0.35,
                                decay=0.04, sustain=0.4, release=0.01))
    # 마지막 "링": 사각파 + 한 옥타브 위 삼각파, 길게 감쇠
    t0 = len(notes) * step
    n = int((length - t0) * RATE)
    t = np.arange(n) / RATE
    ring = (square(freq("C7"), t, 0.5) * 0.25 + triangle(freq("C8"), t) * 0.2
            + square(freq("G6"), t + 0.003, 0.25) * 0.1)
    vib = 1 + 0.004 * np.sin(2 * np.pi * 6 * t)
    ring = ring * vib * np.exp(-t * 4.5) * np.clip((length - t0 - t) / 0.05, 0, 1)
    add(buf, t0, ring)
    return buf


def compose_clear():
    """스테이지 클리어: 짧게 튀어 오르는 팡파르 (1.2초)"""
    length = 1.2
    buf = np.zeros(int(length * RATE))
    # (음, 시작 시각, 길이)
    notes = [("G5", 0.00, 0.08), ("C6", 0.09, 0.08), ("E6", 0.18, 0.08),
             ("G6", 0.27, 0.12), ("E6", 0.42, 0.08)]
    for n, t0, d in notes:
        add(buf, t0, tone(freq(n), d, "square", duty=0.25, gate=0.9, vol=0.32,
                          decay=0.05, sustain=0.5, release=0.01))
    # 마지막 긴 음: 위 G6 + 아래 E6 화음, 살짝 떨림
    t0 = 0.52
    n = int((length - t0) * RATE)
    t = np.arange(n) / RATE
    vib = 1 + 0.006 * np.sin(2 * np.pi * 7 * t)
    chord = (square(freq("G6") * vib, t, 0.25) * 0.28 + triangle(freq("E6") * vib, t) * 0.3
             + triangle(freq("C5"), t) * 0.25)
    chord *= np.exp(-t * 3.0) * np.clip((length - t0 - t) / 0.05, 0, 1) * np.clip(t / 0.005, 0, 1)
    add(buf, t0, chord)
    return buf


def compose_over():
    """게임 오버: 반음씩 내려가다 길게 처지는 소리 (1.6초)"""
    length = 1.6
    buf = np.zeros(int(length * RATE))
    for i, n in enumerate(["B4", "A#4", "A4"]):
        add(buf, i * 0.22, tone(freq(n), 0.22, "square", duty=0.5, gate=0.85, vol=0.3,
                                decay=0.12, sustain=0.5, release=0.02))
    # 마지막 음: 천천히 음이 떨어지며 떨리다 사라짐
    t0 = 0.66
    n = int((length - t0) * RATE)
    t = np.arange(n) / RATE
    f = freq("G#4") * (1 - 0.07 * np.clip(t / 0.9, 0, 1)) * (1 + 0.012 * np.sin(2 * np.pi * 5.5 * t))
    phase = np.cumsum(f) / RATE
    tail = np.where(phase % 1.0 < 0.5, 1.0, -1.0) * 0.3          # 사각파
    tail += (4.0 * np.abs((phase / 2) % 1.0 - 0.5) - 1.0) * 0.3  # 한 옥타브 아래 삼각파
    tail *= np.exp(-t * 1.6) * np.clip((length - t0 - t) / 0.08, 0, 1) * np.clip(t / 0.005, 0, 1)
    add(buf, t0, tail)
    return buf


def compose_brick():
    """벽돌 깨는 소리: 작고 묵직한 '띵' (0.25초)
    낮게 '퉁' 하는 몸통 + 종처럼 맑은 '띵' + 아주 짧은 '딱' 소리를 겹침"""
    length = 0.25
    n = int(length * RATE)
    t = np.arange(n) / RATE
    rng = np.random.default_rng(3)

    # 몸통: 음높이가 220Hz → 90Hz 로 빠르게 떨어지는 사인파 (묵직함)
    f_body = 130 * np.exp(-t * 45) + 90
    body = np.sin(2 * np.pi * np.cumsum(f_body) / RATE) * np.exp(-t * 28) * 0.75

    # 띵: 도(C5) 사인파 + 종소리 같은 배음(2.76배) + 한 옥타브 위 삼각파, 빠르게 사라짐
    f0 = freq("C5")
    ting = (np.sin(2 * np.pi * f0 * t) * 0.45 * np.exp(-t * 20)
            + np.sin(2 * np.pi * f0 * 2.76 * t) * 0.18 * np.exp(-t * 34)
            + triangle(f0 * 2, t) * 0.10 * np.exp(-t * 40))

    # 딱: 처음 몇 ms 의 잡음 (깨지는 순간의 타격감)
    click = rng.uniform(-1, 1, n) * np.exp(-t * 450) * 0.35

    attack = np.clip(t / 0.002, 0, 1)
    tail = np.clip((length - t) / 0.03, 0, 1)
    return (body + ting + click) * attack * tail


def compose_stomp():
    """악마가 패들을 밟는 소리: 낮고 짧은 '쿵' (0.2초)"""
    length = 0.2
    n = int(length * RATE)
    t = np.arange(n) / RATE
    rng = np.random.default_rng(5)
    f = 70 * np.exp(-t * 30) + 45                       # 115Hz → 45Hz 로 떨어지는 낮은 음
    thud = np.sin(2 * np.pi * np.cumsum(f) / RATE) * np.exp(-t * 22) * 0.8
    scuff = rng.uniform(-1, 1, n) * np.exp(-t * 90) * 0.18   # 발바닥이 닿는 짧은 잡음
    env = np.clip(t / 0.002, 0, 1) * np.clip((length - t) / 0.03, 0, 1)
    return (thud + scuff) * env


def smooth(x):
    """사각파의 거친 고음을 살짝 깎는 간단한 저역 통과"""
    k = np.array([0.25, 0.5, 0.25])
    return np.convolve(x, k, mode="same")


def save(path, x, peak=0.85):
    x = smooth(x)
    x = x / np.max(np.abs(x)) * peak
    data = (x * 32767).astype(np.int16)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(data.tobytes())


if __name__ == "__main__":
    out = sys.argv[1] if len(sys.argv) > 1 else "."
    bgm = compose_bgm()
    save(f"{out}/bgm.wav", bgm, peak=0.6)       # 배경음악은 작게
    save(f"{out}/start.wav", compose_start(), peak=0.9)
    save(f"{out}/clear.wav", compose_clear(), peak=0.9)
    save(f"{out}/over.wav", compose_over(), peak=0.9)
    save(f"{out}/brick.wav", compose_brick(), peak=0.7)   # 자주 나오므로 조금 작게
    save(f"{out}/stomp.wav", compose_stomp(), peak=0.6)   # 2초마다 나오므로 작게
    print(f"bgm {len(bgm) / RATE:.1f}s, start 1.0s, clear 1.2s, over 1.6s, brick 0.25s, stomp 0.2s")
