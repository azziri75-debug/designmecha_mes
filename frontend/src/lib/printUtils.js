/**
 * printUtils.js - 공통 A4 인쇄/PDF 저장 유틸리티
 *
 * 문제: jsPDF에 이미지를 삽입할 때 pdfHeight를 비율로만 계산하면
 *       A4 높이(297mm)를 초과해도 단일 페이지에 끼워넣어 내용이 잘리거나 왜곡됨.
 *
 * 해결: 요소를 A4 픽셀 사이즈에 맞춰 캡처한 후, A4 단위로 페이지를 분할 삽입.
 */
import { toPng, toJpeg } from 'html-to-image';
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
 * oklch 컬러를 hex로 변환하거나 인쇄 제외 요소를 필터링하는 DOM 필터
 */
const printFilter = (node) => {
  // 1. 인쇄 제외 클래스 체크
  if (node.classList && (node.classList.contains('no-print') || node.classList.contains('idf-no-print'))) {
    return false;
  }
  
  // 2. oklch 컬러 변환 (html-to-image/canvg 이슈 대응)
  try {
    if (node.style) {
      if (node.style.color?.includes('oklch')) node.style.color = '#000000';
      if (node.style.backgroundColor?.includes('oklch')) node.style.backgroundColor = '#ffffff';
      if (node.style.borderColor?.includes('oklch')) node.style.borderColor = '#d1d5db';
      // 그림자 및 테두리 제거 (캡처 시 깨끗한 용지 보장)
      node.style.boxShadow = 'none';
      node.style.border = node.style.border === 'none' ? 'none' : node.style.border; // Preserve document borders but remove UI ones?
      // Actually, for a4-wrapper, we want it clean.
      if (node.classList && (node.classList.contains('a4-wrapper') || node.classList.contains('a4-paper-container'))) {
        node.style.boxShadow = 'none';
        node.style.border = 'none';
        node.style.borderRadius = '0';
      }
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
    pixelRatio = 2, // Reduced from 3 to 2 for size optimization
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

  // 2. 요소를 PNG 이미지로 캡처 (스케일 및 레이아웃 보정 포함)
  const origTransform = element.style.transform;
  const origMargin = element.style.margin;
  const origTransformOrigin = element.style.transformOrigin;
  const origWidth = element.style.width;
  const origMinHeight = element.style.minHeight;
  const origOverflow = element.style.overflow;
  const origPosition = element.style.position;
  
  // 캡처 전용 유틸리티 클래스 주입 (그림자 제거 등)
  element.classList.add('is-capturing');

  // 캡처를 위한 강제 스타일 주입 (A4 규격 강제)
  const targetWidthMM = isLandscape ? A4.W_MM_LAND : A4.W_MM;
  element.style.transform = 'scale(1)';
  element.style.margin = '0';
  element.style.transformOrigin = 'top left';
  element.style.width = `${targetWidthMM}mm`;
  element.style.minHeight = 'max-content';
  element.style.height = 'max-content';
  element.style.overflow = 'visible';
  element.style.position = 'relative';

  // reflow 대기 (정합성을 위해 300ms로 상향)
  await new Promise(r => setTimeout(r, 300));

  const scrollW = element.clientWidth || element.offsetWidth;
  const scrollH = element.clientHeight || element.offsetHeight;

  try {
    const dataUrl = await toPng(element, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      pixelRatio,
      filter: printFilter,
      width: scrollW,
      height: scrollH,
      style: {
        transform: 'scale(1)',
        left: '0',
        top: '0',
        boxShadow: 'none',
        border: 'none'
      }
    });

    // 3. PDF 생성
    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pageWidthMm = pdf.internal.pageSize.getWidth();
    const pageHeightMm = pdf.internal.pageSize.getHeight();
    const usableWidthMm = pageWidthMm - marginMm * 2;
    const usableHeightMm = pageHeightMm - marginMm * 2;

    // 이미지 실제 픽셀 크기 → mm 비율 변환
    const img = new window.Image();
    const imgLoaded = new Promise((res) => { img.onload = res; img.onerror = res; });
    img.src = dataUrl;
    await imgLoaded;

    const imgWidthPx = img.naturalWidth || scrollW;
    const imgHeightPx = img.naturalHeight || scrollH;

    // 이미지의 전체 높이를 mm 단위로 계산 (비율 유지)
    let scalePdf = usableWidthMm / imgWidthPx;
    let imgTotalHeightMm = imgHeightPx * scalePdf;

    // [최적화] 단일 페이지 선호 시 높이가 아주 미세하게 넘어가면 강제 축소
    if (!multiPage || imgTotalHeightMm <= usableHeightMm * 1.05) {
      if (imgTotalHeightMm > usableHeightMm) {
        // 너비 기준 스케일보다 높이 기준 스케일이 더 작아야 함 (더 많이 축소)
        scalePdf = Math.min(usableWidthMm / imgWidthPx, usableHeightMm / imgHeightPx);
        imgTotalHeightMm = imgHeightPx * scalePdf;
      }
    }

    if (multiPage && imgTotalHeightMm > usableHeightMm) {
      // 여러 페이지로 분할 (이미 축소 처리를 거쳤음에도 여전히 큰 경우)
      const pageImgHeightPx = usableHeightMm / scalePdf;
      let yOffset = 0;
      let pageNum = 0;

      while (yOffset < imgHeightPx) {
        if (pageNum > 0) pdf.addPage();
        const canvas = document.createElement('canvas');
        const sliceHeight = Math.min(pageImgHeightPx, imgHeightPx - yOffset);
        canvas.width = imgWidthPx;
        canvas.height = sliceHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, -yOffset, imgWidthPx, imgHeightPx);
        const sliceDataUrl = canvas.toDataURL('image/png'); // Using PNG
        pdf.addImage(sliceDataUrl, 'PNG', marginMm, marginMm, imgWidthPx * scalePdf, sliceHeight * scalePdf, undefined, 'FAST');
        yOffset += pageImgHeightPx;
        pageNum++;
      }
    } else {
      // 단일 페이지 (A4 높이에 맞게 조절, 잘리지 않도록)
      pdf.addImage(dataUrl, 'PNG', marginMm, marginMm, imgWidthPx * scalePdf, imgHeightPx * scalePdf, undefined, 'FAST');
    }

    if (action === 'download') {
      pdf.save(fileName);
      return;
    } else if (action === 'blob') {
      return pdf.output('blob');
    }
  } finally {
    // 원복
    element.style.transform = origTransform;
    element.style.margin = origMargin;
    element.style.transformOrigin = origTransformOrigin;
    element.style.width = origWidth;
    element.style.minHeight = origMinHeight;
    element.style.overflow = origOverflow;
    element.style.position = origPosition;
    element.classList.remove('is-capturing');
  }
}


