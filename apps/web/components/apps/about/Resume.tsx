import React from "react";

// The few pdf.js calls this viewer makes (pdf.js is loaded at runtime from /vendor, untyped)
interface PdfViewport { width: number; height: number }
interface PdfPage {
  getViewport(options: { scale: number }): PdfViewport;
  render(options: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }): { promise: Promise<void> };
}
interface PdfDocument { numPages: number; getPage(n: number): Promise<PdfPage> }

const PDFJS_URL: string = "/vendor/pdfjs/pdf.min.mjs";

export function Resume() {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRefs = React.useRef<(HTMLCanvasElement | null)[]>([]);
  const pdfRef = React.useRef<PdfDocument | null>(null);
  const renderTokenRef = React.useRef(0);
  const [numPages, setNumPages] = React.useState(0);
  const [loadError, setLoadError] = React.useState(false);

  const renderAllPages = React.useCallback(async () => {
    if (!pdfRef.current || !containerRef.current || numPages === 0) return;

    const token = ++renderTokenRef.current;
    const containerWidth = Math.max((containerRef.current.clientWidth || 800) - 16, 280);
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
      if (token !== renderTokenRef.current) return;
      const page = await pdfRef.current.getPage(pageNumber);
      const baseViewport = page.getViewport({ scale: 1 });
      const scale = containerWidth / baseViewport.width;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRefs.current[pageNumber - 1];
      if (!canvas) continue;

      const context = canvas.getContext("2d");
      if (!context) continue;

      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      await page.render({ canvasContext: context, viewport }).promise;
    }
  }, [numPages]);

  React.useEffect(() => {
    let mounted = true;

    const loadPdf = async () => {
      try {
        // Load pdf.js as a native module from /vendor (scripts/vendor.mjs copies it there): bundling its
        // prebuilt file through Next's dev webpack crashes with "defineProperty called on non-object"
        const pdfjs = await import(/* webpackIgnore: true */ PDFJS_URL);
        pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdfjs/pdf.worker.min.mjs";
        // isEvalSupported: false keeps pdf.js from compiling fonts with new Function(), which the CSP blocks
        const task = pdfjs.getDocument({ url: "./files/Aman-Agrawal-Resume.pdf", isEvalSupported: false });
        const pdf = await task.promise;
        if (!mounted) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
      } catch (error) {
        console.error("Resume preview failed:", error);
        setLoadError(true);
      }
    };

    loadPdf();
    return () => {
      mounted = false;
      renderTokenRef.current++;
    };
  }, []);

  React.useEffect(() => {
    renderAllPages();
  }, [numPages, renderAllPages]);

  React.useEffect(() => {
    const onResize = () => {
      renderAllPages();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [renderAllPages]);

  if (loadError) {
    return (
      <div className="w-full h-full flex items-center justify-center px-4 text-center text-sm md:text-base">
        Unable to render resume preview.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full h-full overflow-y-auto px-2 md:px-4 py-3">
      {Array.from({ length: numPages || 1 }).map((_, index) => (
        <canvas
          key={index}
          ref={(el) => {
            canvasRefs.current[index] = el;
          }}
          className="block w-full max-w-4xl mx-auto mb-4 bg-white rounded-sm"
          aria-label={`Resume page ${index + 1}`}
        />
      ))}
    </div>
  );
}
