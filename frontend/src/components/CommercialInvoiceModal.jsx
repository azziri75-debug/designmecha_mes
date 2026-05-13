import React, { useState, useEffect, useRef } from 'react';
import { X, Save, Printer, FileDown, FileText } from 'lucide-react';
import api from '../lib/api';
import { getImageUrl } from '../lib/utils';
import CommercialInvoiceTemplate from './CommercialInvoiceTemplate';
import PackingListTemplate from './PackingListTemplate';

const SHIPPER_HISTORY_KEY = 'ci_shipper_history';
const NOTIFY_HISTORY_KEY = 'ci_field_history_notify';

const makeDefaultDoc = (order, invoiceNo, deliveryDate) => {
    const partner = order?.partner;
    const items = (order?.items || []).map(i => ({
        name: i.product?.name || i.product_name || '',
        hs_code: '',
        unit_price: i.unit_price ? String(i.unit_price) : '',
        qty: i.current_delivered_quantity ? String(i.current_delivered_quantity) : String(i.quantity || ''),
        unit: 'SET',
        n_wt: '',
        g_wt: '',
        cbm: '',
        amount: 0
    }));
    const today = deliveryDate || new Date().toISOString().split('T')[0];
    const dateLabel = new Date(today).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');
    return {
        invoice_no: invoiceNo || '',
        invoice_date: dateLabel,
        lc_no: '',
        consignee: partner?.name || '',
        notify: '',
        other_references: '',
        sailing_date: today,
        vessel_flight: '',
        from_port: 'BUSAN, KOREA',
        to_port: '',
        terms: '',
        shipping_marks: '',
        total_ctn: '1 CTN',
        items,
        shipper: {
            line1: 'DESIGNMECHA CO.,LTD.',
            line2: '336-35 Woram-ro, Eumbong-myeon',
            line3: 'ASAN CHUNGNAM, KOREA',
            line4: 'TEL : 82-41-544-6220. FAX : 82-41-544-6207'
        }
    };
};

