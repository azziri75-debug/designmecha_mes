import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton, Tabs, Tab, Checkbox, Tooltip, Collapse
} from '@mui/material';
import { 
    Add as AddIcon, Edit as EditIcon, Print as PrintIcon, Delete as DeleteIcon, 
    Description as DescIcon, AttachFile as AttachIcon, Send as SendIcon,
    CheckCircle as CheckCircleIcon
} from '@mui/icons-material';
import api from '../lib/api';
import { cn, safeParseJSON } from '../lib/utils';
import ResizableTable from '../components/ResizableTable';

const Card = ({ children, className }) => (
    <div className={cn("bg-gray-800 rounded-xl border border-gray-700", className)}>
        {children}
    </div>
);
import OutsourcingOrderModal from '../components/OutsourcingOrderModal';
import PurchaseSheetModal from '../components/PurchaseSheetModal';
import FileViewerModal from '../components/FileViewerModal';
import OrderModal from '../components/OrderModal';
import StockProductionModal from '../components/StockProductionModal';



const PENDING_COLS = [
    { key: 'checkbox', label: '', width: 40, noResize: true },
    { key: 'order_no', label: '수주/재고번호', width: 150 },
    { key: 'client', label: '고객사', width: 120 },
    { key: 'target', label: '생산제품명', width: 200 },
    { key: 'process', label: '외주공정명', width: 200 },
    { key: 'partner', label: '외주처(계획)', width: 120 },
    { key: 'qty', label: '수량', width: 80 },
    { key: 'unit', label: '단위', width: 60 },
    { key: 'date', label: '계획일자', width: 100 },
    { key: 'remarks', label: '비고', width: 150 },
];

const ORDER_COLS = [
    { key: 'order_no', label: '발주번호', width: 150 },
    { key: 'related_id', label: '수주정보', width: 180 },
    { key: 'order_date', label: '발주일자', width: 120 },
    { key: 'partner', label: '외주처', width: 150 },
    { key: 'process', label: '공정명', width: 150 },
    { key: 'count', label: '품목 수', width: 100 },
    { key: 'delivery', label: '납기일자', width: 120 },
    { key: 'actual_delivery', label: '실제납품일', width: 120 },
    { key: 'status', label: '상태', width: 100 },
    { key: 'actions', label: '관리', width: 250, noResize: true },
];

