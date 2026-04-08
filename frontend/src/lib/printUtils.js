/**
 * printUtils.js - True A4 WYSIWYG 인쇄 유틸리티
 * 
 * 화면상의 문서가 이미 210mm x 297mm 규격을 유지하고 있으므로,
 * 인쇄 시에는 레이아웃을 변형하지 않고 원본 그대로 캡처합니다.
 */
import { toPng, toJpeg } from 'html-to-image';
import { jsPDF } from 'jspdf';

export const A4 = {
  W_MM: 210,
  H_MM: 297,
  W_MM_LAND: 297,
  H_MM_LAND: 210,
};

/**
 * html2canvas/html-to-image 호환성을 위한 DOM 필터 및 전처리
 */
const printFilter = (node) => {
  if (node.classList && (node.classList.contains('no-print') || node.classList.contains('idf-no-print'))) {
    return false;
  }
  // 캡처 품질을 위해 일부 UI 스타일 조정
  try {
    if (node.style) {
      if (node.style.color?.includes('oklch')) node.style.color = '#000000';
      if (node.style.backgroundColor?.includes('oklch')) node.style.backgroundColor = '#ffffff';
      if (node.style.borderColor?.includes('oklch')) node.style.borderColor = '#d1d5db';
      
      // 용지 외곽선 및 그림자 제거 (인쇄용 클린 이미지 보장)
      if (node.classList && (node.classList.contains('a4-paper-root') || node.classList.contains('a4-wrapper'))) {
        node.style.boxShadow = 'none';
        node.style.border = 'none';
      }
    }
  } catch (_) {}
  return true;
};

/**
 * HTML 요소를 A4 PDF로 저장 (Blob 지원)
 */
export async function generateA4PDF(element, options = {}) {
  const {
    fileName = `document_${Date.now()}.pdf`,
    orientation = 'portrait',
    action = 'download',
    pixelRatio = 2,
    marginMm = 0,
    multiPage = false,
  } = options;

  if (!element) return;

  const isLandscape = orientation === 'landscape';
  
  // 1. 캡처 모드 활성화 (UI 보정용 클래스)
  element.classList.add('is-capturing');
  const origShadow = element.style.boxShadow;
  element.style.boxShadow = 'none';

  try {
    // 2. 캡처 대기 (Reflow)
    await new Promise(r => setTimeout(r, 200));

    // A4 규격 픽셀 계산 (96 DPI 기준)
    const wPx = element.clientWidth || element.offsetWidth;
    const hPx = element.clientHeight || element.offsetHeight;

    const dataUrl = await toPng(element, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      pixelRatio,
      filter: printFilter,
      width: wPx,
      height: hPx,
      style: { boxShadow: 'none', transform: 'none' }
    });

    // 3. PDF 구성
    const pdf = new jsPDF({
      orientation: isLandscape ? 'landscape' : 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true,
    });

    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    
    // 이미지가 이미 15mm 여백을 포함하고 있으므로 PDF 레벨 마진은 0을 기본으로 함
    const actualMargin = options.marginMm !== undefined ? options.marginMm : 0;
    const usableW = pdfW - actualMargin * 2;
    const usableH = pdfH - actualMargin * 2;

    const scale = usableW / wPx;
    const imgH_mm = hPx * scale;

    // 단일 페이지 vs 다중 페이지
    if (multiPage && imgH_mm > usableH * 1.05) {
      const img = new window.Image();
      const imgLoaded = new Promise(res => { img.onload = res; img.onerror = res; });
      img.src = dataUrl;
      await imgLoaded;

      const pageImgH_px = usableH / scale;
      let yOffset = 0;
      let pageNum = 0;

      while (yOffset < hPx) {
        if (pageNum > 0) pdf.addPage();
        const canvas = document.createElement('canvas');
        const sliceH = Math.min(pageImgH_px, hPx - yOffset);
        canvas.width = wPx;
        canvas.height = sliceH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, -yOffset, wPx, hPx);
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', actualMargin, actualMargin, wPx * scale, sliceH * scale, undefined, 'FAST');
        yOffset += pageImgH_px;
        pageNum++;
      }
    } else {
      pdf.addImage(dataUrl, 'PNG', actualMargin, actualMargin, usableW, imgH_mm, undefined, 'FAST');
    }

    if (action === 'download') {
      pdf.save(fileName);
    } else {
      return pdf.output('blob');
    }
  } finally {
    element.style.boxShadow = origShadow;
    element.classList.remove('is-capturing');
  }
}

/**
 * 핵심 인쇄 유틸리티: 요소를 이미지로 캡처하여 출력
 */
