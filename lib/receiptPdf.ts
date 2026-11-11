import { toPng } from 'html-to-image';

const PDF_PAGE_WIDTH_MM = 210;
const PDF_PAGE_HEIGHT_MM = 297;
const PDF_MARGIN_MM = 12.5;
const PDF_CONTENT_WIDTH_MM = PDF_PAGE_WIDTH_MM - PDF_MARGIN_MM * 2;
const PDF_CONTENT_HEIGHT_MM = PDF_PAGE_HEIGHT_MM - PDF_MARGIN_MM * 2;
const EXPORT_CAPTURE_WIDTH = 720;

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('تعذر تجهيز صورة الإيصال لإنشاء PDF.'));
    image.src = dataUrl;
  });
}

function cropImageToDataUrl(
  image: HTMLImageElement,
  sourceY: number,
  sourceHeight: number,
): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = sourceHeight;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('تعذر إنشاء صفحة PDF في هذا المتصفح.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(
    image,
    0,
    sourceY,
    image.naturalWidth,
    sourceHeight,
    0,
    0,
    canvas.width,
    sourceHeight,
  );
  return canvas.toDataURL('image/png');
}

/**
 * Creates a local, rasterized PDF from the visible receipt DOM. Raster output
 * intentionally preserves the existing Arabic RTL layout, logo and CSS without
 * reimplementing appointment data or sending any patient details to a server.
 */
export async function createReceiptPdf(receiptElement: HTMLElement): Promise<Blob> {
  if (!receiptElement.isConnected) {
    throw new Error('الإيصال غير ظاهر حاليًا. أعد فتح الإيصال ثم حاول مرة أخرى.');
  }

  const sourceWidth = Math.max(receiptElement.getBoundingClientRect().width, 1);
  const captureHeight = Math.ceil(
    Math.max(receiptElement.scrollHeight, receiptElement.getBoundingClientRect().height)
      * EXPORT_CAPTURE_WIDTH
      / sourceWidth,
  );

  const png = await toPng(receiptElement, {
    cacheBust: true,
    backgroundColor: '#ffffff',
    pixelRatio: 2,
    width: EXPORT_CAPTURE_WIDTH,
    height: captureHeight,
    style: {
      width: `${EXPORT_CAPTURE_WIDTH}px`,
      maxWidth: 'none',
      boxSizing: 'border-box',
      margin: '0',
    },
  });

  const image = await loadImage(png);
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('تعذر قراءة صورة الإيصال الناتجة.');
  }

  const jsPdfModule = await import('jspdf');
  const pdf = new jsPdfModule.jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const sourcePixelsPerMm = image.naturalWidth / PDF_CONTENT_WIDTH_MM;
  const maxSliceHeight = Math.max(1, Math.floor(PDF_CONTENT_HEIGHT_MM * sourcePixelsPerMm));
  let sourceY = 0;
  let pageIndex = 0;

  while (sourceY < image.naturalHeight) {
    const sliceHeight = Math.min(maxSliceHeight, image.naturalHeight - sourceY);
    if (pageIndex > 0) pdf.addPage('a4', 'portrait');

    const pageImage = cropImageToDataUrl(image, sourceY, sliceHeight);
    const renderedHeightMm = sliceHeight / sourcePixelsPerMm;
    pdf.addImage(
      pageImage,
      'PNG',
      PDF_MARGIN_MM,
      PDF_MARGIN_MM,
      PDF_CONTENT_WIDTH_MM,
      renderedHeightMm,
      `receipt-page-${pageIndex}`,
      'FAST',
    );

    sourceY += sliceHeight;
    pageIndex += 1;
  }

  return pdf.output('blob');
}