/**
 * ✅ 다중 요소를 하나의 PDF로 병합하여 생성
 */
export async function generateMultiPageA4PDF(elements, options = {}) {
  const {
    fileName = `document_${Date.now()}.pdf`,
    orientation = 'portrait',
    action = 'download',
    pixelRatio = 2,
    marginMm = 0,
  } = options;

  if (!elements || elements.length === 0) { alert('내용이 없습니다.'); return; }

  const isLandscape = orientation === 'landscape';
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const usableWidthMm = pageWidthMm - marginMm * 2;
  const usableHeightMm = pageHeightMm - marginMm * 2;

  const targetWidthMM = isLandscape ? A4.W_MM_LAND : A4.W_MM;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el) continue;
    if (i > 0) pdf.addPage();

    const origT = el.style.transform;
    const origM = el.style.margin;
    const origTO = el.style.transformOrigin;
    const origW = el.style.width;
    const origH = el.style.minHeight;
    const origO = el.style.overflow;
    
    // 캡처 전용 유틸리티 클래스 주입 (그림자 제거 등)
    el.classList.add('is-capturing');

    el.style.transform = 'scale(1)';
    el.style.margin = '0';
    el.style.transformOrigin = 'top left';
    el.style.width = `${targetWidthMM}mm`;
    el.style.minHeight = 'max-content';
    el.style.height = 'max-content';
    el.style.overflow = 'visible';

    await new Promise(r => setTimeout(r, 150));

    const targetW = el.clientWidth || el.offsetWidth;
    const targetH = el.clientHeight || el.offsetHeight;

    const dataUrl = await toJpeg(el, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      quality: 0.95,
      pixelRatio,
      filter: printFilter,
      width: targetW,
      height: targetH,
      style: { boxShadow: 'none' }
    });

    el.style.transform = origT;
    el.style.margin = origM;
    el.style.transformOrigin = origTO;
    el.style.width = origW;
    el.style.minHeight = origH;
    el.style.overflow = origO;
    el.classList.remove('is-capturing');


    const img = new window.Image();
    const imgLoaded = new Promise(res => { img.onload = res; img.onerror = res; });
    img.src = dataUrl;
    await imgLoaded;

    const scale = usableWidthMm / img.naturalWidth;
    pdf.addImage(dataUrl, 'JPEG', marginMm, marginMm, usableWidthMm, img.naturalHeight * scale, undefined, 'FAST');
  }

  if (action === 'download') {
    pdf.save(fileName);
    return;
  } else if (action === 'blob') {
    return pdf.output('blob');
  }
}

/**
 * ✅ 핵심 인쇄 유틸리티: DOM 요소를 이미지로 캡처 후 팝업에서 인쇄
 */
