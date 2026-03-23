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

  // 2. 요소를 PNG 이미지로 캡처 (스케일 보정 포함)
  const origTransform = element.style.transform;
  const origMargin = element.style.margin;
  const origTransformOrigin = element.style.transformOrigin;

  element.style.transform = 'scale(1)';
  element.style.margin = '0';
  element.style.transformOrigin = 'top left';

  // reflow 대기
  await new Promise(r => setTimeout(r, 100));

  const dataUrl = await toPng(element, {
    cacheBust: true,
    backgroundColor: '#ffffff',
    pixelRatio,
    filter: oklchFilter,
    width: element.scrollWidth,
    height: element.scrollHeight,
  });

  // 원복
  element.style.transform = origTransform;
  element.style.margin = origMargin;
  element.style.transformOrigin = origTransformOrigin;

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
 * ✅ 다중 요소를 하나의 PDF로 병합하여 생성
 * 생산관리시트처럼 여러 페이지(PageFrame)로 나뉜 경우 사용
 * 
 * @param {HTMLElement[]} elements - PDF로 합칠 요소 배열
 * @param {Object} options - generateA4PDF와 동일한 옵션
 * @returns {Promise<Blob|void>}
 */
export async function generateMultiPageA4PDF(elements, options = {}) {
  const {
    fileName = `document_${Date.now()}.pdf`,
    orientation = 'portrait',
    action = 'download',
    pixelRatio = 3,
    marginMm = 0,
  } = options;

  if (!elements || elements.length === 0) { alert('내용이 없습니다.'); return; }

  const isLandscape = orientation === 'landscape';
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidthMm = pdf.internal.pageSize.getWidth();
  const pageHeightMm = pdf.internal.pageSize.getHeight();
  const usableWidthMm = pageWidthMm - marginMm * 2;
  const usableHeightMm = pageHeightMm - marginMm * 2;

  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (!el) continue;
    if (i > 0) pdf.addPage();

    // 1. 이미지 로드 대기
    const images = el.querySelectorAll('img');
    await Promise.all(Array.from(images).map(img =>
      img.complete ? Promise.resolve()
      : new Promise(r => { img.onload = r; img.onerror = r; })
    ));

    // 2. 캡처
    const dataUrl = await toPng(el, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      pixelRatio,
      filter: oklchFilter,
    });

    const img = new window.Image();
    const imgLoaded = new Promise(res => { img.onload = res; });
    img.src = dataUrl;
    await imgLoaded;

    const scale = usableWidthMm / img.naturalWidth;
    const imgHMM = img.naturalHeight * scale;

    // A4 높이에 맞게 조절 (잘리지 않도록)
    const finalHMM = Math.min(imgHMM, usableHeightMm);
    pdf.addImage(dataUrl, 'PNG', marginMm, marginMm, usableWidthMm, finalHMM);
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
 * 
 * 이 방식은 React 번들 CSS를 팝업에서 로드할 필요가 없습니다.
 * 이미 렌더링된 요소를 PNG로 캡처하므로 CSS 의존성이 완전히 제거됩니다.
 * 
 * @param {HTMLElement} element - 캡처할 DOM 요소
 * @param {Object} options
 * @param {'portrait'|'landscape'} options.orientation - 용지 방향 (기본: portrait)
 * @param {number} options.pixelRatio - 캡처 해상도 (기본: 3)
 * @param {string} options.title - 팝업 창 제목
 */
export async function printAsImage(element, options = {}) {
  const {
    orientation = 'portrait',
    pixelRatio = 3,
    title = '문서 인쇄',
  } = options;

  if (!element) { alert('인쇄할 요소를 찾을 수 없습니다.'); return; }

  // 1. 이미지 로드 완료 대기
  const images = element.querySelectorAll('img');
  await Promise.all(Array.from(images).map(img =>
    img.complete ? Promise.resolve()
    : new Promise(r => { img.onload = r; img.onerror = r; })
  ));

  // 2. 요소를 PNG로 캡처 (스케일 보정 포함)
  const origTransform = element.style.transform;
  const origMargin = element.style.margin;
  const origTransformOrigin = element.style.transformOrigin;
  element.style.transform = 'scale(1)';
  element.style.margin = '0';
  element.style.transformOrigin = 'top left';
  await new Promise(r => setTimeout(r, 100));

  const dataUrl = await toPng(element, {
    cacheBust: true,
    backgroundColor: '#ffffff',
    pixelRatio,
    filter: oklchFilter,
    width: element.scrollWidth,
    height: element.scrollHeight,
  });

  // 원복
  element.style.transform = origTransform;
  element.style.margin = origMargin;
  element.style.transformOrigin = origTransformOrigin;

  // 3. 팝업 창에 이미지만 넣어 인쇄 (CSS 의존성 없음)
  const isLandscape = orientation === 'landscape';
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
  html, body { width: 100%; height: 100%; background: white; }
  img { display: block; width: 100%; height: auto; page-break-inside: avoid; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
<img src="${dataUrl}" alt="인쇄 내용" />
<script>
window.onload = function() {
  setTimeout(function() { window.print(); window.close(); }, 300);
};
</script>
</body>
</html>`);
  printWin.document.close();
}

/**
 * ✅ 다중 페이지 요소 배열을 이미지로 캡처 후 팝업에서 인쇄
 * 생산관리시트처럼 PageRef 배열이 있는 경우에 사용
 * 
 * @param {HTMLElement[]} elements - 캡처할 DOM 요소 배열 (각각 A4 1페이지)
 * @param {Object} options - printAsImage와 동일한 옵션
 */
export async function printMultiPageAsImage(elements, options = {}) {
  const {
    orientation = 'portrait',
    pixelRatio = 3,
    title = '문서 인쇄',
  } = options;

  if (!elements || elements.length === 0) { alert('인쇄할 내용이 없습니다.'); return; }

  // 모든 페이지 이미지 캡처
  const dataUrls = await Promise.all(elements.filter(Boolean).map(async el => {
    const imgs = el.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map(img =>
      img.complete ? Promise.resolve()
      : new Promise(r => { img.onload = r; img.onerror = r; })
    ));

    const origT = el.style.transform;
    const origM = el.style.margin;
    const origTO = el.style.transformOrigin;
    el.style.transform = 'scale(1)';
    el.style.margin = '0';
    el.style.transformOrigin = 'top left';
    await new Promise(r => setTimeout(r, 100));

    const url = await toPng(el, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      pixelRatio,
      filter: oklchFilter,
      width: el.scrollWidth,
      height: el.scrollHeight,
    });

    el.style.transform = origT;
    el.style.margin = origM;
    el.style.transformOrigin = origTO;
    return url;
  }));

  const isLandscape = orientation === 'landscape';
  const imgTags = dataUrls.map((url, i) =>
    `<img src="${url}" alt="페이지 ${i+1}" style="display:block;width:100%;height:auto;${i < dataUrls.length - 1 ? 'page-break-after:always;' : ''}" />`
  ).join('\n');

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
  html, body { width: 100%; background: white; }
  img { display: block; width: 100%; height: auto; }
  @media print { body { margin: 0; } }
</style>
</head>
<body>
${imgTags}
<script>
window.onload = function() {
  setTimeout(function() { window.print(); window.close(); }, 300);
};
</script>
</body>
</html>`);
  printWin.document.close();
}
