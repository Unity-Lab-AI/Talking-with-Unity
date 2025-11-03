// vosklet-adapter.js
// Exposes: window.createVoskletRecognizer(onresult, onerror) -> Promise<recognitionLike>
(function () {
  const MODEL_URL = 'https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz'; // English small
  const MODEL_LANG = 'English';
  const MODEL_ID = 'vosk-model-small-en-us-0.15';

  function pickModuleGlobal() {
    // Prefer modern Vosklet API, which is what the CDN script provides.
    if (window.Vosklet && typeof window.Vosklet.loadVosklet === 'function') {
      return window.Vosklet.loadVosklet();
    }
    // Fallback for older Vosklet loaded via a different mechanism.
    if (typeof window.loadVosklet === 'function') {
      return window.loadVosklet();
    }
    // Fallback for case where module is already loaded and ready.
    if (window.Vosklet && typeof window.Vosklet.createModel === 'function') {
      return Promise.resolve(window.Vosklet);
    }
    throw new Error('Vosklet is not available on window. Did the CDN script load?');
  }

  window.createVoskletRecognizer = async function (onresult, onerror) {
    const recState = {
      ctx: null,
      micNode: null,
      transferer: null,
      module: null,
      model: null,
      recognizer: null,
      running: false,
      ev: {
        onstart: null,
        onaudiostart: null,
        onspeechstart: null,
        onspeechend: null,
        onend: null
      }
    };

    function fire(type) {
      try { recState.ev[type] && recState.ev[type](); } catch (e) { console.error(`Vosklet adapter ${type} handler failed:`, e); }
    }

    function toWebSpeechResultEvent(text) {
      const transcript = String(text || '').trim();
      return {
        results: [[{ transcript }]]
      };
    }

    // Build Vosklet pieces lazily on start()
    async function ensureEngine() {
      if (recState.module) return;
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      // no audio output — we just pipe to a Worklet/transferer
      recState.ctx = new AudioContextCtor({ sinkId: { type: 'none' } });
      const stream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 }
      });
      recState.micNode = recState.ctx.createMediaStreamSource(stream);

      recState.module = await pickModuleGlobal(); // loadVosklet() or Vosklet
      recState.model = await recState.module.createModel(MODEL_URL, MODEL_LANG, MODEL_ID);
      recState.recognizer = await recState.module.createRecognizer(recState.model, recState.ctx.sampleRate);

      // Map Vosklet events into WebSpeech-like callbacks
      let spoke = false;
      recState.recognizer.addEventListener('partialResult', (ev) => {
        if (!spoke) { fire('onspeechstart'); spoke = true; }
        // partial is ignored for transcript emission; we only toggle UI
      });

      recState.recognizer.addEventListener('result', (ev) => {
        try {
          // ev.detail can be JSON string or object { text, partial, ... }
          let detail = ev.detail;
          if (typeof detail === 'string') {
            try { detail = JSON.parse(detail); } catch {}
          }
          const text = detail?.text ?? detail?.result?.text ?? '';
          onresult && onresult(toWebSpeechResultEvent(text));
          fire('onspeechend');
        } catch (e) {
          console.error('Vosklet adapter result handler failed:', e);
          onerror && onerror({ error: e?.message || 'resultHandler' });
        }
      });

      // Transfer mic samples into recognizer
      recState.transferer = await recState.module.createTransferer(recState.ctx, 128 * 150);
      recState.transferer.port.onmessage = (ev) => recState.recognizer.acceptWaveform(ev.data);
      recState.micNode.connect(recState.transferer);
    }

    async function start() {
      if (recState.running) return;
      try {
        await ensureEngine();
        recState.running = true;
        fire('onstart');
        fire('onaudiostart');
        // Nothing else to do — recognizer consumes microphone continuously
      } catch (e) {
        console.error('Vosklet adapter start() failed:', e);
        onerror && onerror({ error: e?.message || 'start' });
      }
    }

    async function stop() {
      if (!recState.running) return;
      recState.running = false;
      try {
        if (recState.transferer) recState.transferer.port.onmessage = null;
        if (recState.micNode && recState.transferer) recState.micNode.disconnect(recState.transferer);
        // keep model in memory for quick restarts; just suspend audio
        if (recState.ctx && recState.ctx.state !== 'closed') await recState.ctx.suspend().catch(() => {});
      } catch (e) {
        console.warn('Vosklet adapter stop() cleanup warning:', e);
      } finally {
        fire('onend');
      }
    }

    // Return a WebSpeech-like interface object
    return {
      start,
      stop,
      // Allow the app to assign these:
      set onstart(fn) { recState.ev.onstart = fn; },
      get onstart() { return recState.ev.onstart; },
      set onaudiostart(fn) { recState.ev.onaudiostart = fn; },
      get onaudiostart() { return recState.ev.onaudiostart; },
      set onspeechstart(fn) { recState.ev.onspeechstart = fn; },
      get onspeechstart() { return recState.ev.onspeechstart; },
      set onspeechend(fn) { recState.ev.onspeechend = fn; },
      get onspeechend() { return recState.ev.onspeechend; },
      set onend(fn) { recState.ev.onend = fn; },
      get onend() { return recState.ev.onend; }
    };
  };
})();
