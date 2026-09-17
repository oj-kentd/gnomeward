#!/usr/bin/env python3
"""Compose and synthesize the original Gnomeward score, without external samples.
Requires Python 3, NumPy, SciPy. Run from any working directory.
Every note and effect is mixed on a circular timeline so release/reverb tails loop.
"""
from pathlib import Path
import json
import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'audio'
SR = 24000
RNG = np.random.default_rng(74931)

def freq(midi):
    return 440 * 2 ** ((midi - 69) / 12)

def envelope(t, duration, attack=.006, release=.12):
    # Smooth attack and release; all oscillators start at phase zero.
    return np.minimum(1, t / attack) ** 2 * np.minimum(1, np.maximum(0, (duration - t) / release)) ** 2

def tone(midi, seconds, kind, velocity=1):
    f = freq(midi)
    duration = seconds + {'guitar': .24, 'keys': .7, 'pad': .55, 'piano': .65, 'bass': .06}[kind]
    t = np.arange(round(duration * SR)) / SR
    x = np.zeros_like(t)
    if kind == 'guitar':
        # Bright picked string with damped upper partials and a gentle amp stage.
        for h in range(1, 14):
            x += (.74 ** (h - 1) / h ** .35) * np.sin(2 * np.pi * f * h * t) * np.exp(-t * (2.3 + h * .9))
        x = np.tanh(1.7 * x) / 1.7
        x *= envelope(t, duration, .003, .20)
    elif kind == 'keys':
        x = (np.sin(2*np.pi*f*t + 1.3*np.exp(-t*7)*np.sin(2*np.pi*f*3*t))
             + .20*np.sin(2*np.pi*f*2.002*t)*np.exp(-t*4)
             + .12*np.sin(2*np.pi*f*3*t)*np.exp(-t*9)) * np.exp(-t*1.8)
        x *= envelope(t, duration, .01, .45)
    elif kind == 'pad':
        for h, a in [(1, .6), (2, .14), (3, .045)]:
            x += a*(np.sin(2*np.pi*f*h*t) + np.sin(2*np.pi*f*h*1.0015*t))*.5
        x *= envelope(t, duration, .22, .5)
    elif kind == 'piano':
        for h in range(1, 10):
            x += .68**(h-1) * np.sin(2*np.pi*f*h*(1 + .000045*h*h)*t) * np.exp(-t*(1.5 + h*.7))
        x *= envelope(t, duration, .004, .3)
    elif kind == 'bass':
        x = (np.sin(2*np.pi*f*t) + .18*np.sin(2*np.pi*f*2*t) + .06*np.sin(2*np.pi*f*3*t)) * np.exp(-t*1.5)
        x *= envelope(t, duration, .006, .055)
    return x * velocity

def percussion(kind, velocity=1):
    duration = {'kick': .32, 'snare': .22, 'hat': .085, 'ride': .22, 'brush': .20}[kind]
    t = np.arange(round(duration * SR)) / SR
    if kind == 'kick':
        phase = 2*np.pi*(46*t + (110-46)*.018*(1-np.exp(-t/.018)))
        x = np.sin(phase)*np.exp(-t*15) + .10*RNG.normal(0, 1, len(t))*np.exp(-t*140)
    else:
        noise = RNG.normal(0, 1, len(t))
        cutoff = 1800 if kind in ['snare', 'brush'] else 6000
        noise = signal.sosfilt(signal.butter(2, cutoff, 'highpass', fs=SR, output='sos'), noise)
        if kind == 'snare':
            x = .55*noise*np.exp(-t*23) + .26*np.sin(2*np.pi*185*t)*np.exp(-t*26)
        elif kind == 'brush':
            x = .48*noise*np.exp(-t*22)
        else:
            x = .25*noise*np.exp(-t*(65 if kind == 'hat' else 21))
            x += .035*(np.sin(2*np.pi*6103*t)+np.sin(2*np.pi*8137*t))*np.exp(-t*35)
    return x * envelope(t, duration, .001, .018) * velocity

