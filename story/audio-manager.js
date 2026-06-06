import { VO_FILES, SCORE_BED } from './audio-manifest.js';

export class AudioManager {
  constructor() {
    this._speaking = false;
    this._currentUtterance = null;
    this._ctx = null;
    this._bgGain = null;
    this._bgSource = null;
    this._bgPlaying = false;
    this._voice = null;
    this._voiceLoaded = false;
    this._pendingSpeak = null;
    this._unlocked = false;
    this._currentAudio = null;
  }

  init() {
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
      this._bgGain = this._ctx.createGain();
      this._bgGain.gain.value = 0.04;
      this._bgGain.connect(this._ctx.destination);
      // Attempt immediate resume (works if called within user gesture chain)
      if (this._ctx.state === 'suspended') {
        this._ctx.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('[audio] AudioContext unavailable:', e);
    }

    if (window.speechSynthesis) {
      this._loadVoice();
    }

    this._loadScoreBed();
  }

  _loadVoice() {
    const tryVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      this._voice = voices.find(v =>
        /Google/i.test(v.name) && /English/i.test(v.lang)
      ) || voices.find(v => /English/i.test(v.lang)) || voices[0] || null;
      this._voiceLoaded = true;
      if (this._pendingSpeak) {
        this._doSpeak(this._pendingSpeak);
        this._pendingSpeak = null;
      }
    };
    const voices = window.speechSynthesis.getVoices();
    if (voices.length) {
      tryVoices();
    } else {
      window.speechSynthesis.addEventListener('voiceschanged', tryVoices, { once: true });
      setTimeout(() => {
        if (!this._voiceLoaded) tryVoices();
      }, 2000);
    }
  }

  _stripStageDirections(text) {
    return text.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  }

  speakBeat(beatId, beat, { onStart, onEnd } = {}) {
    const mp3Path = VO_FILES[beatId];

    if (mp3Path) {
      const audio = new Audio(mp3Path);
      this._currentAudio = audio;
      audio.preload = 'auto';

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.then(() => {
          onStart?.();
        }).catch(() => {
          this._fallbackTTS(beat, { onStart, onEnd });
        });
      }

      audio.addEventListener('playing', () => {
        this._speaking = true;
        onStart?.();
      }, { once: true });

      audio.addEventListener('ended', () => {
        this._speaking = false;
        this._currentAudio = null;
        onEnd?.();
      }, { once: true });

      audio.addEventListener('error', () => {
        this._fallbackTTS(beat, { onStart, onEnd });
      }, { once: true });

      return;
    }

    this._fallbackTTS(beat, { onStart, onEnd });
  }

  _fallbackTTS(beat, { onStart, onEnd }) {
    const cleanText = this._stripStageDirections(beat.voText);
    if (!cleanText) {
      onEnd?.();
      return;
    }
    this.speak(cleanText, { onStart, onEnd });
  }

  speak(text, opts = {}) {
    if (!window.speechSynthesis) {
      opts.onEnd?.();
      return;
    }
    this._pendingSpeak = { text, opts };
    if (this._voiceLoaded) {
      this._doSpeak(this._pendingSpeak);
      this._pendingSpeak = null;
    }
  }

  _doSpeak({ text, opts }) {
    const { onStart, onEnd, rate = 0.9, pitch = 1.1 } = opts || {};
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1;
    if (this._voice) utterance.voice = this._voice;

    let started = false;
    const startTimeout = setTimeout(() => {
      if (!started) {
        started = true;
        this._speaking = false;
        onEnd?.();
      }
    }, 3000);

    utterance.onstart = () => {
      clearTimeout(startTimeout);
      started = true;
      this._speaking = true;
      if (this._ctx?.state === 'suspended') {
        this._ctx.resume().catch(() => {});
      }
      onStart?.();
    };
    utterance.onend = () => {
      clearTimeout(startTimeout);
      this._speaking = false;
      onEnd?.();
    };
    utterance.onerror = () => {
      clearTimeout(startTimeout);
      this._speaking = false;
      onEnd?.();
    };

    this._currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
  }

  _loadScoreBed() {
    if (!this._ctx || !SCORE_BED) return;
    fetch(SCORE_BED)
      .then(resp => {
        if (!resp.ok) throw new Error('not found');
        return resp.arrayBuffer();
      })
      .then(buf => this._ctx.decodeAudioData(buf))
      .then(audioBuf => {
        this._bgSource = this._ctx.createBufferSource();
        this._bgSource.buffer = audioBuf;
        this._bgSource.loop = true;
        this._bgSource.connect(this._bgGain);
        this._bgSource.start();
        this._bgPlaying = true;
      })
      .catch(() => {
        // No score bed — silent, fine
      });
  }

  stopSpeech() {
    this._pendingSpeak = null;
    window.speechSynthesis?.cancel();
    if (this._currentAudio) {
      this._currentAudio.pause();
      this._currentAudio = null;
    }
    this._speaking = false;
  }

  isSpeaking() {
    return this._speaking;
  }

  playScoreCue(_cue) {
    if (this._ctx?.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
  }

  setScoreMood(cue) {
    if (!this._bgGain || !this._ctx) return;
    const now = this._ctx.currentTime;
    const rampSec = 0.6;

    let target = 0.02;
    if (cue === 'silence') {
      target = 0;
    } else if (['piano', 'acoustic', 'cinematic', 'full'].includes(cue)) {
      target = 0.06;
    }

    this._bgGain.gain.cancelScheduledValues(now);
    this._bgGain.gain.linearRampToValueAtTime(target, now + rampSec);
  }

  duckScore() {
    if (this._bgGain && this._ctx) {
      this._bgGain.gain.cancelScheduledValues(this._ctx.currentTime);
      this._bgGain.gain.linearRampToValueAtTime(0.01, this._ctx.currentTime + 0.3);
    }
  }

  swellScore() {
    if (this._bgGain && this._ctx) {
      this._bgGain.gain.cancelScheduledValues(this._ctx.currentTime);
      this._bgGain.gain.linearRampToValueAtTime(0.06, this._ctx.currentTime + 1);
    }
  }

  stopScore() {
    if (this._bgSource) {
      try { this._bgSource.stop(); } catch (e) { /* ignore */ }
      this._bgSource = null;
    }
    this._bgPlaying = false;
  }

  unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    if (this._ctx?.state === 'suspended') {
      this._ctx.resume().catch(() => {});
    }
    if (this._bgSource && !this._bgPlaying) {
      try { this._bgSource.start(); this._bgPlaying = true; } catch (e) { /* ignore */ }
    }
  }

  _unlock() {
    if (this._unlocked) return;
    this._unlocked = true;
    const handler = () => {
      this.unlock();
    };
    window.addEventListener('pointerdown', handler, { once: true });
    window.addEventListener('keydown', handler, { once: true });
    window.addEventListener('wheel', handler, { once: true });
  }

  destroy() {
    this.stopSpeech();
    this.stopScore();
    if (this._ctx) {
      this._ctx.close().catch(() => {});
      this._ctx = null;
    }
  }
}
