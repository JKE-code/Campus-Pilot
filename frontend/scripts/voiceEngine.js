/**
 * VoiceEngine — Multimodal Voice Controller for CampusPilot AI Receptionist
 * Handles:
 * - Speech-to-Text (Web Speech Recognition with auto-commit & fallback)
 * - Text-to-Speech (Web SpeechSynthesis with natural voice & audio-level modulation)
 * - Microphone Web Audio API Analyser for real-time visualizer ripples
 * - Synthetic audio cues (chimes) on start/stop/reply
 */
export class VoiceEngine {
  constructor(options = {}) {
    this.options = {
      lang: 'en-US',
      pitch: 1.0,
      rate: 1.05,
      ...options,
    };

    this.isListening = false;
    this.isSpeaking = false;
    this.isMuted = false;
    this.recognition = null;
    this.audioCtx = null;
    this.analyser = null;
    this.micStream = null;
    this.micDataArray = null;
    this.currentTranscript = '';
    this.silenceTimeout = null;

    // Callbacks
    this.onStateChange = options.onStateChange || (() => {});
    this.onTranscript = options.onTranscript || (() => {});
    this.onFinalTranscript = options.onFinalTranscript || (() => {});
    this.onAudioLevel = options.onAudioLevel || (() => {});
    this.onError = options.onError || (() => {});

    this.initSTT();
  }

  playChime(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!this.audioCtx) this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      const now = this.audioCtx.currentTime;
      if (type === 'start') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'stop') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(740, now);
        osc.frequency.exponentialRampToValueAtTime(440, now + 0.15);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      }
    } catch (e) {
      // AudioContext unavailable or blocked
    }
  }

  initSTT() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      console.warn('SpeechRecognition API is not supported in this browser.');
      return;
    }

    try {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = true;
      this.recognition.interimResults = true;
      this.recognition.lang = this.options.lang;

      this.recognition.onstart = () => {
        this.isListening = true;
        this.currentTranscript = '';
        this.onStateChange('listening');
        this.startMicAnalyser();
      };

      this.recognition.onresult = (event) => {
        let interim = '';
        let final = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }

        const candidate = (final || interim || '').trim();
        if (candidate) {
          this.currentTranscript = candidate;
          this.onTranscript(candidate, !!final);
        }

        // Auto-commit if user stops speaking for 1.4 seconds
        if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
        this.silenceTimeout = setTimeout(() => {
          if (this.isListening && this.currentTranscript.trim()) {
            this.commitTranscript();
          }
        }, 1400);

        if (final && final.trim().length > 3) {
          this.commitTranscript();
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'no-speech') {
          return;
        }
        this.isListening = false;
        this.stopMicAnalyser();
        this.onStateChange('idle');
        this.onError(event.error);
      };

      this.recognition.onend = () => {
        if (this.currentTranscript.trim()) {
          this.commitTranscript();
        } else {
          this.isListening = false;
          this.stopMicAnalyser();
          if (!this.isSpeaking) {
            this.onStateChange('idle');
          }
        }
      };
    } catch (e) {
      console.warn('Failed to construct SpeechRecognition:', e);
    }
  }

  commitTranscript() {
    if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
    const text = this.currentTranscript.trim();
    this.currentTranscript = '';
    this.stopListening();
    if (text) {
      this.onFinalTranscript(text);
    }
  }

  async startMicAnalyser() {
    try {
      if (!this.audioCtx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        this.audioCtx = new AudioCtx();
      }

      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const source = this.audioCtx.createMediaStreamSource(this.micStream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.8;
      source.connect(this.analyser);

      const bufferLength = this.analyser.frequencyBinCount;
      this.micDataArray = new Uint8Array(bufferLength);

      this.monitorMicLoop();
    } catch (err) {
      console.warn('Microphone stream access notice:', err);
    }
  }

  monitorMicLoop() {
    if (!this.isListening || !this.analyser) return;

    this.analyser.getByteFrequencyData(this.micDataArray);
    let sum = 0;
    for (let i = 0; i < this.micDataArray.length; i++) {
      sum += this.micDataArray[i];
    }
    const avg = sum / this.micDataArray.length;
    const level = Math.min(1.0, (avg / 128) * 1.6);
    this.onAudioLevel(level);

    requestAnimationFrame(() => this.monitorMicLoop());
  }

  stopMicAnalyser() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => track.stop());
      this.micStream = null;
    }
    this.onAudioLevel(0);
  }

  startListening() {
    // Unlock Audio Context on user gesture
    if (!this.audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtx();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }

    // Stop speaking if currently active
    if (this.isSpeaking) {
      this.stopSpeaking();
    }

    this.playChime('start');

    if (!this.recognition) {
      this.initSTT();
    }

    if (!this.recognition) {
      this.onError('Speech Recognition is unavailable in this browser. You can type or tap prompt pills below.');
      return;
    }

    try {
      this.recognition.start();
    } catch (e) {
      console.warn('Recognition start state notice:', e);
    }
  }

  stopListening() {
    this.playChime('stop');
    if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
    this.stopMicAnalyser();
    this.isListening = false;
    this.onStateChange('idle');
  }

  speak(text) {
    if (this.isMuted || !('speechSynthesis' in window)) return;

    try {
      // Chrome/Safari speech unlock
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      // Clean markdown characters, citations, asterisks, brackets for natural TTS
      const cleanText = text
        .replace(/\[§?[0-9.]+[^\]]*\]/g, '')
        .replace(/[*_#`~\[\]()]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/&bull;/g, '')
        .trim();

      if (!cleanText) return;

      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = this.options.lang;
      utterance.rate = this.options.rate;
      utterance.pitch = this.options.pitch;

      // Pick a natural voice if available
      const voices = window.speechSynthesis.getVoices();
      const preferredVoice =
        voices.find(
          (v) =>
            (v.name.includes('Natural') ||
              v.name.includes('Google') ||
              v.name.includes('Samantha') ||
              v.name.includes('Siri') ||
              v.name.includes('Rishi')) &&
            v.lang.startsWith(this.options.lang.split('-')[0])
        ) || voices.find((v) => v.lang.startsWith(this.options.lang.split('-')[0]));

      if (preferredVoice) utterance.voice = preferredVoice;

      let animInterval = null;

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.onStateChange('speaking');

        // Modulate audio levels to simulate voice wave dynamics
        animInterval = setInterval(() => {
          const rand = Math.sin(Date.now() / 90) * 0.45 + Math.random() * 0.4 + 0.25;
          this.onAudioLevel(Math.max(0.1, Math.min(1.0, rand)));
        }, 50);
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        if (animInterval) clearInterval(animInterval);
        this.onAudioLevel(0);
        this.onStateChange('idle');
      };

      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        this.isSpeaking = false;
        if (animInterval) clearInterval(animInterval);
        this.onAudioLevel(0);
        this.onStateChange('idle');
      };

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      console.warn('Speech synthesis playback notice:', e);
    }
  }

  stopSpeaking() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isSpeaking = false;
    this.onAudioLevel(0);
    this.onStateChange('idle');
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted && this.isSpeaking) {
      this.stopSpeaking();
    }
    return this.isMuted;
  }
}
