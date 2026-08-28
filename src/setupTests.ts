import '@testing-library/jest-dom/vitest';

// jsdom não implementa Blob.prototype.arrayBuffer / .text (navegadores reais sim).
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as ArrayBuffer);
      fr.onerror = () => reject(fr.error ?? new Error('FileReader falhou'));
      fr.readAsArrayBuffer(this);
    });
  };
}