export async function printAsImage(element, options = {}) {
  const {
    orientation = 'portrait',
    pixelRatio = 2,
    title = '문서 인쇄',
  } = options;

  if (!element) { alert('인쇄할 내용을 찾을 수 없습니다.'); return; }

  const isLandscape = orientation === 'landscape';

  // 1. 캡처 모드 및 스타일 정리
  element.classList.add('is-capturing');
  const origShadow = element.style.boxShadow;
  element.style.boxShadow = 'none';

  try {
    await new Promise(r => setTimeout(r, 200));

    const wPx = element.clientWidth || element.offsetWidth;
    const hPx = element.clientHeight || element.offsetHeight;

    const dataUrl = await toPng(element, {
      cacheBust: true,
      backgroundColor: '#ffffff',
      pixelRatio,
      filter: printFilter,
      width: wPx,
      height: hPx,
      style: { boxShadow: 'none', transform: 'none' }
    });

    // 2. 팝업 인쇄 대행
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
          img { display: block; width: 210mm !important; height: ${isLandscape ? 'auto' : '297mm !important'}; margin: 0 auto; }
        </style>
      </head>
      <body>
        <img id="print-img" src="${dataUrl}" alt="Print Content" />
        <script>
          const img = document.getElementById('print-img');
          function doPrint() { setTimeout(() => { window.print(); window.close(); }, 500); }
          if (img.complete) doPrint(); else img.onload = doPrint;
        </script>
      </body>
      </html>`);
    printWin.document.close();
  } finally {
    element.style.boxShadow = origShadow;
    element.classList.remove('is-capturing');
  }
}

/**
 * 다중 요소를 하나의 PDF로 병합하여 생성 (Blob 또는 다운로드)
 */
export async function generateMultiPageA4PDF(elements, options = {}) {
  const {
    fileName = `document_${Date.now()}.pdf`,
    orientation = 'portrait',
    action = 'download',
    pixelRatio = 2,
    marginMm = 0,
  } = options;

  const validElements = (elements || []).filter(Boolean);
  if (validElements.length === 0) return null;

  const isLandscape = orientation === 'landscape';
  
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pdfW = pdf.internal.pageSize.getWidth();
  const actualMargin = options.marginMm !== undefined ? options.marginMm : 0;
  const usableW = pdfW - actualMargin * 2;

  try {
    for (let i = 0; i < validElements.length; i++) {
      const el = validElements[i];
      if (i > 0) pdf.addPage();

      el.classList.add('is-capturing');
      const origShadow = el.style.boxShadow;
      el.style.boxShadow = 'none';

      await new Promise(r => setTimeout(r, 150));
      const wPx = el.clientWidth || el.offsetWidth;
      const hPx = el.clientHeight || el.offsetHeight;

      const dataUrl = await toPng(el, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio,
        filter: printFilter,
        width: wPx,
        height: hPx,
        style: { boxShadow: 'none', transform: 'none' }
      });

      const scale = usableW / wPx;
      pdf.addImage(dataUrl, 'PNG', actualMargin, actualMargin, usableW, hPx * scale, undefined, 'FAST');

      el.style.boxShadow = origShadow;
      el.classList.remove('is-capturing');
    }

    if (action === 'download') {
      pdf.save(fileName);
      return;
    } else {
      return pdf.output('blob');
    }
  } catch (error) {
    console.error('MultiPDF generation failed:', error);
    return null;
  }
}

/**
 * 여러 요소를 각각의 페이지로 인쇄
 */
export async function printMultiPageAsImage(elements, options = {}) {
  const {
    orientation = 'portrait',
    pixelRatio = 2,
    title = '문서 인쇄',
  } = options;

  const validElements = elements.filter(Boolean);
  if (validElements.length === 0) return;

  const isLandscape = orientation === 'landscape';

  try {
    const dataUrls = await Promise.all(validElements.map(async el => {
      el.classList.add('is-capturing');
      const origShadow = el.style.boxShadow;
      el.style.boxShadow = 'none';
      
      await new Promise(r => setTimeout(r, 150));
      const wPx = el.clientWidth || el.offsetWidth;
      const hPx = el.clientHeight || el.offsetHeight;

      const url = await toPng(el, {
        cacheBust: true,
        backgroundColor: '#ffffff',
        pixelRatio,
        filter: printFilter,
        width: wPx,
        height: hPx,
        style: { boxShadow: 'none', transform: 'none' }
      });

      el.style.boxShadow = origShadow;
      el.classList.remove('is-capturing');
      return url;
    }));

    const imgTags = dataUrls.map(url => `<img class="page-img" src="${url}" />`).join('\n');

    const printWin = window.open('', '_blank', 'width=900,height=1100');
    if (!printWin) { alert('팝업 차단을 해제해 주세요.'); return; }

    printWin.document.write(`<!DOCTYPE html>
      <html lang="ko">
      <head>
        <meta charset="UTF-8"><title>${title}</title>
        <style>
          @page { size: A4 ${isLandscape ? 'landscape' : 'portrait'}; margin: 0; }
          * { margin: 0; padding: 0; }
          img { display: block; width: 210mm !important; height: 297mm !important; page-break-after: always; }
        </style>
      </head>
      <body>
        ${imgTags}
        <script>
          const imgs = document.querySelectorAll('.page-img');
          let count = 0;
          function check() { if (++count >= imgs.length) { setTimeout(() => { window.print(); window.close(); }, 500); } }
          imgs.forEach(i => i.complete ? check() : (i.onload = check));
        </script>
      </body>
      </html>`);
    printWin.document.close();
  } catch (error) {
    console.error('MultiPrint failed:', error);
  }
}
