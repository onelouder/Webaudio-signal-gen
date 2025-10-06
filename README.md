# WebAudio Signal Generator V3

A modern, browser-based audio signal generator with real-time visualization. Generate sine, square, sawtooth, triangle waves, and colored noise (white, pink, brown) with an intuitive dark UI.

![Signal Generator](https://img.shields.io/badge/WebAudio-Signal%20Generator-blue?style=for-the-badge)
![License](https://img.shields.io/badge/license-Apache%202.0-blue?style=for-the-badge)

## ✨ Features

### Audio Generation
- **Tone Generators**: Sine, Square, Sawtooth, Triangle waves
- **Noise Generators**: White, Pink, Brown noise
- **Multiple Signals**: Add/remove unlimited oscillators
- **Gain Control**: Individual volume control (0-100%)
- **Mute/Solo**: Per-signal mute and solo functionality
- **Presets**: Quick-load presets for common configurations

### Real-time Visualization
- **Oscilloscope**: Triggered waveform display with zero-crossing detection
- **Spectrum Analyzer**: Log-frequency spectrum with dB scaling
- **Level Meters**: Master and per-signal RMS/peak meters
- **Tabbed Display**: Switch between scope, spectrum, or both

### Modern UI
- **Dark Theme**: Easy on the eyes with modern styling
- **Responsive Design**: Works on desktop and mobile
- **Keyboard Shortcuts**: Space for start/stop, M/S for mute/solo
- **Real-time Updates**: Live parameter changes with smooth transitions

## 🚀 Quick Start

### Prerequisites
- Modern web browser (Chrome 66+, Firefox 76+, Safari 14.1+)
- HTTPS or localhost (required for AudioWorklet)

### Installation
1. Clone or download this repository
2. Serve the files over HTTPS or localhost:
   ```bash
   # Using Python 3
   python -m http.server 8000
   
   # Using Node.js (http-server)
   npx http-server
   
   # Using PHP
   php -S localhost:8000
   ```
3. Open `http://localhost:8000` in your browser

### File Structure
```
WebAudio-Signal-Gen V3/
├── index.html          # Main HTML file
├── sg.js              # Audio engine and UI
├── noise-worklet.js   # AudioWorklet for noise generation
└── README.md          # This file
```

## 🎛️ Usage

### Basic Operation
1. **Start/Stop**: Click the Start/Stop buttons or press Space
2. **Add Signals**: Click "Sine", "White", "Pink", or "Brown" buttons
3. **Adjust Parameters**: 
   - Change frequency (1-20000 Hz) for tone generators
   - Adjust gain (0-100%) for all signals
   - Toggle Enabled/Mute/Solo per signal
4. **Remove Signals**: Click "Remove" button on any signal card

### Presets
- **Sub Sine 60Hz**: Deep 60Hz sine wave
- **Dual Tone 440/660**: Musical interval (A4 and E5)
- **Pink Bed**: Ambient pink noise
- **Brown + Sine**: Brown noise with 440Hz sine

### Keyboard Shortcuts
- `Space`: Start/Stop audio
- `M`: Toggle mute on focused signal
- `S`: Toggle solo on focused signal

### Visualization
- **Oscilloscope Tab**: Shows triggered waveform
- **Spectrum Tab**: Log-frequency spectrum analyzer
- **Both Tab**: Side-by-side display

## 🔧 Technical Details

### Audio Engine
- **Web Audio API**: Modern audio processing
- **AudioWorklet**: High-performance noise generation
- **ScriptProcessorNode**: Fallback for older browsers
- **AnalyserNode**: Real-time frequency and time domain analysis

### Signal Processing
- **Sample Rate**: Browser default (typically 44.1kHz or 48kHz)
- **FFT Size**: 2048 samples for spectrum analysis
- **Buffer Size**: 4096 samples for fallback noise
- **dB Range**: -100dB to -20dB for spectrum display

### Browser Compatibility
| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| AudioWorklet | 66+ | 76+ | 14.1+ | 79+ |
| Fallback | All | All | All | All |
| Web Audio | 14+ | 25+ | 6+ | 12+ |

## 🛠️ Development

### Architecture
- **AngularJS 1.2**: UI framework and data binding
- **Web Audio API**: Audio processing and generation
- **Canvas 2D**: Real-time visualization
- **CSS Variables**: Modern styling system

### Key Components
- `SignalGenerator`: Audio engine factory
- `NoiseProcessor`: AudioWorklet for noise generation
- `MainCtrl`: Angular controller for UI logic
- Canvas renderers: Scope, spectrum, and meters

### Adding New Features
1. **New Wave Types**: Add to `TONE_TYPES` array in `sg.js`
2. **New Noise Types**: Extend `NoiseProcessor` in `noise-worklet.js`
3. **UI Changes**: Modify the template in `MainCtrl`
4. **Styling**: Update CSS variables in the injected stylesheet

## 🐛 Troubleshooting

### Common Issues

**No Audio Output**
- Check browser audio permissions
- Ensure HTTPS or localhost
- Try clicking Start button (user gesture required)

**Noise Generators Not Working**
- AudioWorklet requires secure context (HTTPS/localhost)
- Check browser console for error messages
- Fallback ScriptProcessorNode should work in all browsers

**Poor Performance**
- Close other audio applications
- Reduce number of active signals
- Check browser developer tools for performance issues

**Visualization Issues**
- Ensure canvas elements are visible
- Check browser console for rendering errors
- Try refreshing the page

### Browser Console Messages
- `AudioWorklet failed to load`: Serve over HTTPS or localhost
- `Noise worklet not available`: Using fallback ScriptProcessorNode
- `Failed to create noise node`: Check browser compatibility

## 📄 License

Apache License 2.0 - see LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📚 References

- [Web Audio API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [AudioWorklet API](https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet)
- [AngularJS Documentation](https://docs.angularjs.org/)

---

**Made with ❤️ for audio enthusiasts and developers**
