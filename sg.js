/* sg.js — Modernized UI + engine (AngularJS) */
(function () {
    'use strict';
  
    const app = angular.module('signalGenerator', []);
  
    /* ---------- Audio Engine ---------- */
    app.factory('SignalGenerator', ['$q', function($q) {
  
      const TONE_TYPES = ['sine','square','sawtooth','triangle'];
      const NOISE_TYPES = ['white','pink','brown'];
  
      class SignalGenerator {
        constructor() {
          const AC = window.AudioContext || window.webkitAudioContext;
          this.ctx = new AC();
  
          this.master = this.ctx.createGain();
          this.master.gain.value = 0;
          this.master.connect(this.ctx.destination);
  
          // Master analyser for meters / scope / spectrum
          this.masterAnalyser = this.ctx.createAnalyser();
          this.masterAnalyser.fftSize = 2048;
          this.masterAnalyser.smoothingTimeConstant = 0.8;
          this.masterAnalyser.minDecibels = -100;
          this.masterAnalyser.maxDecibels = -20;
          this.master.connect(this.masterAnalyser);
  
          this.signals = new Map(); // id -> record
          this.workletReady = $q.defer();
  
          // Load noise worklet
          this.ctx.audioWorklet.addModule('noise-worklet.js')
            .then(()=>this.workletReady.resolve())
            .catch(e=>{
              console.warn('AudioWorklet failed to load:', e);
              console.warn('Noise generators will not work. Serve over HTTPS or localhost.');
              // Show user warning
              setTimeout(() => {
                const warning = document.createElement('div');
                warning.style.cssText = 'position:fixed;top:10px;right:10px;background:#f59e0b;color:#000;padding:8px 12px;border-radius:6px;font-size:12px;z-index:9999;';
                warning.textContent = '⚠️ Noise generators require HTTPS or localhost';
                document.body.appendChild(warning);
                setTimeout(() => warning.remove(), 5000);
              }, 1000);
              this.workletReady.reject(e);
            });
        }
  
        pctToLinear(pct){ return Math.max(0, Math.min(1, (Number(pct)||0)/100)); }

        createFallbackNoiseNode(type, gain, rec) {
          // Fallback using ScriptProcessorNode (deprecated but works everywhere)
          const bufferSize = 4096;
          const processor = this.ctx.createScriptProcessor(bufferSize, 0, 1);
          
          // Simple noise generators
          let pinkState = { b0:0,b1:0,b2:0,b3:0,b4:0,b5:0,b6:0 };
          let brownState = 0;
          
          const white = () => Math.random() * 2 - 1;
          const pink = () => {
            const w = white();
            const p = pinkState;
            p.b0 = 0.99886*p.b0 + 0.0555179*w;
            p.b1 = 0.99332*p.b1 + 0.0750759*w;
            p.b2 = 0.96900*p.b2 + 0.1538520*w;
            p.b3 = 0.86650*p.b3 + 0.3104856*w;
            p.b4 = 0.55000*p.b4 + 0.5329522*w;
            p.b5 = -0.7616*p.b5 - 0.0168980*w;
            const out = p.b0+p.b1+p.b2+p.b3+p.b4+p.b5+p.b6 + 0.5362*w;
            p.b6 = 0.115926*w;
            return out * 0.11;
          };
          const brown = () => {
            brownState += white() * 0.02;
            if (brownState < -1) brownState = -1;
            if (brownState > 1) brownState = 1;
            return brownState * 0.8;
          };
          
          processor.onaudioprocess = (e) => {
            const output = e.outputBuffer.getChannelData(0);
            for (let i = 0; i < output.length; i++) {
              switch (type) {
                case 'pink': output[i] = pink(); break;
                case 'brown': output[i] = brown(); break;
                default: output[i] = white(); break;
              }
            }
          };
          
          processor.connect(gain);
          rec.source = processor;
        }
  
        start(){
          if (this.ctx.state === 'suspended') {
            try { this.ctx.resume(); } catch(e) {}
          }
          this.master.gain.setTargetAtTime(1, this.ctx.currentTime, 0.005);
        }
        stop(){  this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.005); }
  
        /* Add a signal */
        append(cfg){
          const id = cfg.id;
          const gain = this.ctx.createGain();
          gain.gain.value = (cfg.enabled && !cfg.muted && (!cfg._anySolo || cfg.solo))
            ? this.pctToLinear(cfg.gainPct) : 0;
          gain.connect(this.master);
  
          // Per-signal analyser (for mini meter)
          const analyser = this.ctx.createAnalyser();
          analyser.fftSize = 1024;
          analyser.smoothingTimeConstant = 0.85;
          gain.connect(analyser); // tap post-gain (what contributes to mix)
  
          const rec = { id, kind: cfg.type, gain, analyser, source: null, port: null };
  
          if (TONE_TYPES.includes(cfg.type)) {
            const osc = this.ctx.createOscillator();
            osc.type = cfg.type;
            osc.frequency.value = Number(cfg.freq)||440;
            osc.connect(gain);
            osc.start();
            rec.source = osc;
          } else if (NOISE_TYPES.includes(cfg.type)) {
            this.workletReady.promise.then(()=>{
              try {
                const node = new AudioWorkletNode(this.ctx, 'noise-processor', { numberOfInputs:0, numberOfOutputs:1, processorOptions:{ type: cfg.type }});
                node.connect(gain);
                node.port.postMessage({ type: cfg.type });
                rec.source = node;
                rec.port = node.port;
              } catch (e) {
                console.error('Failed to create noise node:', e);
                this.createFallbackNoiseNode(cfg.type, gain, rec);
              }
            }).catch(e => {
              console.warn('Noise worklet not available, using fallback:', e);
              this.createFallbackNoiseNode(cfg.type, gain, rec);
            });
          }
          this.signals.set(id, rec);
        }
  
        /* Update an existing signal */
        update(cfg, anySolo){
          const rec = this.signals.get(cfg.id);
          if (!rec) return;
  
          // Solo/mute/enable → effective gain
          const effective = (cfg.enabled && !cfg.muted && (!anySolo || cfg.solo))
            ? this.pctToLinear(cfg.gainPct) : 0;
          rec.gain.gain.setTargetAtTime(effective, this.ctx.currentTime, 0.01);
  
          const isTone = TONE_TYPES.includes(cfg.type);
          const wasTone = TONE_TYPES.includes(rec.kind);
  
          // Family switch requires rebuild
          if (isTone !== wasTone) { this.remove(cfg.id); this.append(cfg); return; }
  
          // In-family updates
          if (isTone && rec.source) {
            if (rec.source.type !== cfg.type) rec.source.type = cfg.type;
            if (cfg.freq != null) rec.source.frequency.setTargetAtTime(Number(cfg.freq)||0, this.ctx.currentTime, 0.01);
          } else if (!isTone && rec.port) {
            if (rec.kind !== cfg.type) rec.port.postMessage({ type: cfg.type });
          }
  
          rec.kind = cfg.type;
        }
  
        /* Remove a signal */
        remove(id){
          const rec = this.signals.get(id);
          if (!rec) return;
          try { rec.source && rec.source.disconnect(); } catch(e){}
          try { rec.gain && rec.gain.disconnect(); } catch(e){}
          try { rec.analyser && rec.analyser.disconnect(); } catch(e){}
          try { if (rec.source?.stop) rec.source.stop(0); } catch(e){}
          this.signals.delete(id);
        }
      }
  
      return new SignalGenerator();
    }]);
  
    /* ---------- Controller + Modern UI Shell ---------- */
    app.controller('MainCtrl', ['$scope','$document','$compile','$timeout','SignalGenerator',
      function($scope, $document, $compile, $timeout, engine) {
  
      // Model
      $scope.oscillators = [];
      let nextId = 1;
  
      // Presets
      $scope.presets = [
        {name:'Sub Sine 60Hz', items:[{type:'sine',freq:60,gainPct:20}]},
        {name:'Dual Tone 440/660', items:[{type:'sine',freq:440,gainPct:15},{type:'sine',freq:660,gainPct:10}]},
        {name:'Pink Bed', items:[{type:'pink',gainPct:8}]},
        {name:'Brown + Sine', items:[{type:'brown',gainPct:6},{type:'sine',freq:440,gainPct:10}]}
      ];
  
      function addOne(o){
        const cfg = {
          id: nextId++,
          name: (o.type==='sine'?'Sine':o.type==='square'?'Square':o.type==='sawtooth'?'Saw':'Noise'),
          type: o.type || 'sine',
          freq: o.freq == null ? 600 : o.freq,
          gainPct: o.gainPct == null ? 10 : o.gainPct,
          enabled: o.enabled == null ? true : !!o.enabled,
          muted: !!o.muted,
          solo: !!o.solo
        };
        $scope.oscillators.push(cfg);
        engine.append(cfg);
      }
  
      $scope.add = () => addOne({type:'sine',freq:600,gainPct:10});
      $scope.addNoise = (type) => addOne({type, gainPct:10});
  
      $scope.applyPreset = (p) => {
        // Replace current signals
        [...$scope.oscillators].forEach(o => $scope.remove(o));
        p.items.forEach(addOne);
      };
  
      $scope.remove = function(cfg){
        const i = $scope.oscillators.indexOf(cfg);
        if (i>=0) $scope.oscillators.splice(i,1);
        engine.remove(cfg.id);
      };
  
      $scope.start = ()=>engine.start();
      $scope.stop  = ()=>engine.stop();
  
      $scope.toggleMute = (o)=> o.muted = !o.muted;
      $scope.toggleSolo = (o)=> o.solo = !o.solo;
      $scope.toggleEnabled = (o)=> o.enabled = !o.enabled;
  
      // Keyboard: Space = Start/Stop, M/S on focused card
      $document.on('keydown', (e)=>{
        const key = e.key.toLowerCase();
        if (key === ' ') { e.preventDefault(); if (engine.master.gain.value>0) $scope.$apply($scope.stop); else $scope.$apply($scope.start); }
        const el = document.activeElement;
        const host = el?.closest?.('[data-signal-id]');
        if (!host) return;
        const id = Number(host.getAttribute('data-signal-id'));
        const o = $scope.oscillators.find(x=>x.id===id);
        if (!o) return;
        if (key==='m'){ e.preventDefault(); $scope.$apply(()=>o.muted=!o.muted); }
        if (key==='s'){ e.preventDefault(); $scope.$apply(()=>o.solo=!o.solo); }
      });
  
      // Deep watch → push updates and compute "any solo"
      $scope.$watch('oscillators', function(list){
        const anySolo = (list||[]).some(x=>x.solo);
        (list||[]).forEach(o => engine.update(o, anySolo));
      }, true);
  
      /* ----- UI: inject styles + modern shell (no HTML edits needed) ----- */
      const style = document.createElement('style');
      style.textContent = `
  :root{
    --bg:#0e0f13; --panel:#151821; --text:#e8eef8; --muted:#8b94a7; --acc:#4fd1c5;
    --orange:#f59e0b; --purple:#a78bfa; --blue:#60a5fa; --pink:#ec4899; --danger:#f87171;
    --radius:14px; --shadow:0 8px 24px rgba(0,0,0,.35);
  }
  body{background:var(--bg); color:var(--text);}
  #legacy-root{display:none;} /* hide legacy UI */
  .sg-shell{max-width:1200px; margin:24px auto; padding:0 16px;}
  .sg-header{display:flex; align-items:center; gap:12px; background:var(--panel); border-radius:var(--radius); padding:12px 16px; box-shadow:var(--shadow);}
  .sg-title{font-weight:600; letter-spacing:.2px; opacity:.95;}
  .sg-btn{border:0; border-radius:999px; padding:8px 14px; background:#1f2431; color:var(--text); cursor:pointer}
  .sg-btn.primary{background:var(--acc); color:#062826; font-weight:600}
  .sg-btn.danger{background:var(--danger); color:#2f0c0c;}
  .sg-badge{background:#1f2431; padding:6px 10px; border-radius:999px; color:var(--muted); font-size:12px}
  .sg-grid{display:grid; grid-template-columns: repeat(auto-fill, minmax(320px,1fr)); gap:14px; margin-top:16px;}
  .sg-card{background:var(--panel); border-radius:var(--radius); box-shadow:var(--shadow); padding:12px; display:flex; flex-direction:column; gap:10px}
  .sg-row{display:flex; gap:10px; align-items:center; flex-wrap:wrap}
  .sg-chip{font-size:12px; padding:4px 8px; border-radius:999px; background:#1b202d; color:var(--muted)}
  .sg-icon{font-weight:700; width:28px; height:28px; border-radius:8px; display:grid; place-items:center; background:#1f2431}
  .sg-meter{height:8px; background:#0b0d12; border-radius:8px; overflow:hidden}
  .sg-meter>i{display:block; height:100%; width:0%; background:linear-gradient(90deg,#1dd3b0,#33b1ff)}
  .sg-vert{writing-mode:vertical-lr; transform:rotate(180deg)}
  .sg-slider{width:140px}
  .sg-num{width:84px; background:#0f1420; border:1px solid #242a38; color:var(--text); border-radius:10px; padding:6px 8px}
  .sg-select{background:#0f1420; border:1px solid #242a38; color:var(--text); border-radius:10px; padding:6px 8px}
  .sg-toggle{appearance:none; width:38px; height:22px; border-radius:999px; position:relative; background:#2a3041; outline:none; cursor:pointer}
  .sg-toggle:checked{background:#22c55e}
  .sg-toggle::after{content:""; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left .15s}
  .sg-toggle:checked::after{left:19px}
  .sg-tabs{display:flex; gap:8px; margin-top:14px}
  canvas.sg-scope, canvas.sg-fft{width:100%; height:160px; background:#0b0d12; border-radius:12px}
  `;
      document.head.appendChild(style);
  
      // Modern shell template (uses same $scope)
      const tpl = `
  <div class="sg-shell" id="sg-modern" ng-cloak>
    <div class="sg-header">
      <div class="sg-title">Signal Generator</div>
      <button class="sg-btn primary" ng-click="start()">Start</button>
      <button class="sg-btn" ng-click="stop()">Stop</button>
      <span class="sg-badge">Master</span>
      <div class="sg-meter" style="flex:1;min-width:160px"><i id="sg-master-fill"></i></div>
      <select class="sg-select" ng-model="presetSel" ng-options="p as p.name for p in presets">
        <option value="">Presets…</option>
      </select>
      <button class="sg-btn" ng-disabled="!presetSel" ng-click="applyPreset(presetSel)">Load</button>
      <span class="sg-badge">Add</span>
      <button class="sg-btn" ng-click="add()">Sine</button>
      <button class="sg-btn" ng-click="addNoise('white')">White</button>
      <button class="sg-btn" ng-click="addNoise('pink')">Pink</button>
      <button class="sg-btn" ng-click="addNoise('brown')">Brown</button>
    </div>
  
    <div class="sg-grid">
      <div class="sg-card" ng-repeat="o in oscillators track by o.id" tabindex="0" data-signal-id="{{o.id}}">
        <div class="sg-row">
          <div class="sg-icon" ng-style="{'background': o.type==='sine' ? '#153a37' : (o.type==='square'?'#3f2d1a':(o.type==='sawtooth'?'#2c1e49':(o.type==='triangle'?'#1a2b47':'#2d1b2a')))}">
            {{o.type[0] | uppercase}}
          </div>
          <div style="font-weight:600; flex:1">{{o.name || (o.type | uppercase)}}</div>
          <label class="sg-chip">Enabled <input class="sg-toggle" type="checkbox" ng-model="o.enabled"></label>
          <label class="sg-chip" ng-class="{'muted':o.muted}">Mute <input class="sg-toggle" type="checkbox" ng-model="o.muted"></label>
          <label class="sg-chip" ng-class="{'solo':o.solo}">Solo <input class="sg-toggle" type="checkbox" ng-model="o.solo"></label>
        </div>
  
        <div class="sg-row">
          <label>Type
            <select class="sg-select" ng-model="o.type">
              <option value="sine">Sine</option>
              <option value="square">Square</option>
              <option value="sawtooth">Saw</option>
              <option value="triangle">Triangle</option>
              <option value="white">White</option>
              <option value="pink">Pink</option>
              <option value="brown">Brown</option>
            </select>
          </label>
  
          <label ng-if="o.type==='sine'||o.type==='square'||o.type==='sawtooth'||o.type==='triangle'">Freq (Hz)
            <input class="sg-num" type="number" min="1" max="20000" step="1" ng-model="o.freq">
          </label>
  
          <label>Gain (%)
            <input class="sg-num" type="number" min="0" max="100" step="1" ng-model="o.gainPct">
          </label>
  
          <button class="sg-btn danger" ng-click="remove(o)">Remove</button>
        </div>
  
        <div class="sg-row" style="align-items:center">
          <div class="sg-meter" style="flex:1"><i id="sg-meter-{{o.id}}"></i></div>
        </div>
      </div>
    </div>
  
    <div class="sg-tabs">
      <button class="sg-btn" ng-class="{primary: scopeTab==='scope'}" ng-click="scopeTab='scope'">Oscilloscope</button>
      <button class="sg-btn" ng-class="{primary: scopeTab==='fft'}" ng-click="scopeTab='fft'">Spectrum</button>
      <button class="sg-btn" ng-class="{primary: scopeTab==='both'}" ng-click="scopeTab='both'">Both</button>
    </div>
  
    <div ng-if="scopeTab==='scope'||scopeTab==='both'">
      <canvas class="sg-scope" id="sg-scope"></canvas>
    </div>
    <div ng-if="scopeTab==='fft'||scopeTab==='both'">
      <canvas class="sg-fft" id="sg-fft"></canvas>
    </div>
  </div>`;
      const host = document.createElement('div');
      host.id = 'legacy-root'; // legacy content hidden
      document.body.prepend(host);
      const el = angular.element(tpl);
      document.body.appendChild(el[0]);
      $compile(el)($scope);
  
      // Tabs default
      $scope.scopeTab = 'both';
  
      /* ----- Meters, Oscilloscope, Spectrum ----- */
      const mData = new Uint8Array(engine.masterAnalyser.frequencyBinCount);
      const fData = new Float32Array(engine.masterAnalyser.frequencyBinCount);
      const tData = new Uint8Array(engine.masterAnalyser.fftSize);
  
      function drawMasterMeter() {
        engine.masterAnalyser.getByteTimeDomainData(tData);
        // peak estimate
        let peak = 0, mean = 0;
        for (let i=0;i<tData.length;i++){
          const v = (tData[i]-128)/128;
          mean += v*v;
          const a = Math.abs(v); if (a>peak) peak=a;
        }
        mean /= tData.length;
        const rms = Math.sqrt(mean);
        const level = Math.min(1, Math.max(0, Math.max(peak, rms)*1.2));
        const fill = document.getElementById('sg-master-fill');
        if (fill) fill.style.width = (level*100).toFixed(1)+'%';
      }
  
      function drawPerSignalMeters(){
        $scope.oscillators.forEach(o=>{
          const rec = engine.signals.get(o.id);
          if (!rec) return;
          const buf = new Uint8Array(rec.analyser.fftSize);
          rec.analyser.getByteTimeDomainData(buf);
          let peak=0, mean=0;
          for (let i=0;i<buf.length;i++){
            const v = (buf[i]-128)/128;
            mean += v*v;
            const a = Math.abs(v); if (a>peak) peak=a;
          }
          const rms = Math.sqrt(mean/buf.length);
          const level = Math.min(1, Math.max(peak, rms)*1.2);
          const fill = document.getElementById('sg-meter-'+o.id);
          if (fill) fill.style.width = (level*100).toFixed(1)+'%';
        });
      }
  
      function drawScope() {
        const c = document.getElementById('sg-scope');
        if (!c) return;
        const dpr = window.devicePixelRatio || 1;
        // Resize only when necessary
        const w = Math.floor(c.clientWidth*dpr), h = Math.floor(c.clientHeight*dpr);
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        const g = c.getContext('2d');
        engine.masterAnalyser.getByteTimeDomainData(tData);
        // Zero-crossing (rising) trigger for stability
        let start = 0;
        for (let i=1;i<tData.length;i++) {
          if (tData[i-1] < 128 && tData[i] >= 128) { start = i; break; }
        }
        g.clearRect(0,0,c.width,c.height);
        g.lineWidth = 2*dpr; g.strokeStyle = '#4fd1c5';
        g.beginPath();
        const step = c.width / (tData.length - start);
        for (let i=start, j=0; i<tData.length; i++, j++){
          const x = j*step;
          const v = (tData[i]/255);
          const y = v*c.height;
          if (i===0) g.moveTo(x,y); else g.lineTo(x,y);
        }
        g.stroke();
      }
  
      function drawFFT() {
        const c = document.getElementById('sg-fft');
        if (!c) return;
        const dpr = window.devicePixelRatio || 1;
        const w = Math.floor(c.clientWidth*dpr), h = Math.floor(c.clientHeight*dpr);
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        const g = c.getContext('2d');
        engine.masterAnalyser.getFloatFrequencyData(fData); // dB values
        g.clearRect(0,0,c.width,c.height);

        const minDb = engine.masterAnalyser.minDecibels;
        const maxDb = engine.masterAnalyser.maxDecibels;
        const nyquist = engine.ctx.sampleRate / 2;
        const minFreq = 20; // lower bound for log scale
        const logMin = Math.log(minFreq);
        const logMax = Math.log(nyquist);

        g.fillStyle = '#7aa8ff';
        // Draw one-pixel columns across width on a log-frequency axis
        for (let x=0; x<c.width; x++) {
          const t = x / (c.width - 1 || 1);
          const freq = Math.exp(logMin + t * (logMax - logMin));
          const bin = freq * engine.masterAnalyser.fftSize / engine.ctx.sampleRate;
          const i0 = Math.max(0, Math.min(fData.length - 1, Math.floor(bin)));
          const i1 = Math.max(0, Math.min(fData.length - 1, i0 + 1));
          const frac = bin - i0;
          const db = fData[i0] * (1 - frac) + fData[i1] * frac;
          const norm = Math.max(0, Math.min(1, (db - minDb) / (maxDb - minDb)));
          const hh = norm * c.height;
          g.fillRect(x, c.height - hh, 1, hh);
        }
      }
  
      let rafId = 0;
      let running = true;
      function loop(){
        if (!running) return;
        drawMasterMeter();
        drawPerSignalMeters();
        if ($scope.scopeTab==='scope'||$scope.scopeTab==='both') drawScope();
        if ($scope.scopeTab==='fft'||$scope.scopeTab==='both') drawFFT();
        rafId = requestAnimationFrame(loop);
      }
      rafId = requestAnimationFrame(loop);
      document.addEventListener('visibilitychange', ()=>{
        if (document.hidden) { running = false; if (rafId) cancelAnimationFrame(rafId); }
        else { if (!running) { running = true; rafId = requestAnimationFrame(loop); } }
      });
  
      // Initial content for quick test
      if ($scope.oscillators.length === 0) {
        addOne({type:'sine', freq:440, gainPct:12});
        addOne({type:'pink', gainPct:6});
      }
    }]);
  
  })();
  