export async function printAsImage(element, options = {}) {
  const {
    orientation = 'portrait',
    pixelRatio = 2,
    title = '문서 인쇄',
  } = options;

  if (!element) { alert('인쇄할 요소를 찾을 수 없습니다.'); return; }

  const isLandscape = orientation === 'landscape';
  const targetWidthMM = isLandscape ? A4.W_MM_LAND : A4.W_MM;

  // 1. 스타일 보정 및 캡처
  const origT = element.style.transform;
  const origM = element.style.margin;
  const origTO = element.style.transformOrigin;
  const origW = element.style.width;
  const origH = element.style.minHeight;
  const origO = element.style.overflow;

  // 캡처 전용 유틸리티 클래스 주입 (그림자 제거 등)
  element.classList.add('is-capturing');

  element.style.transform = 'scale(1)';
  element.style.margin = '0';
  element.style.border = 'none';
  element.style.boxShadow = 'none';
  element.style.outline = 'none';
  element.style.transformOrigin = 'top left';
  element.style.width = `${targetWidthMM}mm`;
  element.style.minHeight = 'max-content';
  element.style.height = 'max-content';
  element.style.overflow = 'visible';
  element.style.position = 'relative';

  await new Promise(r => setTimeout(r, 200));

  const targetW = element.clientWidth || element.offsetWidth;
  const targetH = element.clientHeight || element.offsetHeight;

  try {
    const dataUrl = await toPng(element, {
      cacheBust: true,
      backgroundColor: null,
      pixelRatio,
      filter: printFilter,
      width: targetW,
      height: targetH,
      style: { boxShadow: 'none' }
    });

    // 2. 팝업 창 인쇄 (이미지 로드 완료 보장)
    const printWin = window.open('', '_blank', 'width=900,height=1100');
    if (!printWin) { alert('팝업 차단을 해제해 주세요.'); return; }

    printWin.document.write(`<!DOCTYPE html>
  <html lang="ko">
  <head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; background: white; overflow: hidden; }
    img { 
      display: block; 
      width: 100%; 
      height: 100%; 
      object-fit: contain;
      page-break-inside: avoid;
    }
  </style>
  </head>
  <body>
  <img id="print-img" src="${dataUrl}" alt="인쇄 내용" />
  <script>
    const img = document.getElementById('print-img');
    function doPrint() {
      setTimeout(() => { window.print(); window.close(); }, 500);
    }
    if (img.complete) { doPrint(); } 
    else { img.onload = doPrint; img.onerror = () => window.close(); }
  </script>
  </body>
  </html>`);
    printWin.document.close();
  } finally {
    element.style.transform = origT;
    element.style.margin = origM;
    element.style.transformOrigin = origTO;
    element.style.width = origW;
    element.style.minHeight = origH;
    element.style.overflow = origO;
    element.classList.remove('is-capturing');
  }
}

/**
 * ✅ 다중 페이지 요소 배열을 이미지로 캡처 후 팝업에서 인쇄
 */
export async function printMultiPageAsImage(elements, options = {}) {
  const {
    orientation = 'portrait',
    pixelRatio = 2,
    title = '문서 인쇄',
  } = options;

  const validElements = elements.filter(Boolean);
  if (validElements.length === 0) { alert('인쇄할 내용이 없습니다.'); return; }

  const isLandscape = orientation === 'landscape';
  const targetWidthMM = isLandscape ? A4.W_MM_LAND : A4.W_MM;

  const dataUrls = await Promise.all(validElements.map(async el => {
    const origT = el.style.transform;
    const origM = el.style.margin;
    const origTO = el.style.transformOrigin;
    const origW = el.style.width;
    const origH = el.style.minHeight;
    const origO = el.style.overflow;

    el.style.transform = 'scale(1)';
    el.style.margin = '0';
    el.style.transformOrigin = 'top left';
    el.style.width = `${targetWidthMM}mm`;
    el.style.minHeight = 'auto';
    el.style.overflow = 'hidden';

    // 캡처 전용 유틸리티 클래스 주입 (그림자 제거 등)
    el.classList.add('is-capturing');

    await new Promise(r => setTimeout(r, 200));

    const targetW = el.clientWidth || el.offsetWidth;
    const targetH = el.clientHeight || el.offsetHeight;

    const url = await toPng(el, {
      cacheBust: true,
      backgroundColor: null,
      pixelRatio,
      filter: printFilter,
      width: targetW,
      height: targetH,
      style: { boxShadow: 'none' }
    });

    el.style.transform = origT;
    el.style.margin = origM;
    el.style.transformOrigin = origTO;
    el.style.width = origW;
    el.style.minHeight = origH;
    el.style.overflow = origO;
    el.classList.remove('is-capturing');

    return url;
  }));

  const imgTags = dataUrls.map((url, i) =>
    `<img class="page-img" src="${url}" alt="페이지 ${i+1}" />`
  ).join('\n');

  const printWin = window.open('', '_blank', 'width=900,height=1100');
  if (!printWin) { alert('팝업 차단을 해제해 주세요.'); return; }

  printWin.document.write(`<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8"><title>${title}</title>
<style>
  @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; background: white; }
  img { 
    display: block; 
    width: 100vw; 
    height: 100vh; 
    object-fit: contain; 
    page-break-after: always; 
    page-break-inside: avoid;
  }
</style>
</head>
<body>
${imgTags}
<script>
  const imgs = document.querySelectorAll('.page-img');
  let loadedCount = 0;
  function checkDone() {
    loadedCount++;
    if (loadedCount >= imgs.length) {
      setTimeout(() => { window.print(); window.close(); }, 500);
    }
  }
  if (imgs.length === 0) window.close();
  imgs.forEach(img => {
    if (img.complete) { checkDone(); }
    else { img.onload = checkDone; img.onerror = checkDone; }
  });
</script>
</body>
</html>`);
  printWin.document.close();
}
