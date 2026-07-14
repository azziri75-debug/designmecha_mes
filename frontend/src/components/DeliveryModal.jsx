import React, { useState, useEffect } from 'react';
import { X, Save, Truck, Calendar, CheckCircle, Upload, FileText, Trash2, FileSearch, Globe, AlertTriangle, Package, Factory } from 'lucide-react';
import api from '../lib/api';
import { getImageUrl } from '../lib/utils';
import MultiFileUpload from './MultiFileUpload';
import TransactionStatementModal from './TransactionStatementModal';
import CommercialInvoiceModal from './CommercialInvoiceModal';

/* ─────────────────────────────────────────────────────────────────
   생산계획 없음 선택 다이얼로그
   ───────────────────────────────────────────────────────────────── */
const NoPlanSourceDialog = ({ onSelect, onCancel }) => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
        <div className="bg-gray-800 rounded-2xl border border-amber-500/40 shadow-2xl w-full max-w-lg">
            {/* Header */}
            <div className="p-5 border-b border-gray-700 flex items-center gap-3">
                <div className="p-2 bg-amber-500/20 rounded-lg">
                    <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-white">생산 계획 없음 알림</h3>
                    <p className="text-xs text-gray-400 mt-0.5">이 수주건에 연결된 생산 계획이 없습니다.</p>
                </div>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3">
                <p className="text-sm text-gray-300 mb-4">
                    납품 처리 방식을 선택해 주세요.
                </p>

                {/* Option 1 – 재고 소진 */}
                <button
                    onClick={() => onSelect('STOCK')}
                    className="w-full flex items-start gap-4 p-4 rounded-xl border border-blue-500/40 bg-blue-500/10 hover:bg-blue-500/20 transition-colors text-left group"
                >
                    <div className="p-2 bg-blue-500/20 rounded-lg mt-0.5 group-hover:bg-blue-500/30 transition-colors">
                        <Package className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                        <p className="font-bold text-white text-sm">재고 소진 납품</p>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                            기존 보유 재고에서 납품 수량을 차감합니다.<br />
                            생산 기록은 생성되지 않으며, 현재고가 감소합니다.
                        </p>
                    </div>
                </button>

                {/* Option 2 – 생산 완료 납품 */}
                <button
                    onClick={() => onSelect('PRODUCE')}
                    className="w-full flex items-start gap-4 p-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-left group"
                >
                    <div className="p-2 bg-emerald-500/20 rounded-lg mt-0.5 group-hover:bg-emerald-500/30 transition-colors">
                        <Factory className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <p className="font-bold text-white text-sm">생산 완료 납품</p>
                        <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                            생산계획 없이 생산이 완료된 건입니다.<br />
                            생산 계획이 자동으로 생성·완료 처리되며,<br />
                            <span className="text-emerald-400 font-semibold">기존 재고는 차감되지 않습니다.</span>
                            (생산 입고 + 납품 출고 상쇄)
                        </p>
                    </div>
                </button>
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-700 flex justify-end">
                <button
                    onClick={onCancel}
                    className="px-5 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                    취소
                </button>
            </div>
        </div>
    </div>
);

/* ─────────────────────────────────────────────────────────────────
   메인 납품 모달
   ───────────────────────────────────────────────────────────────── */