class Score:
    def __init__(self, bpm):
        self.bpm = bpm
        self.beat = 60 / bpm
        self.length = round(32 * self.beat * SR)
        self.mix = np.zeros(self.length)
    def add(self, audio, beat):
        start = round(beat*self.beat*SR)
        # Explicit wrapping handles releases extending beyond the last bar.
        indices = (start + np.arange(len(audio))) % self.length
        np.add.at(self.mix, indices, audio)
    def note(self, midi, beat, beats, kind, velocity):
        self.add(tone(midi, beats*self.beat, kind, velocity), beat)
    def chord(self, notes, beat, beats, kind, velocity, strum=0):
        for i, note in enumerate(notes):
            self.note(note, beat + i*strum, beats, kind, velocity)
    def drum(self, kind, beat, velocity):
        self.add(percussion(kind, velocity), beat)
    def finish(self, ident, reverb):
        dry = self.mix
        # Circular delays, alternating short/long taps, keep ambience seamless.
        wet = dry.copy()
        for delay, gain in [(.071, .16), (.113, .14), (.173, .105), (.239, .075), (.317, .045)]:
            wet += np.roll(dry, round(delay*SR)) * gain * reverb
        # Periodic frequency-domain DC removal and very gentle high-end rolloff.
        spectrum = np.fft.rfft(wet)
        hz = np.fft.rfftfreq(len(wet), 1/SR)
        spectrum *= (hz**2/(hz**2 + 30**2)) / np.sqrt(1 + (hz/7800)**8)
        wet = np.fft.irfft(spectrum, n=len(wet))
        wet = np.tanh(wet * .75)
        wet *= .73 / max(np.max(np.abs(wet)), 1e-6)
        # Preserve conservative loudness while allowing natural transient peaks.
        rms = np.sqrt(np.mean(wet**2))
        if rms > .155:
            wet *= .155/rms
        pcm = np.round(wet*32767).astype(np.int16)
        path = OUT / f'{ident}.wav'
        wavfile.write(path, SR, pcm)
        seam = abs(float(wet[0]-wet[-1]))
        steps = np.abs(np.diff(wet))
        report = {'peak': round(float(np.max(np.abs(wet))), 6), 'rms': round(float(np.sqrt(np.mean(wet**2))), 6),
                  'seamDelta': round(seam, 6), 'maxAdjacentDelta': round(float(steps.max()), 6),
                  'clippedSamples': int(np.sum(np.abs(pcm.astype(np.int32)) >= 32767)), 'frames': len(pcm),
                  'bytes': path.stat().st_size}
        assert report['clippedSamples'] == 0
        assert seam < .05, f'{ident}: seam discontinuity {seam}'
        assert 17 <= len(pcm)/SR <= 25
        assert report['peak'] <= .731
        return len(pcm)/SR, report

def rock():
    s = Score(104)
    # E minor / C / G / D, an original picked-power-chord garden march.
    roots = [40, 36, 43, 38, 40, 36, 43, 38]
    motif = [[64,67,69,67],[64,67,72,71],[67,71,74,71],[66,69,74,69],
             [64,67,71,69],[67,72,76,72],[71,74,76,74],[69,66,64,62]]
    for bar, root in enumerate(roots):
        b = bar*4
        for at, vel in [(0,.115),(.75,.068),(1.5,.084),(2,.115),(2.75,.069),(3.5,.09)]:
            s.chord([root+12, root+19, root+24], b+at, .43, 'guitar', vel, .018)
        for at in [0, .75, 1.5, 2, 2.75, 3.5]:
            s.note(root, b+at, .40, 'bass', .18 if at in [0,2] else .13)
        for i,note in enumerate(motif[bar]):
            s.note(note, b+.5+i*.875, .48, 'guitar', .085)
        for at in [0,1.5,2,2.75]:s.drum('kick',b+at,.25 if at in [0,2] else .15)
        for at in [1,3]:s.drum('snare',b+at,.28)
        for eighth in range(8):s.drum('hat',b+eighth*.5,.19 if eighth%2==0 else .12)
        if bar in [3,7]:
            for at in [3.5,3.75]:s.drum('snare',b+at,.09)
    return s

