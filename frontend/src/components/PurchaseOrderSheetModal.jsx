import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download, Edit2, FileSpreadsheet, Printer } from 'lucide-react';
import { toPng } from 'html-to-image';
import { printAsImage, generateA4PDF } from '../lib/printUtils';
import jsPDF from 'jspdf';
import PurchaseOrderTemplate from './PurchaseOrderTemplate';
import api from '../lib/api';
import { getImageUrl, safeParseJSON } from '../lib/utils';
import ApprovalGrid from './ApprovalGrid';
import { useAuth } from '../contexts/AuthContext';

const PurchaseOrderSheetModal = ({ isOpen, onClose, order, onSave }) => {
    const [company, setCompany] = useState(null);
    const [template, setTemplate] = useState(null);
    const [saving, setSaving] = useState(false);
    const [approvalDoc, setApprovalDoc] = useState(null);
    const { currentUser } = useAuth();

    // Editable State (Metadata)
    const [metadata, setMetadata] = useState({
        title: "구 매 발 주 서",
        note: "아래와 같이 발주합니다.",
        special_notes: "* 납기일자와 납품처 일정을 상호협의하여 주시기 바랍니다.\n* 가공부위 표면에 찍힘 현상이 발생하지 않도록 주의바랍니다.\n* 담당 : 생산관리 조인호 (010-2850-8369)\n* 첨부 파일 1부.",
        delivery_date: "",
        delivery_place: "(주)디자인메카",
        valid_until: "",
        payment_terms: "물품 수령 후 90일 결제",
    });

    const sheetRef = useRef(null);

    useEffect(() => {
        if (isOpen && order) {
            fetchCompany();
            fetchTemplate();
            initializeData();
            fetchApprovalDoc();
        }
    }, [isOpen, order]);

    const fetchApprovalDoc = async () => {
        try {
            const res = await api.get('/approval/documents', { 
                params: { reference_id: order.id, reference_type: 'PURCHASE' } 
            });
            if (res.data && res.data.length > 0) {
                setApprovalDoc(res.data[0]);
            } else {
                setApprovalDoc(null);
            }
        } catch (err) {
            console.error('Failed to fetch approval doc', err);
        }
    };

    const fetchCompany = async () => {
        try {
            const res = await api.get('/basics/company');
            setCompany(res.data);
        } catch (error) { console.error("Failed to fetch company info", error); }
    };

    const fetchTemplate = async () => {
        try {
            const res = await api.get('/basics/form-templates/');
            const poTemplate = res.data.find(t => t.form_type === 'PURCHASE');
            if (poTemplate) setTemplate(poTemplate);
        } catch (error) { console.error("Failed to fetch template", error); }
    };

    const initializeData = () => {
        if (order) {
            let initialMetadata = {
                title: "구 매 발 주 서",
                note: "아래와 같이 발주합니다.",
                special_notes: order.note || "",
                delivery_date: order.delivery_date || "",
                delivery_place: "(주)디자인메카",
                valid_until: "",
                payment_terms: "물품 수령 후 90일 결제",
            };
            if (order.sheet_metadata) {
            const savedMeta = safeParseJSON(order.sheet_metadata, {});
            initialMetadata = { ...initialMetadata, ...savedMeta };
            }
            setMetadata(initialMetadata);
        }
    };

    const handleMetadataChange = (key, value) => {
        setMetadata(prev => ({ ...prev, [key]: value }));
    };

    const handlePrintWindow = async () => {
        await printAsImage(sheetRef.current, { title: '구매발주서', orientation: 'portrait' });
    };

    const generatePDF = async (action = 'save') => {
        if (!sheetRef.current) return;
        setSaving(true);
        try {
            const vendorName = order.vendor?.name || '공급사';
            const items = order.items || [];
            const firstItemName = items[0]?.product?.name || '품명';
            const extraCount = items.length > 1 ? ` 외 ${items.length - 1}건` : '';
            const date = order.order_date || '날짜';
            const fileName = `구매발주서-${vendorName}-${firstItemName}${extraCount}-${date}.pdf`;
            const blob = await generateA4PDF(sheetRef.current, {
                fileName,
                orientation: 'portrait',
                action: 'blob',
                pixelRatio: 3,
                multiPage: true
            });

            if (action === 'download') {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url; a.download = fileName; a.click();
            } else {
                const file = new File([blob], fileName, { type: 'application/pdf' });
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

                const currentAttachments = safeParseJSON(order.attachment_file, []);
                const newAttachments = [...currentAttachments, { name: uploadRes.data.filename, url: uploadRes.data.url }];

                await api.put(`/purchasing/purchase/orders/${order.id}`, { attachment_file: newAttachments });
                alert('파일이 전송 및 첨부되었습니다.');
                if (onSave) onSave();
                onClose();
            }
        } catch (err) {
            console.error(err);
            alert('PDF 생성 실패: ' + err.message);
        } finally { setSaving(false); }
    };

    if (!isOpen || !order) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto no-print">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                    <h2 className="text-xl font-bold text-white">구매발주서 창</h2>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handlePrintWindow}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2"
                        >
                            <Printer className="w-4 h-4" /> 인쇄</button>
                        <button
                            onClick={() => generatePDF('save')}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg"
                        >
                            {saving ? '처리 중...' : 'PDF 저장 및 첨부'}
                        </button>

                        {/* [MOD] 결재요청 button moved from template to header to avoid print inclusion */}
                        {(!approvalDoc || approvalDoc.status !== 'APPROVED') && (
                            <button
                                onClick={async () => {
                                    if (!order?.id) return;
                                    if (!window.confirm("이 내용으로 전자결재 [결재요청]을 진행하시겠습니까?")) return;
                                    setSaving(true);
                                    try {
                                        const firstItemProcess = order.items?.[0]?.product?.name || '구매자재';
                                        const customerName = '재고용';
                                        const partnerName = order.vendor?.name || '공급사미지정';

                                        const approvalPayload = {
                                            title: `(${partnerName}) - ${firstItemProcess} - ${customerName}`,
                                            doc_type: 'PURCHASE_ORDER',
                                            content: {
                                                order_no: metadata.order_no,
                                                partner_name: order.vendor?.name,
                                                order_date: order.order_date,
                                                delivery_date: metadata.delivery_date,
                                                special_notes: metadata.special_notes,
                                                items: (order.items || []).map((item, idx) => ({
                                                    idx: idx + 1,
                                                    name: item.product?.name,
                                                    spec: item.product?.specification,
                                                    qty: item.quantity,
                                                    price: item.unit_price,
                                                    total: (item.quantity || 0) * (item.unit_price || 0)
                                                }))
                                            },
                                            attachment_file: [],
                                            reference_id: order.id,
                                            reference_type: 'PURCHASE'
                                        };
                                        
                                        await api.post('/approval/documents', approvalPayload);
                                        alert("결재 요청이 상신되었습니다.");
                                        fetchApprovalDoc();
                                    } catch (err) {
                                        console.error("Failed to submit approval", err);
                                        alert("결재 요청 중 오류가 발생했습니다.");
                                    } finally {
                                        setSaving(false);
                                    }
                                }}
                                disabled={saving}
                                className="bg-orange-600 hover:bg-orange-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" /> 결재요청
                            </button>
                        )}

                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white p-2 transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-auto bg-[#525659] p-8 flex justify-center">
                    <div ref={sheetRef} className="bg-white shadow-2xl">
                        <PurchaseOrderTemplate
                            data={metadata}
                            onChange={handleMetadataChange}
                            isReadOnly={true}
                            documentData={approvalDoc}
                            currentUser={currentUser}
                            company={company}
                            orderId={order.id}
                            purchaseType="PURCHASE"
                            docType="PURCHASE_ORDER"
                            onSubmitApproval={fetchApprovalDoc}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PurchaseOrderSheetModal;
