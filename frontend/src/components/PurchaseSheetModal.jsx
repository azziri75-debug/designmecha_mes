import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download, FileText } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import { getImageUrl } from '../lib/utils';

/**
 * PurchaseSheetModal
 * - sheetType: 'estimate_request' (견적의뢰서) | 'purchase_order' (구매발주서)
 * - order: 구매 발주 데이터 (items, partner, order_no 등)
 */
const PurchaseSheetModal = ({ isOpen, onClose, order, sheetType = 'purchase_order', onSave }) => {
    const [company, setCompany] = useState(null);
    const [saving, setSaving] = useState(false);
    const [activeTab, setActiveTab] = useState(sheetType);

    const [metadata, setMetadata] = useState({
        // 견적의뢰서
        req_note: '아래 품목에 대한 제작 견적 의뢰합니다.',
        req_remark: '► 납기: 제작 기간 협의 요청\n► 납품장소: 당사 지정 장소\n► 세부내역 첨부 확인(도면 및 공정 등)\n► 지불조건: 당사 조건',
        // 구매발주서
        po_remark: '',
        po_delivery_date: '',
        po_delivery_place: '',
        po_valid_until: '',
        po_payment_terms: '납품 후 정기결제',
        show_stamp: true,
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen) {
            fetchCompany();
            setActiveTab(sheetType);
            initializeMetadata();
        }
    }, [isOpen, order, sheetType]);

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (err) {
            console.error('Failed to fetch company', err);
        }
    };

    const initializeMetadata = () => {
        if (!order) return;
        setMetadata(prev => ({
            ...prev,
            po_delivery_date: order.delivery_date || '',
            po_remark: buildDefaultPoRemark(order),
        }));
    };

    const buildDefaultPoRemark = (ord) => {
        const lines = [];
        // Build item-specific remarks from order items
        ord.items?.forEach(item => {
            if (item.note) lines.push(`• ${item.product?.name}: ${item.note}`);
        });
        if (lines.length === 0) return '';
        return lines.join('\n');
    };

    const handleMetaChange = (key, val) => setMetadata(prev => ({ ...prev, [key]: val }));

    const fmt = (n) => {
        if (n === null || n === undefined) return '';
        return Number(n).toLocaleString();
    };

    const today = new Date();
    const todayStr = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, '0')}월 ${String(today.getDate()).padStart(2, '0')}일`;
    const todayDot = `${today.getFullYear()}. ${String(today.getMonth() + 1).padStart(2, '0')}. ${String(today.getDate()).padStart(2, '0')}.`;

    // ─── PDF Generation ───────────────────────────────────────────
    const generatePDF = async (action = 'save') => {
        if (!sheetRef.current) return;
        setSaving(true);
        try {
            const canvas = await html2canvas(sheetRef.current, {
                scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff',
            });
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

            const docLabel = activeTab === 'estimate_request' ? '견적의뢰서' : '구매발주서';
            const fileName = `${docLabel}_${order.order_no}_${Date.now()}.pdf`;

            if (action === 'download') {
                pdf.save(fileName);
            } else {
                const blob = pdf.output('blob');
                const file = new File([blob], fileName, { type: 'application/pdf' });
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post('/upload', formData, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                });

                // Append to order's attachment_file
                let currentAttachments = [];
                try {
                    if (order.attachment_file) {
                        currentAttachments = typeof order.attachment_file === 'string'
                            ? JSON.parse(order.attachment_file) : order.attachment_file;
                        if (!Array.isArray(currentAttachments)) currentAttachments = [currentAttachments];
                    }
                } catch { currentAttachments = []; }

                const newAttachments = [...currentAttachments, { name: uploadRes.data.filename, url: uploadRes.data.url }];
                await api.put(`/purchasing/purchase/orders/${order.id}`, {
                    attachment_file: newAttachments,
                });

                alert(`${docLabel}가 저장되고 첨부되었습니다.`);
                if (onSave) onSave();
                onClose();
            }
        } catch (err) {
            console.error('PDF 생성 실패', err);
            alert('PDF 생성 실패: ' + (err.response?.data?.detail || err.message));
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen || !order) return null;

    const partner = order.partner || {};
    const items = order.items || [];
    const totalAmount = items.reduce((s, i) => s + (i.quantity || 0) * (i.unit_price || 0), 0);
    const EMPTY_ROWS = 8;

    // Stamp image helper
    const getStampUrl = () => {
        if (!company) return null;
        try {
            const stampData = company.stamp_image
                ? (typeof company.stamp_image === 'string' ? JSON.parse(company.stamp_image) : company.stamp_image)
                : null;
            if (stampData?.url) return getImageUrl(stampData.url);
            const logoData = company.logo_image
                ? (typeof company.logo_image === 'string' ? JSON.parse(company.logo_image) : company.logo_image)
                : null;
            if (logoData?.url) return getImageUrl(logoData.url);
        } catch { /* ignore */ }
        return null;
    };

    // ─── 견적의뢰서 ────────────────────────────────────────────────
    const renderEstimateRequest = () => (
        <div
            ref={sheetRef}
            className="bg-[#fff] text-[#000] w-[210mm] min-h-[297mm] p-[12mm] shadow-xl origin-top"
            style={{ fontFamily: '"Malgun Gothic", sans-serif', fontSize: '11px', lineHeight: '1.6' }}
        >
            {/* Title */}
            <div className="text-center mb-6">
                <h1 className="text-3xl font-bold tracking-[0.8em] indent-[0.8em] border-b-2 border-[#000] pb-2 inline-block">
                    견 적 의 뢰 서
                </h1>
            </div>

            {/* Date & Fax Row */}
            <div className="flex justify-between mb-4 text-xs">
                <div>
                    <p>{todayStr}</p>
                    <p>Fax : {partner.fax || company?.fax || ''}</p>
                </div>
            </div>

            {/* Recipient & Company Info */}
            <div className="flex justify-between items-start mb-4 gap-4">
                {/* Left: Recipient */}
                <div className="flex-1">
                    <p className="text-base font-bold mb-1">
                        ㈜{partner.name || '공급사명'}
                    </p>
                    <p className="text-base font-bold mb-2">
                        {partner.representative || '대표자'} 대표이사님 <span className="font-normal text-sm">貴下</span>
                    </p>
                </div>
                {/* Right: Company Table */}
                <div className="border-2 border-[#000] text-xs" style={{ width: '55%' }}>
                    <table className="w-full border-collapse">
                        <tbody>
                            <tr>
                                <td rowSpan="5" className="text-center align-middle font-bold border-r border-[#000] bg-[#f3f4f6] w-6 text-sm" style={{ writingMode: 'vertical-lr', letterSpacing: '3px' }}>공급자</td>
                                <td className="border-b border-[#ccc] px-2 py-1">
                                    <span className="text-[#888] w-14 inline-block">등록번호</span>
                                    <span className="font-bold ml-1">{company?.registration_number || ''}</span>
                                </td>
                            </tr>
                            <tr>
                                <td className="border-b border-[#ccc] px-2 py-1 flex justify-between items-center">
                                    <span><span className="text-[#888] w-14 inline-block">상 호</span> (주){company?.name || ''}</span>
                                    <span className="relative">
                                        <span className="text-[#888] w-10 inline-block">대표</span> {company?.representative || ''}
                                        {metadata.show_stamp && getStampUrl() && (
                                            <img crossOrigin="anonymous" src={getStampUrl()} alt="직인"
                                                className="absolute -top-3 -right-1 w-11 h-11 object-contain opacity-80 mix-blend-multiply" />
                                        )}
                                    </span>
                                </td>
                            </tr>
                            <tr>
                                <td className="border-b border-[#ccc] px-2 py-1">
                                    <span className="text-[#888] w-14 inline-block">사업장</span> {company?.address || ''}
                                </td>
                            </tr>
                            <tr>
                                <td className="border-b border-[#ccc] px-2 py-1">
                                    <span className="text-[#888] w-14 inline-block">소재지</span> {company?.homepage || 'www.designmecha.co.kr'}
                                </td>
                            </tr>
                            <tr>
                                <td className="px-2 py-1">
                                    <span className="text-[#888] w-14 inline-block">연락처</span>
                                    전화 {company?.phone || ''} 팩스 {company?.fax || ''}
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Note */}
            <div className="mb-4 text-sm">
                <textarea
                    value={metadata.req_note}
                    onChange={(e) => handleMetaChange('req_note', e.target.value)}
                    className="w-full outline-none bg-transparent resize-none"
                    rows={2}
                />
            </div>

            {/* Items Table */}
            <table className="w-full border-collapse border-2 border-[#000] text-xs mb-2">
                <thead>
                    <tr className="bg-[#f3f4f6] text-center font-bold">
                        <th className="border border-[#000] py-1.5 w-[25%]">품  명<br /><span className="font-normal text-[10px]">Description</span></th>
                        <th className="border border-[#000] py-1.5 w-[18%]">규  격<br /><span className="font-normal text-[10px]">Size</span></th>
                        <th className="border border-[#000] py-1.5 w-[6%]"><br /><span className="font-normal text-[10px]">unit</span></th>
                        <th className="border border-[#000] py-1.5 w-[8%]">수  량<br /><span className="font-normal text-[10px]">Quantity</span></th>
                        <th className="border border-[#000] py-1.5 w-[12%]">단  가<br /><span className="font-normal text-[10px]">Unit Price</span></th>
                        <th className="border border-[#000] py-1.5 w-[14%]">금  액<br /><span className="font-normal text-[10px]">Amount</span></th>
                        <th className="border border-[#000] py-1.5 w-[12%]">비  고<br /><span className="font-normal text-[10px]">Remark</span></th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => (
                        <tr key={idx} className="text-center">
                            <td className="border border-[#000] py-1 px-2 text-left">{item.product?.name || ''}</td>
                            <td className="border border-[#000] py-1">{item.product?.specification || ''}</td>
                            <td className="border border-[#000] py-1">{item.product?.unit || 'EA'}</td>
                            <td className="border border-[#000] py-1">{item.quantity}</td>
                            <td className="border border-[#000] py-1 text-right px-1">{fmt(item.unit_price)}</td>
                            <td className="border border-[#000] py-1 text-right px-1">{fmt((item.quantity || 0) * (item.unit_price || 0))}</td>
                            <td className="border border-[#000] py-1">{item.note || ''}</td>
                        </tr>
                    ))}
                    {items.length === 1 && (
                        <tr className="text-center">
                            <td className="border border-[#000] py-1 px-2 text-left">= 이하 여백 =</td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                        </tr>
                    )}
                    {/* Spacing rows */}
                    {Array.from({ length: Math.max(0, 6 - items.length) }).map((_, i) => (
                        <tr key={`e-${i}`} className="text-center text-transparent">
                            <td className="border border-[#000] py-3">.</td>
                            <td className="border border-[#000] py-3">.</td>
                            <td className="border border-[#000] py-3">.</td>
                            <td className="border border-[#000] py-3">.</td>
                            <td className="border border-[#000] py-3">.</td>
                            <td className="border border-[#000] py-3">.</td>
                            <td className="border border-[#000] py-3">.</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="font-bold text-center bg-[#f9fafb]">
                        <td colSpan="3" className="border border-[#000] py-1.5">합  계</td>
                        <td className="border border-[#000] py-1.5">{items.reduce((s, i) => s + (i.quantity || 0), 0)}</td>
                        <td className="border border-[#000] py-1.5"></td>
                        <td className="border border-[#000] py-1.5 text-right px-1">합  계</td>
                        <td className="border border-[#000] py-1.5"></td>
                    </tr>
                </tfoot>
            </table>

            {/* 특기사항 */}
            <div className="mt-4 text-xs">
                <div className="flex items-start gap-4">
                    <span className="font-bold whitespace-nowrap mt-1">특기사항</span>
                    <textarea
                        value={metadata.req_remark}
                        onChange={(e) => handleMetaChange('req_remark', e.target.value)}
                        className="flex-1 outline-none bg-transparent resize-none text-xs leading-relaxed"
                        rows={4}
                    />
                    {/* 담당/본부장 */}
                    <div className="flex gap-0 border border-[#000] text-center text-xs shrink-0">
                        <div className="border-r border-[#000]">
                            <div className="border-b border-[#000] px-4 py-0.5 font-bold bg-[#f3f4f6]">담 당</div>
                            <div className="h-12"></div>
                        </div>
                        <div>
                            <div className="border-b border-[#000] px-4 py-0.5 font-bold bg-[#f3f4f6]">본부장</div>
                            <div className="h-12"></div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-6 text-center text-[10px] text-[#888]">
                - {company?.name ? `(주)${company.name}` : '(주)디자인메카'} -
            </div>
        </div>
    );

    // ─── 구매발주서 ─────────────────────────────────────────────────
    const renderPurchaseOrder = () => (
        <div
            ref={sheetRef}
            className="bg-[#fff] text-[#000] w-[210mm] min-h-[297mm] p-[12mm] shadow-xl origin-top"
            style={{ fontFamily: '"Malgun Gothic", sans-serif', fontSize: '11px', lineHeight: '1.6' }}
        >
            {/* Title + Approval */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h1 className="text-3xl font-bold tracking-[0.5em] indent-[0.5em] border-b-4 border-[#000] pb-2">
                        구 매 발 주 서
                    </h1>
                </div>
                {/* Approval Box */}
                <table className="border-2 border-[#000] text-xs text-center" style={{ width: '160px' }}>
                    <thead>
                        <tr>
                            <th className="border border-[#000] bg-[#f3f4f6] px-2 py-0.5" style={{ width: '33%' }}>신청</th>
                            <th className="border border-[#000] bg-[#f3f4f6] px-2 py-0.5" style={{ width: '33%' }}>담당</th>
                            <th className="border border-[#000] bg-[#f3f4f6] px-2 py-0.5" style={{ width: '34%' }}>대표</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr><td className="border border-[#000] h-5"></td><td className="border border-[#000]"></td><td className="border border-[#000]"></td></tr>
                        <tr><td className="border border-[#000] py-0.5 bg-[#f3f4f6]">부서</td><td className="border border-[#000]" colSpan="2"></td></tr>
                        <tr><td className="border border-[#000] py-0.5 bg-[#f3f4f6]">결재</td><td className="border border-[#000]" colSpan="2"></td></tr>
                    </tbody>
                </table>
            </div>

            {/* Order Number */}
            <div className="mb-4 text-sm">
                <p className="font-bold">구매발주번호 : <span className="underline">{order.order_no}</span></p>
            </div>

            {/* Supplier + Our Company */}
            <div className="flex justify-between items-start mb-6 gap-6">
                {/* Left: Supplier Info */}
                <div className="text-xs space-y-1 flex-1">
                    <p className="font-bold text-sm">㈜{partner.name || ''} <span className="font-normal">귀하</span></p>
                    <p>TEL : {partner.phone || ''}</p>
                    <p>FAX : {partner.fax || ''}</p>
                    <p className="mt-2">Date {todayDot}</p>
                </div>
                {/* Right: Our Company */}
                <div className="text-xs text-right space-y-0.5">
                    <p className="text-lg font-bold">(주){company?.name || '디자인메카'}</p>
                    <p className="text-[10px] uppercase tracking-wider text-[#888]">DESIGNMECHA CO., LTD</p>
                    <p>주소 : {company?.address || ''}</p>
                    <p>{company?.business_type || '생산시스템기술연구소'} 내</p>
                    <p>TEL : {company?.phone || ''}  FAX : {company?.fax || ''}</p>
                </div>
            </div>

            {/* Items Table */}
            <table className="w-full border-collapse border-2 border-[#000] text-xs mb-2">
                <thead>
                    <tr className="bg-[#f3f4f6] text-center font-bold">
                        <th className="border border-[#000] py-1.5 w-[6%]">순 위<br /><span className="font-normal text-[10px]">ORDER</span></th>
                        <th className="border border-[#000] py-1.5 w-[25%]">품  목<br /><span className="font-normal text-[10px]">DESCRIPTION</span></th>
                        <th className="border border-[#000] py-1.5 w-[18%]">규  격<br /><span className="font-normal text-[10px]">GAUGE</span></th>
                        <th className="border border-[#000] py-1.5 w-[8%]">수  량<br /><span className="font-normal text-[10px]">QUANTITY</span></th>
                        <th className="border border-[#000] py-1.5 w-[15%]">단  가<br /><span className="font-normal text-[10px]">UNIT PRICE</span></th>
                        <th className="border border-[#000] py-1.5 w-[18%]">금  액<br /><span className="font-normal text-[10px]">TOTAL AMOUNT</span></th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => (
                        <tr key={idx} className="text-center">
                            <td className="border border-[#000] py-1">{idx + 1}</td>
                            <td className="border border-[#000] py-1 px-2 text-left">{item.product?.name || ''}</td>
                            <td className="border border-[#000] py-1">{item.product?.specification || ''}</td>
                            <td className="border border-[#000] py-1">{item.quantity}</td>
                            <td className="border border-[#000] py-1 text-right px-2">{fmt(item.unit_price)} <span className="text-[10px]">원</span></td>
                            <td className="border border-[#000] py-1 text-right px-2">{fmt((item.quantity || 0) * (item.unit_price || 0))} <span className="text-[10px]">원</span></td>
                        </tr>
                    ))}
                    {items.length === 1 && (
                        <tr className="text-center">
                            <td className="border border-[#000] py-1">2</td>
                            <td className="border border-[#000] py-1 px-2 text-left">- 이하여백 -</td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                        </tr>
                    )}
                    {Array.from({ length: Math.max(0, EMPTY_ROWS - items.length - (items.length === 1 ? 1 : 0)) }).map((_, i) => (
                        <tr key={`e-${i}`} className="text-center">
                            <td className="border border-[#000] py-1 text-[#ccc]">{items.length + (items.length === 1 ? 2 : 1) + i}</td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                            <td className="border border-[#000] py-1"></td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="font-bold text-center">
                        <td colSpan="4" className="border border-[#000] py-1.5">합계 (VAT별도)</td>
                        <td colSpan="2" className="border border-[#000] py-1.5 text-right px-2">{fmt(totalAmount)} <span className="text-[10px]">원</span></td>
                    </tr>
                </tfoot>
            </table>

            {/* 특기 사항 */}
            <div className="border-t-2 border-[#000] pt-2 mb-4">
                <p className="font-bold text-xs mb-1 underline">특기 사항</p>
                <textarea
                    value={metadata.po_remark}
                    onChange={(e) => handleMetaChange('po_remark', e.target.value)}
                    className="w-full outline-none bg-transparent resize-none text-xs leading-relaxed"
                    rows={4}
                    placeholder="특기사항을 입력하세요..."
                />
            </div>

            {/* 납품조건 + 발주 확인 */}
            <div className="flex justify-between items-start gap-4 text-xs">
                {/* Left: 납품조건 */}
                <div className="flex-1">
                    <table className="text-xs">
                        <tbody>
                            <tr className="align-top">
                                <td rowSpan="4" className="font-bold pr-2 text-sm align-middle" style={{ writingMode: 'vertical-lr', letterSpacing: '4px' }}>납품조건</td>
                                <td className="py-0.5">◆ 납품기일 :
                                    <input value={metadata.po_delivery_date} onChange={(e) => handleMetaChange('po_delivery_date', e.target.value)}
                                        className="ml-1 outline-none border-b border-dotted border-[#999] bg-transparent w-36"
                                        placeholder="YYYY/MM/DD 이내"
                                    />
                                </td>
                            </tr>
                            <tr>
                                <td className="py-0.5">◆ 납품장소 :
                                    <input value={metadata.po_delivery_place} onChange={(e) => handleMetaChange('po_delivery_place', e.target.value)}
                                        className="ml-1 outline-none border-b border-dotted border-[#999] bg-transparent w-36"
                                        placeholder="㈜디자인메카"
                                    />
                                </td>
                            </tr>
                            <tr>
                                <td className="py-0.5">◆ 유효기간 :
                                    <input value={metadata.po_valid_until} onChange={(e) => handleMetaChange('po_valid_until', e.target.value)}
                                        className="ml-1 outline-none border-b border-dotted border-[#999] bg-transparent w-36"
                                        placeholder={todayDot}
                                    />
                                </td>
                            </tr>
                            <tr>
                                <td className="py-0.5">◆ 결제조건 :
                                    <input value={metadata.po_payment_terms} onChange={(e) => handleMetaChange('po_payment_terms', e.target.value)}
                                        className="ml-1 outline-none border-b border-dotted border-[#999] bg-transparent w-36"
                                    />
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Right: 발주 확인 */}
                <div className="text-right space-y-1">
                    <p className="text-base font-bold">위와 같이 발주합니다.</p>
                    <p className="text-sm relative inline-block">
                        (주){company?.name || '디자인메카'} <span className="ml-2">(인)</span>
                        {metadata.show_stamp && getStampUrl() && (
                            <img crossOrigin="anonymous" src={getStampUrl()} alt="직인"
                                className="absolute -top-3 right-0 w-12 h-12 object-contain opacity-80 mix-blend-multiply" />
                        )}
                    </p>
                </div>
            </div>

            {/* Footer */}
            <div className="mt-8 text-center text-[10px] text-[#888]">
                (주){company?.name || '디자인메카'}
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-700">
                    <div className="flex items-center gap-4">
                        <FileText className="w-5 h-5 text-blue-500" />
                        <div className="flex bg-gray-800 rounded-lg p-0.5 gap-0.5">
                            <button
                                onClick={() => setActiveTab('estimate_request')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'estimate_request' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                견적의뢰서
                            </button>
                            <button
                                onClick={() => setActiveTab('purchase_order')}
                                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${activeTab === 'purchase_order' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
                            >
                                구매발주서
                            </button>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => generatePDF('download')}
                            disabled={saving}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors"
                        >
                            <Download className="w-4 h-4" />
                            다운로드
                        </button>
                        <button
                            onClick={() => generatePDF('save')}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-blue-900/20"
                        >
                            <Save className="w-4 h-4" />
                            {saving ? '저장 중...' : 'PDF 저장 및 첨부'}
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white p-2">
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Toolbar */}
                <div className="p-3 bg-gray-800 border-b border-gray-700 flex gap-4 text-sm">
                    <label className="flex items-center gap-2 text-gray-300">
                        <input
                            type="checkbox"
                            checked={metadata.show_stamp}
                            onChange={(e) => handleMetaChange('show_stamp', e.target.checked)}
                            className="rounded border-gray-600 bg-gray-700"
                        />
                        직인 표시
                    </label>
                    <span className="text-gray-500">|</span>
                    <span className="text-gray-400">발주번호: <span className="text-white font-mono">{order.order_no}</span></span>
                    <span className="text-gray-400">공급사: <span className="text-white">{partner.name || '-'}</span></span>
                </div>

                {/* Preview */}
                <div className="flex-1 overflow-auto bg-[#e5e7eb] p-8 flex justify-center">
                    {activeTab === 'estimate_request' ? renderEstimateRequest() : renderPurchaseOrder()}
                </div>
            </div>
        </div>
    );
};

export default PurchaseSheetModal;
