export function createQrDecoder({ root = document, getDecoder } = {}) {
  const variantCanvas = root.createElement('canvas');
  const variantContext = variantCanvas.getContext('2d', { willReadFrequently: true });
  let nativeQrDetectorPromise = null;

  function getQrDecoder() {
    return typeof getDecoder === 'function' ? getDecoder() : window.jsQR;
  }

  function decodeImageData(imageData, width, height) {
    const decoder = getQrDecoder();
    if (typeof decoder !== 'function') {
      throw new Error('QR-Decoder konnte nicht geladen werden.');
    }
    return decoder(imageData, width, height, { inversionAttempts: 'attemptBoth' });
  }

  async function getNativeQrDetector() {
    if (!('BarcodeDetector' in window)) return null;
    if (!nativeQrDetectorPromise) {
      nativeQrDetectorPromise = (async () => {
        try {
          const Detector = window.BarcodeDetector;
          if (typeof Detector.getSupportedFormats === 'function') {
            const formats = await Detector.getSupportedFormats();
            if (!formats.includes('qr_code')) return null;
          }
          return new Detector({ formats: ['qr_code'] });
        } catch {
          return null;
        }
      })();
    }
    return nativeQrDetectorPromise;
  }

  async function detectNativeQr(source) {
    const detector = await getNativeQrDetector();
    if (!detector || typeof detector.detect !== 'function') return null;
    try {
      const results = await detector.detect(source);
      const qrCode = results.find((result) => (
        !result.format || result.format === 'qr_code'
      ));
      const data = qrCode?.rawValue || '';
      return data ? { data } : null;
    } catch {
      return null;
    }
  }

  function readQrFromCanvas(canvas) {
    const context = canvas?.getContext?.('2d', { willReadFrequently: true });
    if (!context || !canvas.width || !canvas.height) return null;
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return decodeImageData(imageData.data, imageData.width, imageData.height);
  }

  function getLuminance(red, green, blue, alpha) {
    const opacity = alpha / 255;
    const blendedRed = red * opacity + 255 * (1 - opacity);
    const blendedGreen = green * opacity + 255 * (1 - opacity);
    const blendedBlue = blue * opacity + 255 * (1 - opacity);
    return Math.round(0.299 * blendedRed + 0.587 * blendedGreen + 0.114 * blendedBlue);
  }

  function applyContrast(imageData) {
    const data = imageData.data;
    let min = 255;
    let max = 0;
    for (let index = 0; index < data.length; index += 4) {
      const luminance = getLuminance(data[index], data[index + 1], data[index + 2], data[index + 3]);
      min = Math.min(min, luminance);
      max = Math.max(max, luminance);
    }
    const range = Math.max(1, max - min);
    for (let index = 0; index < data.length; index += 4) {
      const luminance = getLuminance(data[index], data[index + 1], data[index + 2], data[index + 3]);
      const enhanced = Math.max(0, Math.min(255, Math.round(((luminance - min) / range) * 255)));
      data[index] = enhanced;
      data[index + 1] = enhanced;
      data[index + 2] = enhanced;
      data[index + 3] = 255;
    }
  }

  function getOtsuThreshold(imageData) {
    const data = imageData.data;
    const histogram = new Array(256).fill(0);
    let total = 0;
    let sum = 0;
    for (let index = 0; index < data.length; index += 4) {
      const luminance = getLuminance(data[index], data[index + 1], data[index + 2], data[index + 3]);
      histogram[luminance] += 1;
      total += 1;
      sum += luminance;
    }
    let backgroundWeight = 0;
    let backgroundSum = 0;
    let bestThreshold = 128;
    let bestVariance = -1;
    for (let threshold = 0; threshold < 256; threshold += 1) {
      backgroundWeight += histogram[threshold];
      if (!backgroundWeight) continue;
      const foregroundWeight = total - backgroundWeight;
      if (!foregroundWeight) break;
      backgroundSum += threshold * histogram[threshold];
      const backgroundMean = backgroundSum / backgroundWeight;
      const foregroundMean = (sum - backgroundSum) / foregroundWeight;
      const variance = backgroundWeight * foregroundWeight * ((backgroundMean - foregroundMean) ** 2);
      if (variance > bestVariance) {
        bestVariance = variance;
        bestThreshold = threshold;
      }
    }
    return bestThreshold;
  }

  function applyThreshold(imageData, threshold = getOtsuThreshold(imageData)) {
    const data = imageData.data;
    for (let index = 0; index < data.length; index += 4) {
      const luminance = getLuminance(data[index], data[index + 1], data[index + 2], data[index + 3]);
      const value = luminance >= threshold ? 255 : 0;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  function growDarkPixels(imageData, radius = 1, iterations = 1) {
    const { data, width, height } = imageData;
    if (!width || !height || radius < 1 || iterations < 1) return;
    for (let iteration = 0; iteration < iterations; iteration += 1) {
      const source = new Uint8ClampedArray(data);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = (y * width + x) * 4;
          if (source[index] < 128) {
            data[index] = 0;
            data[index + 1] = 0;
            data[index + 2] = 0;
            data[index + 3] = 255;
            continue;
          }
          let hasDarkNeighbor = false;
          for (let dy = -radius; dy <= radius && !hasDarkNeighbor; dy += 1) {
            const ny = y + dy;
            if (ny < 0 || ny >= height) continue;
            for (let dx = -radius; dx <= radius; dx += 1) {
              const nx = x + dx;
              if (nx < 0 || nx >= width) continue;
              const neighborIndex = (ny * width + nx) * 4;
              if (source[neighborIndex] < 128) {
                hasDarkNeighbor = true;
                break;
              }
            }
          }
          const value = hasDarkNeighbor ? 0 : 255;
          data[index] = value;
          data[index + 1] = value;
          data[index + 2] = value;
          data[index + 3] = 255;
        }
      }
    }
  }

  function applyDotRepair(imageData, options = {}) {
    if (options.contrast) {
      applyContrast(imageData);
    }
    applyThreshold(imageData, options.threshold ?? getOtsuThreshold(imageData));
    growDarkPixels(imageData, options.growRadius || 1, options.growIterations || 1);
  }

  function prepareDecodeVariant(sourceCanvas, options = {}) {
    if (!variantContext || !sourceCanvas.width || !sourceCanvas.height) return null;
    const sourceMaxSide = Math.max(sourceCanvas.width, sourceCanvas.height);
    const targetMaxSide = options.targetMaxSide || sourceMaxSide;
    const minDecodeSide = options.minDecodeSide || 0;
    let scale = 1;
    if (minDecodeSide && sourceMaxSide < minDecodeSide) {
      scale = minDecodeSide / sourceMaxSide;
    } else if (targetMaxSide && sourceMaxSide > targetMaxSide) {
      scale = targetMaxSide / sourceMaxSide;
    }
    scale = Math.min(4, Math.max(0.1, scale));
    const drawWidth = Math.max(1, Math.round(sourceCanvas.width * scale));
    const drawHeight = Math.max(1, Math.round(sourceCanvas.height * scale));
    const padding = Math.round(Math.max(drawWidth, drawHeight) * (options.paddingRatio || 0));
    const width = drawWidth + padding * 2;
    const height = drawHeight + padding * 2;
    variantCanvas.width = width;
    variantCanvas.height = height;
    variantContext.imageSmoothingEnabled = options.smoothing !== false;
    variantContext.clearRect(0, 0, width, height);
    variantContext.fillStyle = '#ffffff';
    variantContext.fillRect(0, 0, width, height);
    variantContext.drawImage(sourceCanvas, padding, padding, drawWidth, drawHeight);
    if (options.mode && options.mode !== 'plain') {
      const imageData = variantContext.getImageData(0, 0, width, height);
      if (options.mode === 'contrast') {
        applyContrast(imageData);
      } else if (options.mode === 'otsu') {
        applyThreshold(imageData);
      } else if (options.mode === 'threshold-low') {
        applyThreshold(imageData, 96);
      } else if (options.mode === 'threshold-high') {
        applyThreshold(imageData, 160);
      } else if (options.mode === 'dot-grow') {
        applyDotRepair(imageData, {
          growRadius: options.growRadius || 1,
          growIterations: options.growIterations || 1,
          threshold: options.threshold,
        });
      } else if (options.mode === 'dot-grow-strong') {
        applyDotRepair(imageData, {
          growRadius: options.growRadius || 1,
          growIterations: options.growIterations || 2,
          threshold: options.threshold,
        });
      } else if (options.mode === 'dot-contrast-grow') {
        applyDotRepair(imageData, {
          contrast: true,
          growRadius: options.growRadius || 1,
          growIterations: options.growIterations || 1,
          threshold: options.threshold,
        });
      }
      variantContext.putImageData(imageData, 0, 0);
    }
    return variantCanvas;
  }

  function yieldToBrowser() {
    return new Promise((resolve) => {
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => resolve());
        return;
      }
      setTimeout(resolve, 0);
    });
  }

  async function decodeCanvasContent(canvas, { thorough = false, useNative = true, dotRepair = false, budgetMs = 0 } = {}) {
    const deadline = budgetMs > 0 ? performance.now() + budgetMs : 0;
    const isExpired = () => deadline > 0 && performance.now() > deadline;

    const directCode = readQrFromCanvas(canvas);
    if (directCode?.data) return directCode;

    if (useNative) {
      const nativeCode = await detectNativeQr(canvas);
      if (nativeCode?.data) return nativeCode;
    }

    const standardVariants = thorough ? [
      { paddingRatio: 0.08, mode: 'plain' },
      { paddingRatio: 0.08, mode: 'contrast' },
      { paddingRatio: 0.08, mode: 'otsu' },
      { paddingRatio: 0.08, mode: 'threshold-low' },
      { paddingRatio: 0.08, mode: 'threshold-high' },
      { minDecodeSide: 900, paddingRatio: 0.08, mode: 'plain', smoothing: false },
      { targetMaxSide: 1200, paddingRatio: 0.08, mode: 'contrast' },
    ] : [
      { paddingRatio: 0.06, mode: 'plain' },
    ];
    const dotRepairVariants = thorough ? [
      { minDecodeSide: 900, targetMaxSide: 1500, paddingRatio: 0.08, mode: 'dot-grow', smoothing: false },
      { minDecodeSide: 1100, targetMaxSide: 1500, paddingRatio: 0.1, mode: 'dot-contrast-grow', smoothing: false },
      { minDecodeSide: 1200, targetMaxSide: 1500, paddingRatio: 0.1, mode: 'dot-grow-strong', smoothing: false },
      { minDecodeSide: 1000, targetMaxSide: 1400, paddingRatio: 0.08, mode: 'dot-grow', threshold: 112, smoothing: false },
      { minDecodeSide: 1000, targetMaxSide: 1400, paddingRatio: 0.08, mode: 'dot-grow', threshold: 144, smoothing: false },
      { minDecodeSide: 1200, targetMaxSide: 1600, paddingRatio: 0.12, mode: 'dot-grow-strong', growRadius: 2, growIterations: 2, smoothing: false },
      { minDecodeSide: 1300, targetMaxSide: 1600, paddingRatio: 0.12, mode: 'dot-contrast-grow', growRadius: 2, growIterations: 2, smoothing: false },
      { minDecodeSide: 1300, targetMaxSide: 1600, paddingRatio: 0.12, mode: 'dot-grow-strong', growRadius: 2, growIterations: 2, threshold: 112, smoothing: false },
      { minDecodeSide: 1300, targetMaxSide: 1600, paddingRatio: 0.12, mode: 'dot-grow-strong', growRadius: 2, growIterations: 2, threshold: 144, smoothing: false },
      { minDecodeSide: 1400, targetMaxSide: 1600, paddingRatio: 0.12, mode: 'dot-grow-strong', growRadius: 3, growIterations: 2, smoothing: false },
    ] : [
      { targetMaxSide: 900, paddingRatio: 0.08, mode: 'dot-grow', smoothing: false },
      { targetMaxSide: 900, paddingRatio: 0.08, mode: 'dot-contrast-grow', smoothing: false },
      { targetMaxSide: 900, paddingRatio: 0.1, mode: 'dot-grow-strong', growRadius: 2, growIterations: 2, smoothing: false },
    ];
    const variants = dotRepair || thorough ? [
      ...standardVariants,
      ...dotRepairVariants,
    ] : standardVariants;

    const attempted = new Set();
    for (const variant of variants) {
      if (isExpired()) {
        throw new Error('Die Analyse des Bildes hat zu lange gedauert. Bitte ein kleineres oder schärferes Bild verwenden.');
      }
      const preparedCanvas = prepareDecodeVariant(canvas, variant);
      if (!preparedCanvas) continue;
      const key = `${preparedCanvas.width}x${preparedCanvas.height}:${JSON.stringify(variant)}`;
      if (attempted.has(key)) continue;
      attempted.add(key);
      const code = readQrFromCanvas(preparedCanvas);
      if (code?.data) return code;
      if (deadline) {
        await yieldToBrowser();
      }
    }

    return null;
  }

  return {
    decodeCanvasContent,
    readQrFromCanvas,
    prepareDecodeVariant,
  };
}