def chill():
    s=Score(88)
    chords=[[57,60,64,67,71],[53,57,60,64,67],[48,55,59,62,64],[55,59,62,64,69]]*2
    roots=[33,29,36,31]*2
    melody=[[76,71,72],[72,69,67],[71,74,76],[74,71,69],
            [72,76,79],[76,72,69],[74,71,67],[69,71,67]]
    for bar,(chord,root) in enumerate(zip(chords,roots)):
        b=bar*4
        s.chord(chord,b,3.35,'pad',.035)
        s.chord(chord,b+.08,1.5,'keys',.068,.019)
        s.chord(chord,b+2.65,.8,'keys',.047,.018)
        for at,n in [(0,root),(1.75,root+7),(2.5,root),(3.5,root+12)]:s.note(n,b+at,.58,'bass',.16)
        for at,n in zip([.75,1.5,3.15],melody[bar]):s.note(n,b+at,.55,'keys',.06)
        for at in [0,2.4]:s.drum('kick',b+at,.19)
        for at in [1.06,3.06]:s.drum('brush',b+at,.22)
        for eighth in range(8):s.drum('hat',b+eighth*.5+(0.04 if eighth%2 else 0),.11 if eighth%2==0 else .075)
    return s

def jazz():
    s=Score(108)
    chords=[[53,57,60,64],[53,59,62,69],[52,55,59,62],[55,61,64,70],
            [52,57,60,67],[53,59,62,65],[55,59,62,66],[55,61,64,70]]
    walking=[[38,41,45,44],[43,47,50,49],[36,40,43,46],[45,49,52,51],
             [41,45,48,46],[35,38,41,39],[40,43,47,46],[45,49,43,37]]
    melody=[[(.66,69),(1.66,72),(3,76)],[(.66,74),(2,71),(3.66,69)],
            [(.66,67),(1.66,71),(3,74)],[(.66,73),(2,70),(3.66,64)],
            [(.66,69),(1.66,72),(3,76)],[(.66,74),(2,71),(3.66,65)],
            [(.66,67),(1.66,71),(3,74)],[(.66,73),(2,70),(3.66,69)]]
    for bar,chord in enumerate(chords):
        b=bar*4
        for at,vel in [(0,.066),(1.66,.048),(2.66,.059)]:s.chord(chord,b+at,.55,'piano',vel,.011)
        for i,note in enumerate(walking[bar]):s.note(note,b+i,.78,'bass',.18)
        for at,note in melody[bar]:s.note(note,b+at,.42,'piano',.078)
        for at in [0,1,1.66,2,3,3.66]:s.drum('ride',b+at,.16 if at in [0,2] else .105)
        for at in [1,3]:s.drum('brush',b+at,.14)
        for at in [0,2]:s.drum('kick',b+at,.095)
    return s

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    tracks=[]
    for ident,title,builder,description,room in [
        ('rock','Pompom Patrol',rock,'Picked electric power chords, a bright original melody, bass and a steady rock drum groove.',.45),
        ('chill','Mosslight Afternoon',chill,'Warm electric keys and soft pads over mellow bass and a laid-back garden beat.',1.0),
        ('jazz','The Mushroom Club',jazz,'Swung piano chords and a playful original piano melody, walking bass and brushed drums.',.7)]:
        score=builder();duration,checks=score.finish(ident,room)
        tracks.append({'id':ident,'file':ident+'.wav','title':title,'bpm':score.bpm,'bars':8,'duration':round(duration,6),'description':description,'checks':checks})
        print(ident,json.dumps(tracks[-1]))
    manifest={'sampleRate':SR,'channels':1,'format':'PCM16 WAV','original':True,'tracks':tracks}
    (OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')

if __name__=='__main__':main()
