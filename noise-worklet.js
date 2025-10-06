// noise-worklet.js
class NoiseProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
      return [{ name: 'gain', defaultValue: 1.0, minValue: 0, maxValue: 1 }];
    }

    constructor(options) {
      super();
      this.type = (options?.processorOptions?.type) || 'white';
      // Internal state holders; names avoid collisions with generator methods
      this.pinkState = { b0:0,b1:0,b2:0,b3:0,b4:0,b5:0,b6:0 };
      this.brownState = 0;
      this.port.onmessage = (e) => { if (e?.data?.type) this.type = e.data.type; };
    }

    white() { return Math.random()*2 - 1; }

    genPink() {
      const w = this.white(); const p = this.pinkState;
      p.b0 = 0.99886*p.b0 + 0.0555179*w;
      p.b1 = 0.99332*p.b1 + 0.0750759*w;
      p.b2 = 0.96900*p.b2 + 0.1538520*w;
      p.b3 = 0.86650*p.b3 + 0.3104856*w;
      p.b4 = 0.55000*p.b4 + 0.5329522*w;
      p.b5 = -0.7616*p.b5 - 0.0168980*w;
      const out = p.b0+p.b1+p.b2+p.b3+p.b4+p.b5+p.b6 + 0.5362*w;
      p.b6 = 0.115926*w;
      return out * 0.11;
    }

    genBrown() {
      this.brownState += this.white()*0.02;
      if (this.brownState < -1) this.brownState = -1;
      if (this.brownState >  1) this.brownState =  1;
      return this.brownState * 0.8;
    }

    process(inputs, outputs, parameters) {
      const ch = outputs[0][0];
      const gainParam = parameters.gain;
      for (let i=0;i<ch.length;i++){
        let s;
        switch (this.type) {
          case 'pink':  s = this.genPink();  break;
          case 'brown': s = this.genBrown(); break;
          default:      s = this.white();    break;
        }
        const g = gainParam.length === 1 ? gainParam[0] : gainParam[i];
        ch[i] = s * g;
      }
      return true;
    }
  }
  registerProcessor('noise-processor', NoiseProcessor);