const CommercialInvoiceModal = ({ open, onClose, order, deliveryId, deliveryDate, initialInvoiceNo, onSaved }) => {
    const [tab, setTab] = useState('ci');
    const [ciDoc, setCiDoc] = useState(null);
    const [plDoc, setPlDoc] = useState(null);
    const [isPrint, setIsPrint] = useState(false);
    const [loading, setLoading] = useState(false);
    const [ceoSignature, setCeoSignature] = useState(null);
    const [companyName, setCompanyName] = useState('Designmecha Co.,Ltd.');
    const [invoiceNo, setInvoiceNo] = useState(initialInvoiceNo || '');
    const printRef = useRef();

    // Load initial data
    useEffect(() => {
        if (!open) return;
        const init = async () => {
            // Load CEO signature
            try {
                const staffRes = await api.get('/basics/staff/');
                const ceo = (staffRes.data || []).find(s => s.role === '대표이사' || s.role === 'CEO');
                if (ceo?.stamp_image) setCeoSignature(ceo.stamp_image);
            } catch (e) { console.warn('CEO fetch failed', e); }

            // Load company info
            try {
                const compRes = await api.get('/basics/company/');
                const comp = Array.isArray(compRes.data) ? compRes.data[0] : compRes.data;
                if (comp?.name) setCompanyName(comp.name);
            } catch (e) { console.warn('Company fetch failed', e); }

            // Existing saved CI/PL data?
            if (deliveryId) {
                try {
                    const dhRes = await api.get(`/sales/orders/${order.id}/delivery`);
                    const dh = (dhRes.data || []).find(d => d.id === deliveryId);
                    if (dh?.statement_json?.ci) {
                        setCiDoc(dh.statement_json.ci);
                        setPlDoc(dh.statement_json.pl || dh.statement_json.ci);
                        if (dh.invoice_no) setInvoiceNo(dh.invoice_no);
                        return;
                    }
                } catch (e) { console.warn('Load delivery failed', e); }
            }

            // Generate fresh default
            const def = makeDefaultDoc(order, invoiceNo, deliveryDate);
            setCiDoc(def);
            setPlDoc({ ...def });
        };
        init();
    }, [open, deliveryId]);

    // Sync invoice_no into both docs
    useEffect(() => {
        if (!invoiceNo) return;
        if (ciDoc) setCiDoc(prev => ({ ...prev, invoice_no: invoiceNo }));
        if (plDoc) setPlDoc(prev => ({ ...prev, invoice_no: invoiceNo }));
    }, [invoiceNo]);

    const handleSave = async () => {
        setLoading(true);
        try {
            await api.put(`/sales/orders/${order.id}/delivery/${deliveryId}`, {
                statement_json: { ci: ciDoc, pl: plDoc },
                invoice_no: invoiceNo
            });
            alert('저장되었습니다.');
            if (onSaved) onSaved();
        } catch (e) {
            alert('저장 실패: ' + (e.response?.data?.detail || e.message));
        } finally { setLoading(false); }
    };

    const handlePrint = () => {
        setIsPrint(true);
        setTimeout(() => {
            window.print();
            setIsPrint(false);
        }, 300);
    };

    if (!open || !ciDoc) return null;

    const sharedProps = { isPrint, ceoSignature, companyName };

    return (
        <>
            {/* Print-only styles */}
            <style>{`
                @media print {
                    body > *:not(#ci-print-root) { display: none !important; }
                    #ci-print-root { display: block !important; position: static !important; }
                    .ci-modal-bg, .ci-toolbar { display: none !important; }
                    .ci-print-area { box-shadow: none !important; padding: 10mm !important; }
                    @page { size: A4; margin: 10mm; }
                }
            `}</style>

            <div className="ci-modal-bg fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-6">
                <div className="w-full max-w-5xl mx-4">
                    {/* Toolbar */}
                    <div className="ci-toolbar bg-gray-800 rounded-t-xl border border-gray-700 p-4 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <FileText className="w-5 h-5 text-blue-400" />
                            <span className="text-white font-bold">수출 서류</span>
                            {/* Invoice No editor */}
                            <div className="flex items-center gap-2 ml-4">
                                <span className="text-gray-400 text-sm">Invoice No.</span>
                                <input
                                    value={invoiceNo}
                                    onChange={e => setInvoiceNo(e.target.value)}
                                    className="bg-gray-700 text-white text-sm border border-gray-600 rounded px-2 py-1 w-28"
                                    placeholder="DM2026001"
                                />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={handleSave} disabled={loading}
                                className="flex items-center gap-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg font-bold">
                                <Save className="w-4 h-4" /> {loading ? '저장 중...' : '저장'}
                            </button>
                            <button onClick={handlePrint}
                                className="flex items-center gap-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white text-sm rounded-lg font-bold">
                                <Printer className="w-4 h-4" /> 인쇄/PDF
                            </button>
                            <button onClick={onClose} className="text-gray-400 hover:text-white ml-2">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="ci-toolbar bg-gray-900 border-x border-gray-700 flex">
                        {[['ci', 'Commercial Invoice'], ['pl', 'Packing List']].map(([key, label]) => (
                            <button key={key} onClick={() => setTab(key)}
                                className={`px-6 py-3 text-sm font-bold border-b-2 transition-colors ${tab === key ? 'border-blue-400 text-blue-400' : 'border-transparent text-gray-400 hover:text-white'}`}>
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Document area */}
                    <div id="ci-print-root" className="ci-print-area bg-white rounded-b-xl border border-gray-700 p-8 shadow-xl" ref={printRef}>
                        {tab === 'ci' ? (
                            <CommercialInvoiceTemplate doc={ciDoc} setDoc={setCiDoc} {...sharedProps} />
                        ) : (
                            <PackingListTemplate doc={plDoc} setDoc={setPlDoc} {...sharedProps} />
                        )}
                    </div>
                </div>
            </div>
        </>
    );
};

export default CommercialInvoiceModal;
