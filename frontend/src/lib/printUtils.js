/**
 * printUtils.js - 공통 A4 인쇄/PDF 저장 유틸리티
 *
 * 문제: jsPDF에 이미지를 삽입할 때 pdfHeight를 비율로만 계산하면
 *       A4 높이(297mm)를 초과해도 단일 페이지에 끼워넣어 내용이 잘리거나 왜곡됨.
 *
 * 해결: 요소를 A4 픽셀 사이즈에 맞춰 캡처한 후, A4 단위로 페이지를 분할 삽입.
 */
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

/**
 * A4 사이즈 상수 (mm 단위)
 * A4 Portrait: 210mm x 297mm
 * A4 Landscape: 297mm x 210mm
 */
export const A4 = {
  W_MM: 210,
  H_MM: 297,
  W_MM_LAND: 297,
  H_MM_LAND: 210,
};

/**
 * oklch 컬러를 hex로 변환하는 DOM 필터 (Tailwind v4 대응)
 */
const oklchFilter = (node) => {
  try {
    if (node.style) {
      if (node.style.color?.includes('oklch')) node.style.color = '#000000';
      if (node.style.backgroundColor?.includes('oklch')) node.style.backgroundColor = '#ffffff';
      if (node.style.borderColor?.includes('oklch')) node.style.borderColor = '#d1d5db';
    }
  } catch (_) {}
  return true;
};

/**
 * HTML 요소를 A4 PDF로 변환하여 다운로드하거나 Blob을 반환합니다.
 *
 * @param {HTMLElement} element - 캡처할 DOM 요소 (a4-wrapper 클래스 요소)
 * @param {Object} options
 * @param {string} options.fileName - 저장할 파일명 (확장자 .pdf 포함)
 * @param {'portrait'|'landscape'} options.orientation - 용지 방향 (기본: portrait)
 * @param {'download'|'blob'} options.action - 'download': 즉시 저장, 'blob': Blob 반환
 * @param {number} options.pixelRatio - 캡처 해상도 (기본: 3)
 * @param {number} options.marginMm - 여백 mm (기본: 0, 요소 내부에서 이미 여백 처리)
 * @param {boolean} options.multiPage - true면 내용을 A4 높이에 맞게 페이지 분할
 * @returns {Promise<Blob|void>}
 */
export async function generateA4PDF(element, options = {}) {
  const {
    fileName = `document_${Date.now()}.pdf`,
    orientation = 'portrait',
    action = 'download',
    pixelRatio = 3,
    marginMm = 0,
    multiPage = false,
  } = options;

  const isLandscape = orientation === 'landscape';
  const pdfWidthMm = isLandscape ? A4.W_MM_LAND : A4.W_MM;
  const pdfHeightMm = isLandscape ? A4.H_MM_LAND : A4.H_MM;

  // 1. 이미지 로드 완료 대기
  const images = element.querySelectorAll('img');
  await Promise.all(
    Array.from(images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          })
    )
  );

  // 2. 요소를 PNG 이미지로 캡처
  const dataUrl = await toPng(element, {
    cacheBust: true,
    backgroundColor: '#ffffff',
    pixelRatio,
    filter: oklchFilter,
  });

  // 3. PDF 생성
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const usableWidthMm = pageWidthMm - marginMm * 2;
  const usableHeightMm = pageHeightMm - marginMm * 2;

  // 이미지 실제 픽셀 크기 → mm 비율 변환
  const img = new window.Image();
  const imgLoaded = new Promise((res) => { img.onload = res; });
  img.src = dataUrl;
  await imgLoaded;

  const imgWidthPx = img.naturalWidth;
  const imgHeightPx = img.naturalHeight;

  // 이미지의 전체 높이를 mm 단위로 계산 (비율 유지)
  const scale = usableWidthMm / imgWidthPx;
  const imgTotalHeightMm = imgHeightPx * scale;

  if (multiPage && imgTotalHeightMm > usableHeightMm) {
    // 여러 페이지로 분할
    const pageImgHeightPx = usableHeightMm / scale; // 한 페이지에 해당하는 이미지 픽셀 높이
    let yOffset = 0;
    let pageNum = 0;

    while (yOffset < imgHeightPx) {
      if (pageNum > 0) pdf.addPage();

      // 캔버스로 해당 페이지 영역만 잘라냄
      const canvas = document.createElement('canvas');
      const sliceHeight = Math.min(pageImgHeightPx, imgHeightPx - yOffset);
      canvas.width = imgWidthPx;
      canvas.height = sliceHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, -yOffset, imgWidthPx, imgHeightPx);

      const sliceDataUrl = canvas.toDataURL('image/png');
      const sliceHeightMm = sliceHeight * scale;
      pdf.addImage(sliceDataUrl, 'PNG', marginMm, marginMm, usableWidthMm, sliceHeightMm);

      yOffset += pageImgHeightPx;
      pageNum++;
    }
  } else {
    // 단일 페이지 (A4 높이에 맞게 축소)
    const finalHeightMm = Math.min(imgTotalHeightMm, usableHeightMm);
    pdf.addImage(dataUrl, 'PNG', marginMm, marginMm, usableWidthMm, finalHeightMm);
  }

  if (action === 'download') {
    pdf.save(fileName);
    return;
  } else if (action === 'blob') {
    return pdf.output('blob');
  }
}

/**
 * window.print()를 사용하는 컴포넌트에서 인쇄 영역 제어 유틸리티
 * 
 * 특정 요소만 인쇄하고 싶을 때 사용. 해당 요소에 print-safe-area 클래스를 부여해야 함.
 * @param {Function} beforePrint - 인쇄 전 콜백
 * @param {Function} afterPrint - 인쇄 후 콜백
 */
export function triggerPrint(beforePrint, afterPrint) {
  if (beforePrint) beforePrint();
  const cleanup = () => {
    if (afterPrint) afterPrint();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  window.print();
}
