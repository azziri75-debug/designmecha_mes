import React, { useEffect, useState, useRef } from 'react';
import { X, Save, Download, Edit2, FileSpreadsheet } from 'lucide-react';
import { toPng } from 'html-to-image';
import { printAsImage, generateA4PDF } from '../lib/printUtils';
import jsPDF from 'jspdf';
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
        title: "구 매 발 주 서",
        note: "위와 같이 발주합니다.",
        special_notes: "* 사량나이프 제작시 열처리에 주의하여 주시기 바랍니다.\n* 연마시 표면에 떨림 현상이 생기지 않도록 주의바랍니다.\n* 담당 : 류형룡 부장 (010-2850-8369)\n* 첨부 도면 1부.",
        delivery_date: "",
        delivery_place: "(주)디자인메카",
        valid_until: "",
        payment_terms: "납품 후 정기결제",
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
                note: "위와 같이 발주합니다.",
                special_notes: order.note || "",
                delivery_date: order.delivery_date || "",
                delivery_place: "(주)디자인메카",
                valid_until: "",
                payment_terms: "납품 후 정기결제",
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
        await printAsImage(sheetRef.current, { title: '구매발주서', orientation: 'portrait' });
    };

    const generatePDF = async (action = 'save') => {
        if (!sheetRef.current) return;
        setSaving(true);
        try {
            const fileName = purchase_order__.pdf;
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
                a.href = url;
                a.download = fileName;
                a.click();
            } else {
                const file = new File([blob], fileName, { type: 'application/pdf' });
                const formData = new FormData();
                formData.append('file', file);
                const uploadRes = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });

                let currentAttachments = [];
                try { if (plan.attachment_file) currentAttachments = typeof plan.attachment_file === 'string' ? JSON.parse(plan.attachment_file) : plan.attachment_file; } catch { currentAttachments = []; }
                const newAttachments = [...(Array.isArray(currentAttachments) ? currentAttachments : []), { name: uploadRes.data.filename, url: uploadRes.data.url }];

                await api.put(/purchasing/purchase/orders/, { attachment_file: newAttachments });
                alert('저장 및 첨부되었습니다.');
                if (onSave) onSave();
                onClose();
            }
        } catch (err) {
            console.error(err);
            alert('PDF 생성 실패: ' + err.message);
        } finally { setSaving(false); }
    };
