import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download, Edit2, FileSpreadsheet } from 'lucide-react';
import { toPng } from 'html-to-image';
import { printAsImage, generateA4PDF } from '../lib/printUtils';
import jsPDF from 'jspdf';
import PurchaseOrderTemplate from './PurchaseOrderTemplate';
import api from '../lib/api';
import { getImageUrl } from '../lib/utils';
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
        title: "�� �� �� �� ��",
        note: "���� ���� �����մϴ�.",
        special_notes: "* �緮������ ���۽� ��ó���� �����Ͽ� �ֽñ� �ٶ��ϴ�.\n* ������ ǥ�鿡 ���� ������ ������ �ʵ��� ���ǹٶ��ϴ�.\n* ��� : ������ ���� (010-2850-8369)\n* ÷�� ���� 1��.",
        delivery_date: "",
        delivery_place: "(��)�����θ�ī",
        valid_until: "",
        payment_terms: "��ǰ �� �������",
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
                title: "�� �� �� �� ��",
                note: "���� ���� �����մϴ�.",
                special_notes: order.note || "",
                delivery_date: order.delivery_date || "",
                delivery_place: "(��)�����θ�ī",
                valid_until: "",
                payment_terms: "��ǰ �� �������",
            };
            if (order.sheet_metadata) {
                try {
                    const savedMeta = typeof order.sheet_metadata === 'string'
                        ? JSON.parse(order.sheet_metadata)
                        : order.sheet_metadata;
                    initialMetadata = { ...initialMetadata, ...savedMeta };
                } catch (e) { console.error("Failed to parse metadata", e); }
            }
            setMetadata(initialMetadata);
        }
    };

    const handleMetadataChange = (key, value) => {
        setMetadata(prev => ({ ...prev, [key]: value }));
    };

    const handlePrintWindow = async () => {
        await printAsImage(sheetRef.current, { title: '���Ź��ּ�', orientation: 'portrait' });
    };

        const generatePDF = async (action = 'save') => {
        if (!sheetRef.current) return;
        setSaving(true);
        try {
            const fileName = `purchase_order_${order.id}_${Date.now()}.pdf`;
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

                let currentAttachments = [];
                try { if (order.attachment_file) currentAttachments = typeof order.attachment_file === 'string' ? JSON.parse(order.attachment_file) : order.attachment_file; } catch { currentAttachments = []; }
                const newAttachments = [...(Array.isArray(currentAttachments) ? currentAttachments : []), { name: uploadRes.data.filename, url: uploadRes.data.url }];

                await api.put(`/purchasing/purchase/orders/${order.id}`, { attachment_file: newAttachments });
                alert('���� �� ÷�εǾ����ϴ�.');
                if (onSave) onSave();
                onClose();
            }
        } catch (err) {
            console.error(err);
            alert('PDF ���� ����: ' + err.message);
        } finally { setSaving(false); }
    };

    if (!isOpen || !order) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto no-print">
            <div className="bg-gray-900 w-full max-w-5xl rounded-xl shadow-2xl flex flex-col max-h-[95vh]">
                <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                    <h2 className="text-xl font-bold text-white">���Ź��ּ� ��</h2>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={handlePrintWindow}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" /> �μ�
                        </button>
                        <button
                            onClick={() => generatePDF('save')}
                            disabled={saving}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-lg"
                        >
                            {saving ? 'ó�� ��...' : 'PDF ���� �� ÷��'}
                        </button>
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
                            onSubmitApproval={fetchApprovalDoc}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PurchaseOrderSheetModal;