const OutsourcingPage = () => {
    const navigate = useNavigate();
    const [tabValue, setTabValue] = useState(0);
    const [orders, setOrders] = useState([]);
    const [pendingItems, setPendingItems] = useState([]);
    const [selectedPendingItems, setSelectedPendingItems] = useState([]);
    const [expandedOrderId, setExpandedOrderId] = useState(null);




    const [modalOpen, setModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [initialModalItems, setInitialModalItems] = useState([]);

    // 견적의뢰서/구매발주서 모달
    const [sheetModalOpen, setSheetModalOpen] = useState(false);
    const [sheetOrder, setSheetOrder] = useState(null);
    const [sheetType, setSheetType] = useState('purchase_order');

    // 첨부파일 뷰어 모달
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);
    const [viewingFileTitle, setViewingFileTitle] = useState('');
    const [viewingTargetId, setViewingTargetId] = useState(null);

    // Source Information Modals
    const [sourceOrderModalOpen, setSourceOrderModalOpen] = useState(false);
    const [selectedSourceOrder, setSelectedSourceOrder] = useState(null);
    const [sourceStockModalOpen, setSourceStockModalOpen] = useState(false);
    const [selectedSourceStock, setSelectedSourceStock] = useState(null);

    // 입고납품일 선택 다이얼로그
    const [deliveryDateDialog, setDeliveryDateDialog] = useState(null);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPartnerId, setSelectedPartnerId] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [partners, setPartners] = useState([]);
    const [selectedMajorGroupId, setSelectedMajorGroupId] = useState('');
    const [groups, setGroups] = useState([]);


    useEffect(() => {
        fetchPartners();
        fetchGroups();
    }, []);

    useEffect(() => {
        if (tabValue === 0) {
            fetchPendingItems();
        } else if (tabValue === 1) {
            fetchOrders();
        } else {
            fetchCompletedOrders();
        }
    }, [tabValue, searchQuery, selectedPartnerId, startDate, endDate, selectedMajorGroupId]);


    const fetchGroups = async () => {
        try {
            const res = await api.get('/product/groups/');
            setGroups(res.data || []);
        } catch (error) {
            console.error("Failed to fetch groups", error);
        }
    };

    const fetchPartners = async () => {
        try {
            const res = await api.get('/basics/partners/');
            setPartners(res.data);
        } catch (err) {
            console.error("Fetch partners failed", err);
        }
    };

    const fetchOrders = async () => {
        try {
            const params = {
                product_name: searchQuery || undefined,
                partner_id: selectedPartnerId || undefined,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                major_group_id: selectedMajorGroupId || undefined
            };

            const response = await api.get('/purchasing/outsourcing/orders/', { params });
            setOrders(response.data.filter(o => o.status !== 'COMPLETED'));
        } catch (error) {
            console.error("Failed to fetch outsourcing orders", error);
        }
    };

    const fetchCompletedOrders = async () => {
        try {
            const params = {
                status: 'COMPLETED',
                product_name: searchQuery || undefined,
                partner_id: selectedPartnerId || undefined,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                major_group_id: selectedMajorGroupId || undefined
            };

            const response = await api.get('/purchasing/outsourcing/orders/', { params });
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch completed outsourcing orders", error);
        }
    };


    const handleApprovalSubmit = async (order) => {
        if (!window.confirm("이 외주 발주서로 결재 요청을 진행하시겠습니까?")) return;

        const firstItemProcess = order.items?.[0]?.process_name || '외주공정';
        const customerName = order.related_customer_names || '재고용';
        const partnerName = order.partner?.name || '외주처미지정';

        let existingAttachments = [];
        try {
            if (order.attachment_file) {
                const parsed = safeParseJSON(order.attachment_file, []);
                existingAttachments = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
            }
        } catch (e) {
            console.error("Attachment parse error", e);
        }

        const isStockOnly = !order.related_customer_names;
        const customerSuffix = isStockOnly ? '재고용' : (order.related_customer_names || '재고용');

        const approvalPayload = {
            title: `[외주발주서] (${partnerName}) - ${firstItemProcess} - ${customerSuffix}`,
            doc_type: 'PURCHASE_ORDER',
            content: {
                order_no: order.order_no,
                partner_name: order.partner?.name,
                partner_phone: order.partner?.phone,
                partner_fax: order.partner?.fax,
                order_date: order.order_date,
                delivery_date: order.delivery_date,
                special_notes: order.note,
                items: (order.items || []).map((item, idx) => {
                    const baseName = item.product?.name || item.process_name || '';
                    const processName = item.process_name;
                    const displayName = (processName && item.product?.name && processName !== item.product?.name)
                        ? `${item.product.name} [${processName}]`
                        : baseName;
                    return {
                        idx: idx + 1,
                        name: displayName,
                        spec: item.product?.specification || '-',
                        qty: item.quantity,
                        price: item.unit_price,
                        total: item.quantity * (item.unit_price || 0)
                    };
                }),
                colWidths: [40, 200, 120, 60, 80, 100]
            },
            attachments_to_add: existingAttachments.map(a => ({
                filename: a.name || a.filename,
                url: a.url
            })),
            reference_id: order.id,
            reference_type: 'OUTSOURCING'
        };

        try {
            await api.post('/approval/documents', approvalPayload);
            alert("결재 요청이 완료되었습니다.");
            navigate('/approval?mode=MY_WAITING');
        } catch (error) {
            console.error("Failed to submit approval", error);
            const errorMsg = error.response?.data?.detail 
                ? (typeof error.response.data.detail === 'string' ? error.response.data.detail : JSON.stringify(error.response.data.detail))
                : error.message;
            alert("결재 요청 실패: " + errorMsg);
        }
    };
    const fetchPendingItems = async () => {
        try {
            const params = {
                major_group_id: selectedMajorGroupId || undefined
            };
            const response = await api.get('/purchasing/outsourcing/pending-items/', { params });
            setPendingItems(response.data);
            setSelectedPendingItems([]);
        } catch (error) {
            console.error("Failed to fetch pending items", error);
        }
    };

    const handleTabChange = (event, newValue) => {
        setTabValue(newValue);
    };

    const handleCreateClick = () => {
        setSelectedOrder(null);
        setInitialModalItems([]);
        setModalOpen(true);
    };

    const handleEditClick = (order) => {
        setSelectedOrder(order);
        setInitialModalItems([]);
        setModalOpen(true);
    };

    const handleDeleteOrder = async (orderId) => {
        if (!window.confirm("정말로 이 외주 발주를 삭제하시겠습니까?")) return;
        try {
            await api.delete(`/purchasing/outsourcing/orders/${orderId}`);
            alert("삭제되었습니다.");
            handleSuccess();
        } catch (error) {
            console.error("Delete failed", error);
            alert("삭제 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleCompleteOrder = (orderId) => {
        const today = new Date().toISOString().split('T')[0];
        setDeliveryDateDialog({ orderId, date: today });
    };

    const handleCompleteConfirm = async () => {
        if (!deliveryDateDialog) return;
        const { orderId, date } = deliveryDateDialog;
        try {
            await api.post(`/purchasing/outsourcing/orders/${orderId}/complete`, { actual_delivery_date: date });
            alert('입고 처리되었습니다.');
            setDeliveryDateDialog(null);
            handleSuccess();
        } catch (error) {
            console.error('Complete failed', error);
            alert('처리 실패: ' + (error.response?.data?.detail || error.message));
        }
    };

    const handleDeleteAttachment = async (targetId, indexToRemove) => {
        if (!targetId) return;
        if (!window.confirm("정말로 이 첨부파일을 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)")) return;

        try {
            const order = orders.find(o => o.id === targetId);
            if (!order) return;

            const files = safeParseJSON(order.attachment_file, []);
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== indexToRemove);

            const res = await api.put(`/purchasing/outsourcing/orders/${targetId}`, { attachment_file: newFiles });
            const updatedOrder = res.data;

            setOrders(prev => prev.map(o => o.id === targetId ? updatedOrder : o));
            setViewingFiles(newFiles);
            if (newFiles.length === 0) setShowFileModal(false);

            alert("첨부파일이 삭제되었습니다.");
        } catch (error) {
            console.error("Failed to delete attachment", error);
            alert("첨부파일 삭제 실패");
        }
    };

    const handleCreateFromPending = () => {
        if (selectedPendingItems.length === 0) return;

        let itemsToOrder = pendingItems.filter(item => selectedPendingItems.includes(item.id));

        if (itemsToOrder.length === 1) {
            const refItem = itemsToOrder[0];
            const refOrderNo = refItem.plan?.order?.order_no || refItem.plan?.stock_production?.production_no;
            const refPartner = refItem.partner_name;

            if (refOrderNo && refPartner) {
                const relatedItems = pendingItems.filter(item => {
                    if (item.id === refItem.id) return false;
                    const orderNo = item.plan?.order?.order_no || item.plan?.stock_production?.production_no;
                    return orderNo === refOrderNo && item.partner_name === refPartner;
                });

                if (relatedItems.length > 0) {
                    if (window.confirm(`동일한 수주/재고 번호(${refOrderNo}) 및 외주처(${refPartner})를 가진 미발주 품목이 ${relatedItems.length}건 더 있습니다.\n\n하나의 발주서로 묶어서 처리하시겠습니까?`)) {
                        itemsToOrder = [...itemsToOrder, ...relatedItems];
                        setSelectedPendingItems(itemsToOrder.map(i => i.id));
                    }
                }
            }
        }

        setSelectedOrder(null);
        setInitialModalItems(itemsToOrder);
        setModalOpen(true);
    };

    const handleSuccess = () => {
        if (tabValue === 0) fetchPendingItems();
        else if (tabValue === 1) fetchOrders();
        else fetchCompletedOrders();
        setModalOpen(false);
    };

    const handleSelectPendingItem = (id) => {
        if (selectedPendingItems.includes(id)) {
            setSelectedPendingItems(selectedPendingItems.filter(itemId => itemId !== id));
        } else {
            setSelectedPendingItems([...selectedPendingItems, id]);
        }
    };

    const handleSelectAllPending = (event) => {
        if (event.target.checked) {
            setSelectedPendingItems(pendingItems.map(item => item.id));
        } else {
            setSelectedPendingItems([]);
        }
    };

    const handleOpenSource = (item) => {
        if (item.plan?.order) {
            setSelectedSourceOrder(item.plan.order);
            setSourceOrderModalOpen(true);
        } else if (item.plan?.stock_production) {
            setSelectedSourceStock(item.plan.stock_production);
            setSourceStockModalOpen(true);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center no-print">
                <h1 className="text-2xl font-bold text-white">
                    외주 가공 발주 관리
                </h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-700 print-safe-area">
                {['미발주 현황 (Pending)', '발주 현황 (Ordered)', '완료 내역 (Completed)'].map((label, index) => (
                    <button
                        key={index}
                        className={cn(
                            "px-4 py-2 text-sm font-medium transition-colors relative",
                            tabValue === index ? "text-blue-400" : "text-gray-400 hover:text-gray-300"
                        )}
                        onClick={() => handleTabChange(null, index)}
                    >
                        {label}
                        {tabValue === index && (
                            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-400" />
                        )}
                    </button>
                ))}
            </div>

            {/* Filter Section */}
            <Card className="p-4 flex flex-wrap gap-4 items-end mb-4 print-safe-area">
                <div className="flex-1 min-w-[150px] space-y-1">
                    <label className="text-xs text-gray-400">사업부</label>
                    <select
                        value={selectedMajorGroupId}
                        onChange={(e) => setSelectedMajorGroupId(e.target.value)}
                        className="w-full bg-gray-700 border-gray-600 outline-none focus:border-blue-500 rounded text-white px-3 py-2 text-sm h-[38px]"
                    >
                        <option value="">전체 사업부</option>
                        {groups.filter(g => g.type === 'MAJOR').map(g => (
                            <option key={g.id} value={g.id}>{g.name}</option>
                        ))}
                    </select>
                </div>
                {(tabValue === 1 || tabValue === 2) && (
                    <>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-400">시작일</label>
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm h-[38px]" />
                        </div>
                        <div className="space-y-1">
                            <label className="text-xs text-gray-400">종료일</label>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm h-[38px]" />
                        </div>
                        <div className="flex-1 min-w-[200px] space-y-1">
                            <label className="text-xs text-gray-400">외주처</label>
                            <select
                                value={selectedPartnerId || ''}
                                onChange={(e) => setSelectedPartnerId(e.target.value || null)}
                                className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm h-[38px]"
                            >
                                <option value="">전체 외주처</option>
                                {partners.filter(p => (p.partner_type && p.partner_type.includes('SUBCONTRACTOR')) || p.type === 'SUBCONTRACTOR').map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    </>
                )}
                <div className="space-y-1">
                    <label className="text-xs text-gray-400">품명/품번</label>
                    <div className="relative">
                        <input type="text" placeholder="검색어 입력..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="w-[200px] bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm h-[38px]" />
                    </div>
                </div>
                <button
                    onClick={() => { setStartDate(''); setEndDate(''); setSelectedPartnerId(null); setSearchQuery(''); setSelectedMajorGroupId(''); }}
                    className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 rounded text-sm h-[38px] transition-colors font-medium border border-gray-600"
                >
                    초기화
                </button>
            </Card>

            <Card className="p-0 overflow-hidden min-h-[500px]">
                <div className="overflow-x-auto p-3">


            {tabValue === 0 && (
                <>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                        <Button
                            variant="contained"
                            startIcon={<AddIcon />}
                            onClick={handleCreateFromPending}
                            disabled={selectedPendingItems.length === 0}
                        >
                            선택 품목 발주 등록
                        </Button>
                    </Box>
                    <ResizableTable
                        columns={PENDING_COLS}
                        className="w-full text-left text-sm"
                        theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700"
                        thClassName="px-4 py-3"
                    >
                        {pendingItems?.length === 0 ? (
                            <tr><td colSpan={PENDING_COLS.length} className="px-4 py-12 text-center text-gray-500">발주 대기 중인 품목이 없습니다.</td></tr>
                        ) : (
                            pendingItems.map((item) => (
                                <tr 
                                    key={item.id} 
                                    className="hover:bg-gray-800/40 transition-colors cursor-pointer select-none divide-x divide-gray-700/30 text-gray-300"
                                    onClick={() => handleSelectPendingItem(item.id)}
                                >
                                    <td className="px-4 py-4 w-[40px]">
                                        <Checkbox checked={selectedPendingItems.includes(item.id)} size="small" />
                                    </td>
                                    <td className="px-4 py-4">
                                        <div className="flex items-center gap-1">
                                            {item.plan?.order ? (
                                                <Chip label="수주" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#e3f2fd', color: '#1976d2' }} />
                                            ) : item.plan?.stock_production ? (
                                                <Chip label="재고" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#fff3e0', color: '#e65100', fontWeight: 'bold' }} />
                                            ) : null}
                                            <span className="font-bold text-blue-400">{item.plan?.order?.order_no || item.plan?.stock_production?.production_no || '-'}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-4 truncate">{item.client_name || '-'}</td>
                                    <td className="px-4 py-4 truncate">{item.product_name_of_plan || '-'}</td>
                                    <td className="px-4 py-4">
                                        <div className="font-bold text-gray-200">{item.process_name || '-'}</div>
                                        <div className="text-xs text-gray-500">{item.product?.name} ({item.product?.specification || '-'})</div>
                                    </td>
                                    <td className="px-4 py-4 truncate">{item.partner_name || '-'}</td>
                                    <td className="px-4 py-4 font-bold">{item.quantity}</td>
                                    <td className="px-4 py-4 text-gray-600">{item.product?.unit}</td>
                                    <td className="px-4 py-4 whitespace-nowrap">{item.start_date || item.plan?.plan_date || '-'}</td>
                                    <td className="px-4 py-4 truncate text-gray-500 max-w-[150px]" title={item.note}>{item.note}</td>
                                </tr>
                            ))
                        )}
                    </ResizableTable>
                </>
            )}

            {(tabValue === 1 || tabValue === 2) && (
                <>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                        {tabValue === 1 && (
                            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateClick}>
                                신규 외주 발주 직접 등록
                            </Button>
                        )}
                    </Box>
                    <ResizableTable
                        columns={ORDER_COLS}
                        className="w-full text-left text-sm"
                        theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700"
                        thClassName="px-4 py-3"
                    >
                        {orders.length === 0 ? (
                            <tr><td colSpan={ORDER_COLS.length} className="px-4 py-12 text-center text-gray-500">{tabValue === 1 ? "진행 중인 외주 발주 내역이 없습니다." : "완료된 외주 발주 내역이 없습니다."}</td></tr>
                        ) : (
                            orders.map((order) => (
                                <OutsourcingOrderRow 
                                    key={order.id} 
                                    order={order} 
                                    expanded={expandedOrderId === order.id}
                                    onToggle={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                    onEdit={handleEditClick}
                                    onDelete={handleDeleteOrder}
                                    onComplete={handleCompleteOrder}
                                    onApproval={handleApprovalSubmit}
                                    onOpenFiles={(files, ord) => {
                                        setViewingFiles(files);
                                        setViewingFileTitle(ord.order_no);
                                        setViewingTargetId(ord.id);
                                        setShowFileModal(true);
                                    }}
                                    onRefresh={() => {
                                        if (tabValue === 0) fetchPendingItems();
                                        else if (tabValue === 1) fetchOrders();
                                        else fetchCompletedOrders();
                                    }}
                                    onOpenSheet={(ord, stype) => {
                                        setSheetOrder(ord);
                                        setSheetType(stype);
                                        setSheetModalOpen(true);
                                    }}
                                    readonly={tabValue === 2}
                                />
                            ))
                        )}
                    </ResizableTable>
                </>
            )}

            <OutsourcingOrderModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleSuccess}
                order={selectedOrder}
                initialItems={initialModalItems}
            />

            <PurchaseSheetModal
                isOpen={sheetModalOpen}
                onClose={() => setSheetModalOpen(false)}
                order={sheetOrder}
                sheetType={sheetType}
                orderType="outsourcing"
                onSave={() => {
                    if (tabValue === 1) fetchOrders();
                    else fetchCompletedOrders();
                }}
            />

            <FileViewerModal
                isOpen={showFileModal}
                onClose={() => setShowFileModal(false)}
                files={viewingFiles}
                title={viewingFileTitle}
                onDeleteFile={(index) => handleDeleteAttachment(viewingTargetId, index)}
            />

            <OrderModal
                isOpen={sourceOrderModalOpen}
                onClose={() => setSourceOrderModalOpen(false)}
                order={selectedSourceOrder}
                readonly={true}
            />

            <StockProductionModal
                isOpen={sourceStockModalOpen}
                onClose={() => setSourceStockModalOpen(false)}
                stockProduction={selectedSourceStock}
                readonly={true}
            />
            {/* 입고납품일 선택 다이얼로그 */}
            {deliveryDateDialog && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
                        <h3 className="text-lg font-black text-white mb-6">📦 입고납품일 선택</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs text-gray-400 font-bold block mb-1">실제 입고일</label>
                                <input
                                    type="date"
                                    value={deliveryDateDialog.date}
                                    onChange={e => setDeliveryDateDialog(p => ({ ...p, date: e.target.value }))}
                                    className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                                />
                            </div>
                            <p className="text-xs text-gray-500">입고일을 확인 후 등록하면 재고가 자동 반영됩니다.</p>
                        </div>
                        <div className="flex gap-3 mt-6 justify-end">
                            <button
                                onClick={() => setDeliveryDateDialog(null)}
                                className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-gray-600 hover:bg-gray-800"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleCompleteConfirm}
                                className="px-5 py-2 rounded-lg text-sm font-bold bg-green-600 hover:bg-green-500 text-white"
                            >
                                입고 확인
                            </button>
                        </div>
                    </div>
                </div>
            )}
                </div>
            </Card>
        </div>
    );
};

