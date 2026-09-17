# Original Gnomeward loop score

The three instrumental pieces below were composed and synthesized specifically for Gnomeward. Their notes, rhythms, timbres and drum sounds are defined in `scripts/generate_music.py`. No recordings, downloaded samples, existing melodies, or third-party music generators are used. The score and generated recordings are committed alongside the game.

| File | Title | Style | Tempo | Length |
| --- | --- | --- | --- | --- |
| `public/audio/rock.wav` | Pompom Patrol | Picked electric power chords, melody, bass and rock drums | 104 BPM | 18.462 s |
| `public/audio/chill.wav` | Mosslight Afternoon | Warm electric keys, soft pads, mellow bass and laid-back beat | 88 BPM | 21.818 s |
| `public/audio/jazz.wav` | The Mushroom Club | Swung piano chords and melody, walking bass, light brushed drums | 108 BPM | 17.778 s |

Each piece is eight bars of 4/4. Tracks use mono, 24,000 Hz, signed 16-bit PCM WAV for predictable browser decoding. The three recordings total approximately 2.79 MB. `public/audio/manifest.json` records exact frame-derived durations, titles, styles, BPM and validation metrics.

## Regenerate

Requires Python 3, NumPy and SciPy:

```sh
python scripts/generate_music.py
```

The fixed random seed makes percussion deterministic. Instruments use additive and frequency-modulation synthesis, damped partials, and mild saturation. Bass is a rounded harmonic oscillator; drums combine synthesized pitched transients and filtered noise. Chord voicings, walking lines and lead phrases are written directly into the score.

## Looping and mastering

Notes, release envelopes and short ambience delays mix into a circular timeline. Tails that extend beyond the eighth bar wrap into the start of the file. The masters intentionally have no repeating fade-in, fade-out or silent padding. Frequency-domain EQ is also periodic, so its filtering introduces no artificial boundary reset. Use native audio-buffer looping across the entire recording and a separate playback gain for the in-game volume setting.

Peak levels stay at or below 0.73 of full scale, leaving approximately 2.7 dB of headroom. RMS levels are capped at 0.155. The generator asserts duration, peak headroom, absence of clipped samples and a small boundary sample difference. The actual PCM WAV files are independently checked for format, frame count, clipping, DC offset and seam continuity. These are numerical checks; subjective playback review remains part of playtesting.
