/**
 * Waveform Controller
 * Ported from Platforms project - creates smooth animated waves
 */

class WaveformController {
  private paths: NodeListOf<SVGPathElement>;
  private isAnimating: boolean = false;
  private animationId: number | null = null;

  constructor() {
    this.paths = document.querySelectorAll('.waveform-path');
  }

  start(): void {
    if (this.paths.length === 0) return;
    this.isAnimating = true;
    this.animate();
  }

  stop(): void {
    this.isAnimating = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private animate = (): void => {
    if (!this.isAnimating) return;

    const time = Date.now() / 1000;
    const width = window.innerWidth;

    this.paths.forEach((path, index) => {
      // Progressive amplitude for each layer
      const baseAmplitude = 20 - index * 5;

      // Responsive amplitude adjustment
      let amplitude: number;
      if (width >= 768) {
        // Desktop: full amplitude
        amplitude = baseAmplitude;
      } else {
        // Mobile/Tablet: reduced amplitude for performance
        amplitude = baseAmplitude * 0.6;
      }

      // Slowed down by 20% (multiply by 0.8)
      const baseFrequency = 0.5 + index * 0.2;
      const frequency = baseFrequency * 0.8;
      const phase = index * Math.PI / 3;

      const d = this.generateWavePath(time, amplitude, frequency, phase);
      path.setAttribute('d', d);
    });

    this.animationId = requestAnimationFrame(this.animate);
  }

  private generateWavePath(time: number, amplitude: number, frequency: number, phase: number): string {
    const width = 1440; // SVG viewBox width
    const baseline = 150; // Center line
    const points = 100; // Number of points for smooth curve

    let d = `M0,${baseline}`;

    for (let i = 0; i <= points; i++) {
      const x = (i / points) * width;
      const y = baseline + Math.sin((x / width) * frequency * Math.PI * 4 + time + phase) * amplitude;
      d += ` L${x},${y}`;
    }

    return d;
  }
}

// Initialize on DOM ready
function initWaveform(): void {
  console.log('[Waveform] Initializing...');
  const waveformElement = document.getElementById('waveform');

  if (!waveformElement) {
    console.error('[Waveform] Element #waveform not found in DOM');
    return;
  }

  console.log('[Waveform] Element found:', waveformElement);
  const controller = new WaveformController();
  console.log('[Waveform] Controller created, paths found:', controller['paths'].length);

  // Small delay to ensure smooth start
  setTimeout(() => {
    console.log('[Waveform] Activating waves...');
    waveformElement.classList.remove('waveform--loading');
    waveformElement.classList.add('waveform--active');
    controller.start();
    console.log('[Waveform] Started!');
  }, 100);

  // Handle visibility change to pause animation when tab is not visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      controller.stop();
    } else {
      controller.start();
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initWaveform);
} else {
  initWaveform();
}

export { WaveformController };