const OutsourcingOrderRow = ({ order, expanded, onToggle, onEdit, onDelete, onComplete, onApproval, onOpenFiles, onRefresh, onOpenSheet, readonly }) => {
    return (
        <React.Fragment>
            <tr
                className={cn(
                    "hover:bg-gray-800/40 transition-colors select-none divide-x divide-gray-700/30 text-gray-300 cursor-pointer",
                    expanded && "bg-gray-800/30"
                )}
                onClick={onToggle}
                onDoubleClick={(e) => {
                    e.stopPropagation();
                    onEdit(order);
                }}
            >
                <td className="px-4 py-4">{order.order_no}</td>
                <td className="px-4 py-4">
                    <Box>
                        <Typography variant="body2" sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                            {order.order ? (
                                <span style={{ color: '#1976d2' }}>[수주] {order.order.order_no}</span>
                            ) : order.related_sales_order_info ? (
                                <>
                                    {order.related_sales_order_info.includes('PO') || order.related_sales_order_info.includes('OS') ? (
                                        <span style={{ color: '#2e7d32' }}>[재고] </span>
                                    ) : (
                                        <span style={{ color: '#1976d2' }}>[수주] </span>
                                    )}
                                    {order.related_sales_order_info}
                                </>
                            ) : (
                                <span style={{ color: '#757575' }}>재고용</span>
                            )}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">{order.order?.partner?.name || order.related_customer_names || '-'}</Typography>
                    </Box>
                </td>
                <td className="px-4 py-4">{order.order_date}</td>
                <td className="px-4 py-4 font-bold">{order.partner?.name}</td>
                <td className="px-4 py-4 whitespace-nowrap">
                    {(() => {
                        const items = order.items || [];
                        const processNames = [...new Set(items.map(i => i.process_name).filter(Boolean))];
                        if (processNames.length === 0) return <span className="text-gray-500">-</span>;
                        return <span className="text-xs text-blue-300 font-medium">{processNames.join(', ')}</span>;
                    })()}
                </td>
                <td className="px-4 py-4">{order.items.length} 품목</td>
                <td className="px-4 py-4 text-orange-600 font-bold">{order.delivery_date}</td>
                <td className="px-4 py-4 font-bold">
                    {order.actual_delivery_date
                        ? <span className="text-green-400">{order.actual_delivery_date}</span>
                        : <span className="text-gray-500">-</span>}
                </td>
                <td className="px-4 py-4">
                    <Chip
                        label={order.status}
                        size="small"
                        color={order.status === 'COMPLETED' ? "success" : order.status === 'PENDING' ? "warning" : "primary"}
                        sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                </td>
                <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1 justify-center">
                        <Tooltip title="수정">
                            <IconButton size="small" onClick={() => onEdit(order)}>
                                <EditIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="삭제">
                            <IconButton size="small" color="error" onClick={() => onDelete(order.id)}>
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="견적의뢰서">
                            <IconButton size="small" color="info" onClick={() => onOpenSheet(order, 'estimate_request')}>
                                <DescIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        <Tooltip title="구매발주서">
                            <IconButton size="small" color="success" onClick={() => onOpenSheet(order, 'purchase_order')}>
                                <PrintIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                        {(order.status === 'PENDING' || order.status === 'ORDERED') && (
                            <Tooltip title="결재요청">
                                <IconButton size="small" color="primary" onClick={() => onApproval(order)}>
                                    <SendIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        {!readonly && order.status !== 'COMPLETED' && (
                            <Tooltip title="외주 완료(입고)">
                                <IconButton size="small" color="success" onClick={() => onComplete(order.id)}>
                                    <CheckCircleIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        {(() => {
                            const files = safeParseJSON(order.attachment_file, []);
                            return (
                                <>
                                    {files.length > 0 && (
                                        <Tooltip title={`첨부파일 ${files.length}개`}>
                                            <IconButton size="small" onClick={() => onOpenFiles(files, order)}>
                                                <AttachIcon fontSize="small" color="action" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                    <input
                                        type="file"
                                        id={`os-file-${order.id}`}
                                        style={{ display: 'none' }}
                                        onChange={async (e) => {
                                            const file = e.target.files[0];
                                            if (!file) return;
                                            const formData = new FormData();
                                            formData.append('file', file);
                                            try {
                                                const uploadRes = await api.post('/upload', formData, {
                                                    headers: { 'Content-Type': 'multipart/form-data' }
                                                });
                                                const newFile = { name: uploadRes.data.filename, url: uploadRes.data.url };
                                                const updatedFiles = [...files, newFile];
                                                await api.put(`/purchasing/outsourcing/orders/${order.id}`, { attachment_file: updatedFiles });
                                                onRefresh();
                                            } catch (err) {
                                                console.error("Upload failed", err);
                                                alert("파일 업로드 실패");
                                            } finally {
                                                e.target.value = null;
                                            }
                                        }}
                                    />
                                    <Tooltip title="첨부파일 추가">
                                        <IconButton size="small" onClick={() => document.getElementById(`os-file-${order.id}`).click()}>
                                            <AddIcon sx={{ fontSize: 18 }} />
                                        </IconButton>
                                    </Tooltip>
                                </>
                            );
                        })()}
                    </div>
                </td>
            </tr>
            {expanded && (
                <tr className="bg-gray-800/50">
                    <td colSpan={ORDER_COLS.length} className="p-0 border-none">
                        <div className="p-4 bg-gray-900 rounded-lg border border-gray-700 mx-4 my-2">
                            <h4 className="text-sm font-semibold mb-2 text-gray-300">외주 발주 상세 내역</h4>
                            <table className="w-full text-xs text-left text-gray-300 bg-gray-950 border border-gray-800 overflow-hidden rounded-md">
                                <thead className="bg-gray-800/80 text-gray-400 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-700">
                                    <tr>
                                        <th className="px-3 py-2">공정명/품목</th>
                                        <th className="px-3 py-2">규격</th>
                                        <th className="px-3 py-2 text-right">수량</th>
                                        <th className="px-3 py-2 text-right">단가</th>
                                        <th className="px-3 py-2 text-right">금액</th>
                                        <th className="px-3 py-2">비고</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {(order.items || []).map((item) => (
                                        <tr key={item.id} className="hover:bg-gray-800/30 border-b border-gray-800">
                                            <td className="px-3 py-2 font-bold">{item.product?.name}</td>
                                            <td className="px-3 py-2">{item.product?.specification}</td>
                                            <td className="px-3 py-2 text-right">{item.quantity} {item.product?.unit}</td>
                                            <td className="px-3 py-2 text-right">{(item.unit_price || 0).toLocaleString()}</td>
                                            <td className="px-3 py-2 text-right font-bold text-blue-900">{((item.quantity || 0) * (item.unit_price || 0)).toLocaleString()}</td>
                                            <td className="px-3 py-2 truncate max-w-[200px]" title={item.note}>{item.note}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};

export default OutsourcingPage;