const DeliveryModal = ({ isOpen, onClose, onSuccess, order }) => {
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        delivery_date: '',
        note: '',
        items: [],
        attachment_files: [],
        is_export: false
    });

    const [showStatement, setShowStatement] = useState(false);
    const [showInvoice, setShowInvoice] = useState(false);
    const [lastDelivery, setLastDelivery] = useState(null);
    const [nextInvoiceNo, setNextInvoiceNo] = useState('');

    // 생산계획 없음 다이얼로그 상태
    const [noPlanDialog, setNoPlanDialog] = useState(false);
    const [pendingPayload, setPendingPayload] = useState(null); // 다이얼로그 확인 후 전송할 payload

    useEffect(() => {
        if (order) {
            setFormData({
                delivery_date: new Date().toISOString().split('T')[0],
                note: '',
                items: order.items.map(item => ({
                    ...item,
                    remaining_quantity: item.quantity - (item.delivered_quantity || 0),
                    current_delivered_quantity: 0
                })),
                attachment_files: [],
                is_export: false
            });
        }
    }, [order]);

    // Fetch next invoice number when export mode is toggled on
    useEffect(() => {
        if (formData.is_export && !nextInvoiceNo) {
            api.get('/sales/invoice/next-number').then(r => {
                setNextInvoiceNo(r.data.invoice_no);
            }).catch(() => {
                const year = new Date().getFullYear();
                setNextInvoiceNo(`DM${year}001`);
            });
        }
    }, [formData.is_export]);

    /* ── 납품 API 호출 공통 함수 ── */
    const submitDelivery = async (payload) => {
        setLoading(true);
        try {
            const res = await api.post(`/sales/orders/${order.id}/delivery`, payload);
            setLastDelivery(res.data);
            alert('납품 처리가 완료되었습니다.');

            // Check if full delivery
            if (res.data.status === 'DELIVERED') {
                if (window.confirm("모든 납품이 완료되었습니다. 연관된 생산계획 및 발주 건들을 모두 '완료' 처리 하시겠습니까?")) {
                    await api.post(`/sales/orders/${order.id}/batch-complete`);
                    alert('후방 공정이 일괄 완료 처리되었습니다.');
                }
            }

            if (formData.is_export) {
                setShowInvoice(true);
            } else {
                if (window.confirm('거래명세서를 지금 바로 확인/출력하시겠습니까?')) {
                    setShowStatement(true);
                } else {
                    onSuccess();
                    onClose();
                }
            }
        } catch (error) {
            console.error('Delivery failed', error);
            alert('처리 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    };

    /* ── 폼 제출 ── */
    const handleSubmit = async (e) => {
        e.preventDefault();

        const validItems = formData.items.filter(i => i.current_delivered_quantity > 0);
        if (validItems.length === 0) {
            alert('납품 수량을 하나 이상 입력해주세요.');
            return;
        }

        const basePayload = {
            order_id: order.id,
            delivery_date: formData.delivery_date,
            note: formData.note,
            attachment_files: formData.attachment_files,
            is_export: formData.is_export,
            invoice_no: formData.is_export ? nextInvoiceNo : null,
            items: validItems.map(item => ({
                order_item_id: item.id,
                quantity: item.current_delivered_quantity
            }))
        };

        // 생산 계획 존재 여부 확인
        try {
            const planRes = await api.get(`/production/plans`, { params: { order_id: order.id } });
            const plans = planRes.data?.items || planRes.data || [];
            if (!plans || plans.length === 0) {
                // 생산계획 없음 → 다이얼로그 표시
                setPendingPayload(basePayload);
                setNoPlanDialog(true);
                return;
            }
        } catch (err) {
            // API 오류 시 그냥 진행 (생산계획 확인 실패는 비치명적)
            console.warn('Production plan check failed, proceeding normally:', err);
        }

        await submitDelivery(basePayload);
    };

    /* ── 생산계획 없음 다이얼로그 선택 처리 ── */
    const handleNoPlanSelect = async (source) => {
        setNoPlanDialog(false);
        if (!pendingPayload) return;
        const payload = { ...pendingPayload, no_plan_source: source };
        setPendingPayload(null);
        await submitDelivery(payload);
    };

    const handleNoPlanCancel = () => {
        setNoPlanDialog(false);
        setPendingPayload(null);
    };

    if (!isOpen) return null;

    if (showStatement && lastDelivery) {
        return (
            <TransactionStatementModal
                open={showStatement}
                onClose={() => {
                    setShowStatement(false);
                    onSuccess();
                    onClose();
                }}
                data={{
                    ...order,
                    delivery_date: lastDelivery.delivery_date,
                    delivery_id: lastDelivery.id,
                    statement_json: lastDelivery.statement_json,
                    items: lastDelivery.items.map(di => ({
                        ...di.order_item,
                        quantity: di.quantity
                    }))
                }}
                onSave={async (snap) => {
                    await api.put(`/sales/orders/${order.id}/delivery/${lastDelivery.id}`, { statement_json: snap });
                    alert('명세서 스냅샷이 저장되었습니다.');
                }}
            />
        );
    }

    if (showInvoice && lastDelivery) {
        return (
            <CommercialInvoiceModal
                open={showInvoice}
                onClose={() => {
                    setShowInvoice(false);
                    onSuccess();
                    onClose();
                }}
                order={{ ...order, items: lastDelivery.items.map(di => ({ ...di.order_item, current_delivered_quantity: di.quantity })) }}
                deliveryId={lastDelivery.id}
                deliveryDate={lastDelivery.delivery_date}
                initialInvoiceNo={nextInvoiceNo}
                onSaved={() => {}}
            />
        );
    }

    const isExport = formData.is_export;
    const currency = isExport ? 'USD' : 'KRW';
    const currencySymbol = isExport ? '$' : '₩';

    return (
        <>
            {/* 생산계획 없음 선택 다이얼로그 */}
            {noPlanDialog && (
                <NoPlanSourceDialog
                    onSelect={handleNoPlanSelect}
                    onCancel={handleNoPlanCancel}
                />
            )}

            <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl">
                    <div className="p-6 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800 z-10">
                        <h2 className="text-xl font-bold text-white flex items-center gap-2">
                            <Truck className="w-5 h-5 text-blue-400" />
                            분할 납품 처리 (수주번호: {order?.order_no})
                        </h2>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                            <X className="w-6 h-6" />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="p-6 space-y-6">
                        {/* Export Toggle */}
                        <div className="flex items-center gap-4 p-3 bg-gray-900/50 rounded-lg border border-gray-700">
                            <span className="text-sm font-semibold text-gray-300">납품 유형</span>
                            <div className="flex gap-3">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="delivery_type" checked={!isExport}
                                        onChange={() => setFormData({ ...formData, is_export: false })}
                                        className="accent-blue-500" />
                                    <span className="text-sm text-white">🏭 국내 납품</span>
                                </label>
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input type="radio" name="delivery_type" checked={isExport}
                                        onChange={() => setFormData({ ...formData, is_export: true })}
                                        className="accent-emerald-500" />
                                    <span className="text-sm text-white flex items-center gap-1">
                                        <Globe className="w-4 h-4 text-emerald-400" /> 수출 (Commercial Invoice)
                                    </span>
                                </label>
                            </div>
                            {isExport && nextInvoiceNo && (
                                <span className="ml-auto text-emerald-400 text-xs font-mono bg-emerald-400/10 px-2 py-1 rounded">
                                    Invoice: {nextInvoiceNo}
                                </span>
                            )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <Calendar className="w-4 h-4" /> 납품 정보
                                </h3>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">
                                        {isExport ? '선적일 (Shipping Date)' : '납품 일자'}
                                    </label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5 focus:ring-2 focus:ring-blue-500"
                                        value={formData.delivery_date}
                                        onChange={(e) => setFormData({ ...formData, delivery_date: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-400 mb-1">비고 (메모)</label>
                                    <textarea
                                        className="w-full bg-gray-700 border-gray-600 rounded-lg text-white p-2.5 focus:ring-2 focus:ring-blue-500"
                                        rows={2}
                                        value={formData.note}
                                        onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                                        placeholder="특이사항 입력"
                                    />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                                    <FileSearch className="w-4 h-4" /> 증빙/스캔본 첨부
                                </h3>
                                <MultiFileUpload
                                    files={formData.attachment_files}
                                    onChange={(files) => setFormData({ ...formData, attachment_files: files })}
                                    label="납품 확인서/사진 업로드"
                                />
                            </div>
                        </div>

                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">납품 수량 관리</h3>
                            <div className="bg-gray-900/50 rounded-lg border border-gray-700 overflow-hidden">
                                <table className="w-full text-sm text-gray-300">
                                    <thead className="bg-gray-800 text-gray-400">
                                        <tr>
                                            <th className="px-4 py-3 text-left">품목명</th>
                                            <th className="px-4 py-3 text-left">규격</th>
                                            <th className="px-4 py-3 text-right">총 수량</th>
                                            <th className="px-4 py-3 text-right">기 납품</th>
                                            <th className="px-4 py-3 text-right">잔량</th>
                                            <th className="px-4 py-3 text-right">단가</th>
                                            <th className="px-4 py-3 text-right text-blue-400 font-bold">이번 납품</th>
                                            <th className="px-4 py-3 text-right text-blue-400 font-bold">납품금액</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700">
                                        {formData.items.map((item, idx) => (
                                            <tr key={idx} className="hover:bg-gray-800/50">
                                                <td className="px-4 py-3 font-medium">{item.product?.name || item.product_name || '품목명 없음'}</td>
                                                <td className="px-4 py-3 text-gray-400 text-xs">{item.product?.specification || item.specification || '-'}</td>
                                                <td className="px-4 py-3 text-right text-gray-500">{item.quantity}</td>
                                                <td className="px-4 py-3 text-right text-green-500">{item.delivered_quantity || 0}</td>
                                                <td className="px-4 py-3 text-right font-bold">{item.remaining_quantity}</td>
                                                <td className="px-4 py-3 text-right text-gray-400 font-mono">
                                                    {currencySymbol}{(item.unit_price || 0).toLocaleString()}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <input
                                                        type="number"
                                                        max={item.remaining_quantity}
                                                        min={0}
                                                        className="w-24 bg-gray-700 border-blue-500/50 border rounded text-right px-2 py-1.5 text-white ml-auto block focus:ring-2 focus:ring-blue-500 font-bold"
                                                        value={item.current_delivered_quantity}
                                                        onChange={(e) => {
                                                            const val = parseInt(e.target.value) || 0;
                                                            const newItems = [...formData.items];
                                                            newItems[idx].current_delivered_quantity = Math.min(val, item.remaining_quantity);
                                                            setFormData({ ...formData, items: newItems });
                                                        }}
                                                    />
                                                </td>
                                                <td className="px-4 py-3 text-right font-black text-blue-400">
                                                    {currencySymbol}{(item.current_delivered_quantity * (item.unit_price || 0)).toLocaleString()}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="pt-4 border-t border-gray-700 flex justify-end gap-3">
                            <button type="button" onClick={onClose}
                                className="px-6 py-2.5 bg-gray-700 text-white rounded-xl font-bold hover:bg-gray-600">
                                취소
                            </button>
                            <button type="submit" disabled={loading}
                                className={`px-8 py-2.5 text-white rounded-xl font-bold shadow-lg flex items-center gap-2 ${isExport ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/20' : 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/20'}`}>
                                {isExport ? <Globe className="w-5 h-5" /> : <Truck className="w-5 h-5" />}
                                {loading ? '처리 중...' : isExport ? '납품 저장 & Invoice 작성' : '납품 기록 저장'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </>
    );
};

export default DeliveryModal;
