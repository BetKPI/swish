/**
 * Capture a DOM element as a watermarked PNG image.
 * Uses html2canvas-pro (already in deps) and draws a subtle
 * "swish-jet.vercel.app" watermark in the bottom-right corner.
 */
export async function captureWithWatermark(
  el: HTMLElement,
  filename = "swish-chart.png",
): Promise<Blob | null> {
  try {
    const html2canvas = (await import("html2canvas-pro")).default;
    const raw = await html2canvas(el, {
      backgroundColor: "#0a0a0a",
      scale: 2,
      useCORS: true,
      logging: false,
    });

    // Draw watermark on a copy canvas
    const canvas = document.createElement("canvas");
    canvas.width = raw.width;
    canvas.height = raw.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(raw, 0, 0);

    // Watermark text
    const fontSize = Math.max(14, Math.round(canvas.width * 0.018));
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText("swish-jet.vercel.app", canvas.width - fontSize * 0.8, canvas.height - fontSize * 0.6);

    return new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
  } catch (e) {
    console.error("Capture failed:", e);
    return null;
  }
}

/**
 * Download a blob as a file.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Copy an image blob to clipboard (falls back to download).
 */
export async function copyImageToClipboard(blob: Blob, filename: string): Promise<boolean> {
  try {
    if (typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      return true;
    }
  } catch {
    // ClipboardItem not supported or permission denied - fall back
  }
  downloadBlob(blob, filename);
  return false;
}
