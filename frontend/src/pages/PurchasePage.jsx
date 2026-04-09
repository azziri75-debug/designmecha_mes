import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton, Tabs, Tab, Checkbox, Tooltip,
    FormControlLabel, Switch
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Print as PrintIcon, Delete as DeleteIcon, Description as DescIcon, AttachFile as AttachIcon, Send as SendIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import api from '../lib/api';
import { cn, safeParseJSON } from '../lib/utils';
import ResizableTable from '../components/ResizableTable';

const Card = ({ children, className }) => (
    <div className={cn("bg-gray-800 rounded-xl border border-gray-700", className)}>
        {children}
    </div>
);
import PurchaseOrderModal from '../components/PurchaseOrderModal';
import PurchaseSheetModal from '../components/PurchaseSheetModal';
import FileViewerModal from '../components/FileViewerModal';
import OrderModal from '../components/OrderModal';
import StockProductionModal from '../components/StockProductionModal';
import ConsumableOrderModal from '../components/ConsumableOrderModal';


const PENDING_COLS = [
    { key: 'checkbox', label: '', width: 40, noResize: true },
    { key: 'order_no', label: '수주/재고번호', width: 150 },
    { key: 'client', label: '고객사', width: 120 },
    { key: 'target', label: '생산제품명', width: 200 },
    { key: 'process', label: '공정명', width: 100 },
    { key: 'product', label: '구매품목명', width: 200 },
    { key: 'spec', label: '규격', width: 150 },
    { key: 'qty', label: '수량', width: 80 },
    { key: 'unit', label: '단위', width: 60 },
    { key: 'date', label: '계획일자', width: 100 },
    { key: 'partner', label: '구매처(계획)', width: 120 },
    { key: 'remarks', label: '비고', width: 150 },
];

const PENDING_CONSUMABLE_COLS = [
    { key: 'checkbox', label: '', width: 40, noResize: true },
    { key: 'doc', label: '연관 결재문서', width: 180 },
    { key: 'author', label: '기안자', width: 100 },
    { key: 'product', label: '품목명', width: 200 },
    { key: 'spec', label: '규격', width: 150 },
    { key: 'qty', label: '신청 수량', width: 100 },
    { key: 'remarks', label: '사유/비고', width: 200 },
    { key: 'date', label: '신청일자', width: 120 },
];

const MRP_COLS = [
    { key: 'checkbox', label: '', width: 40, noResize: true },
    { key: 'name', label: '품목명', width: 200 },
    { key: 'spec', label: '규격', width: 150 },
    { key: 'type', label: '구분', width: 80 },
    { key: 'link', label: '연결번호 (수주)', width: 150 },
    { key: 'gross', label: '총 소요량 (Gross)', width: 100 },
    { key: 'stock', label: '현재 재고 (Stock)', width: 100 },
    { key: 'open', label: '발주 잔량', width: 100 },
    { key: 'net', label: '실제 발주 (Net)', width: 100 },
    { key: 'actions', label: '관리', width: 60, noResize: true },
];

const ORDER_COLS = [
    { key: 'no', label: '발주번호', width: 150 },
    { key: 'link', label: '연결 정보 (수주/재고)', width: 180 },
    { key: 'date', label: '발주일자', width: 120 },
    { key: 'partner', label: '공급사', width: 150 },
    { key: 'itemname', label: '품명', width: 200 },
    { key: 'count', label: '품목 수', width: 80 },
    { key: 'delivery', label: '납품예정일', width: 120 },
    { key: 'status', label: '상태', width: 100 },
    { key: 'actions', label: '관리', width: 250, noResize: true },
];

const PurchasePage = ({ type }) => {
    const navigate = useNavigate();
    const [tabValue, setTabValue] = useState(0);
    const [orders, setOrders] = useState([]);
    const [pendingItems, setPendingItems] = useState([]);
    const [mrpItems, setMrpItems] = useState([]); // MRP Unordered Requirements
    const [selectedPendingItems, setSelectedPendingItems] = useState([]);
    const [selectedMrpItems, setSelectedMrpItems] = useState([]);
    const [expandedOrderId, setExpandedOrderId] = useState(null);
    const [hideZeroShortage, setHideZeroShortage] = useState(false);

    const [modalOpen, setModalOpen] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [initialModalItems, setInitialModalItems] = useState([]);
    const [consumableModalOpen, setConsumableModalOpen] = useState(false);

    // 견적의뢰서/구매발주서 모달
    const [sheetModalOpen, setSheetModalOpen] = useState(false);
    const [sheetOrder, setSheetOrder] = useState(null);
    const [sheetType, setSheetType] = useState('purchase_order');

    // 첨부파일 뷰어 모달
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);
    const [viewingFileTitle, setViewingFileTitle] = useState('');
    const [viewingTargetId, setViewingTargetId] = useState(null);

    const [sourceOrderModalOpen, setSourceOrderModalOpen] = useState(false);
    const [selectedSourceOrder, setSelectedSourceOrder] = useState(null);
    const [sourceStockModalOpen, setSourceStockModalOpen] = useState(false);
    const [selectedSourceStock, setSelectedSourceStock] = useState(null);

    // Filter states
    const [searchQuery, setSearchQuery] = useState('');

    const handleResize = (setFn) => (column) => (newWidth) => {
        setFn(prev => {
            const colKeys = Object.keys(prev);
            const idx = colKeys.indexOf(column);
            if (idx < 0 || idx >= colKeys.length - 1) return { ...prev, [column]: newWidth };
            
            const rightKey = colKeys[idx + 1];
            const delta = newWidth - prev[column];
            const newRight = Math.max(50, (prev[rightKey] || 100) - delta);
            
            return { ...prev, [column]: newWidth, [rightKey]: newRight };
        });
    };
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
        if (type === 'CONSUMABLE') {
            if (tabValue === 0) fetchPendingItems();
            else if (tabValue === 1) fetchOrders();
            else fetchCompletedOrders();
        } else {
            if (tabValue === 0) fetchPendingItems();
            else if (tabValue === 1) fetchMrpItems();
            else if (tabValue === 2) fetchOrders();
            else fetchCompletedOrders();
        }
    }, [tabValue, type, searchQuery, selectedPartnerId, startDate, endDate, selectedMajorGroupId]);


    const fetchMrpItems = async () => {
        try {
            const params = { major_group_id: selectedMajorGroupId || undefined };
            const response = await api.get('/purchasing/mrp/unordered-requirements', { params });
            // Filter by type: MRP returns item_type as "PART" or "CONSUMABLE" or others
            const filteredData = response.data.filter(item =>
                type === 'CONSUMABLE' ? item.item_type === 'CONSUMABLE' : item.item_type === 'PART'
            );
            setMrpItems(filteredData);
            setSelectedMrpItems([]);
        } catch (error) {
            console.error("Failed to fetch MRP items", error);
        }
    };

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
                purchase_type: type,
                product_name: searchQuery || undefined,
                partner_id: selectedPartnerId || undefined,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                major_group_id: selectedMajorGroupId || undefined
            };

            const response = await api.get('/purchasing/purchase/orders', { params });
            setOrders(response.data.filter(o => o.status !== 'COMPLETED'));
        } catch (error) {
            console.error("Failed to fetch purchase orders", error);
        }
    };

    const fetchCompletedOrders = async () => {
        try {
            const params = { 
                status: 'COMPLETED', 
                purchase_type: type,
                product_name: searchQuery || undefined,
                partner_id: selectedPartnerId || undefined,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                major_group_id: selectedMajorGroupId || undefined
            };

            const response = await api.get('/purchasing/purchase/orders', { params });
            setOrders(response.data);
        } catch (error) {
            console.error("Failed to fetch completed orders", error);
        }
    };


    const handleApprovalSubmit = async (order) => {
        if (!window.confirm("이 발주서로 결재 요청을 진행하시겠습니까?")) return;

        const firstItemProcess = order.items?.[0]?.process_name || (type === 'CONSUMABLE' ? '소모품' : '구매자재');
        const customerName = order.related_customer_names || '재고용';
        const partnerName = order.partner?.name || '공급사미지정';

        const existingAttachments = safeParseJSON(order.attachment_file, []);

        const approvalPayload = {
            title: `(${partnerName}) - ${firstItemProcess} - ${customerName}`,
            doc_type: 'PURCHASE_ORDER',
            content: {
                order_no: order.order_no,
                partner_name: order.partner?.name,
                partner_phone: order.partner?.phone,
                partner_fax: order.partner?.fax,
                order_date: order.order_date,
                delivery_date: order.delivery_date,
                special_notes: order.note,
                items: (order.items || []).map((item, idx) => ({
                    idx: idx + 1,
                    name: item.product?.name,
                    spec: item.product?.specification || item.product?.code,
                    qty: item.quantity,
                    price: item.unit_price,
                    total: item.quantity * (item.unit_price || 0)
                })),
                colWidths: [40, 200, 120, 60, 80, 100]
            },
            attachments_to_add: existingAttachments.map(a => ({
                filename: a.name || a.filename,
                url: a.url
            })),
            reference_id: order.id,
            reference_type: 'PURCHASE'
        };

        try {
            // 결재선 데이터 미리 가져오기 (PURCHASE_ORDER 타입의 기본 결재선)
            const lineRes = await api.get('/approval/lines?doc_type=PURCHASE_ORDER');
            const customApprovers = lineRes.data.map(line => ({
                staff_id: line.approver_id || line.staff_id || line.user_id || line.id || line.approver?.id || line.value,
                sequence: line.sequence
            }));
            console.log("현재 결재자 배열 상태:", customApprovers);

            // 페이로드에 결재선 정보 포함
            const finalPayload = {
                ...approvalPayload,
                custom_approvers: customApprovers
            };

            await api.post('/approval/documents', finalPayload);
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
            const params = { major_group_id: selectedMajorGroupId || undefined };
            if (type === 'CONSUMABLE') {
                const response = await api.get('/purchasing/purchase/consumable-waits', { params });
                setPendingItems(response.data);
            } else {
                const response = await api.get('/purchasing/purchase/pending-items', { params });
                setPendingItems(response.data);
            }
            setSelectedPendingItems([]); // Reset selection on refresh
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
        if (!window.confirm("정말로 이 발주를 삭제하시겠습니까?")) return;
        try {
            await api.delete(`/purchasing/purchase/orders/${orderId}`);
            alert("삭제되었습니다.");
            handleSuccess();
        } catch (error) {
            console.error("Delete failed", error);
            alert("삭제 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleCompleteOrder = async (orderId) => {
        if (!window.confirm("이 발주건을 발주 완료(입고) 처리하시겠습니까?\n품목 재고가 자동으로 업데이트됩니다.")) return;
        try {
            await api.post(`/purchasing/purchase/orders/${orderId}/complete`);
            alert("완료(입고) 처리되었습니다.");
            handleSuccess();
        } catch (error) {
            console.error("Complete failed", error);
            alert("처리 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleDeleteAttachment = async (targetId, indexToRemove) => {
        if (!targetId) return;
        if (!window.confirm("정말로 이 첨부파일을 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)")) return;

        try {
            const order = orders.find(o => o.id === targetId);
            if (!order) {
                alert("항목을 찾을 수 없습니다.");
                return;
            }

            const currentAttachments = safeParseJSON(order.attachment_file, []);
            const newFiles = currentAttachments.filter((_, idx) => idx !== indexToRemove);

            const res = await api.put(`/purchasing/purchase/orders/${targetId}`, { attachment_file: newFiles });
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

        if (itemsToOrder.length === 1 && type !== 'CONSUMABLE') {
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
                    if (window.confirm(`동일한 수주/재고 번호(${refOrderNo}) 및 구매처(${refPartner})를 가진 미발주 품목이 ${relatedItems.length}건 더 있습니다.\n\n하나의 발주서로 묶어서 처리하시겠습니까?`)) {
                        itemsToOrder = [...itemsToOrder, ...relatedItems];
                        setSelectedPendingItems(itemsToOrder.map(i => i.id));
                    }
                }
            }
        }

        setSelectedOrder(null);
        if (type === 'CONSUMABLE') {
            // Bulk consumable ordering via standard PurchaseOrderModal
            setInitialModalItems(itemsToOrder.map(i => ({ ...i, type: 'CONSUMABLE_WAIT' })));
            setModalOpen(true);
        } else {
            setInitialModalItems(itemsToOrder.map(i => ({ ...i, type: 'PENDING' }))); // Mark as pending item
            setModalOpen(true);
        }
    };

    const handleCreateFromMRP = () => {
        if (selectedMrpItems.length === 0) return;

        // Filter out items where Net (shortage_quantity) <= 0
        const itemsWithShortage = mrpItems.filter(item => 
            selectedMrpItems.includes(item.product_id) && 
            (item.shortage_quantity || 0) > 0
        );

        if (itemsWithShortage.length === 0) {
            alert("전부 현재 재고가 충분하여 발주할 품목이 없습니다.");
            return;
        }

        const skippedCount = selectedMrpItems.length - itemsWithShortage.length;
        if (skippedCount > 0) {
            if (!window.confirm(`선택한 ${selectedMrpItems.length}개 중 ${skippedCount}개는 재고가 충분하여 제외됩니다.\n남은 ${itemsWithShortage.length}개에 대해 발주를 진행하시겠습니까?`)) {
                return;
            }
        }

        setSelectedOrder(null);
        setInitialModalItems(itemsWithShortage.map(i => ({ ...i, type: 'MRP', quantity: i.shortage_quantity }))); // Set quantity to Net
        setModalOpen(true);
    };

    const handleDeleteMrpItem = async (mrpId) => {
        if (!window.confirm("이 소요량 항목을 삭제하시겠습니까?")) return;
        try {
            await api.delete(`/purchasing/mrp/requirements/${mrpId}`);
            alert("삭제되었습니다.");
            fetchMrpItems();
        } catch (error) {
            console.error("Delete failed", error);
            alert("삭제 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleDeleteSelectedMrp = async () => {
        if (selectedMrpItems.length === 0) return;
        if (!window.confirm(`선택한 ${selectedMrpItems.length}개의 항목을 삭제하시겠습니까??`)) return;

        try {
            for (const productId of selectedMrpItems) {
                const item = mrpItems.find(i => i.product_id === productId);
                if (item && item.id) {
                    await api.delete(`/purchasing/mrp/requirements/${item.id}`);
                }
            }
            alert("삭제되었습니다.");
            fetchMrpItems();
            setSelectedMrpItems([]);
        } catch (error) {
            console.error("Batch delete failed", error);
            alert("일부 항목 삭제 실패");
            fetchMrpItems();
        }
    };

    const handleSuccess = async (newOrder) => {
        if (type === 'CONSUMABLE') {
            if (tabValue === 0) fetchPendingItems();
            else if (tabValue === 1) fetchOrders();
            else fetchCompletedOrders();

            // 소모품 발주인 경우, 결재 상신 여부 확인
            if (newOrder && newOrder.id && window.confirm("발주서가 생성되었습니다. 지금 바로 결재 요청을 진행하시겠습니까?")) {
                try {
                    // 전체 정보를 위해 다시 Fetch (items, partner 등 포함)
                    const res = await api.get(`/purchasing/purchase/orders/${newOrder.id}`);
                    handleApprovalSubmit(res.data);
                } catch (err) {
                    console.error("Failed to fetch order for approval", err);
                }
            }
        } else {
            if (tabValue === 0) fetchPendingItems();
            else if (tabValue === 1) fetchMrpItems();
            else if (tabValue === 2) fetchOrders();
            else fetchCompletedOrders();
        }
        setModalOpen(false);
        setConsumableModalOpen(false);
    };

    const handleSelectPendingItem = (id) => {
        if (selectedPendingItems.includes(id)) {
            setSelectedPendingItems(selectedPendingItems.filter(itemId => itemId !== id));
        } else {
            setSelectedPendingItems([...selectedPendingItems, id]);
        }
    };

    const handleSelectMrpItem = (productId) => {
        if (selectedMrpItems.includes(productId)) {
            setSelectedMrpItems(selectedMrpItems.filter(id => id !== productId));
        } else {
            setSelectedMrpItems([...selectedMrpItems, productId]);
        }
    };

    const handleSelectAllMrp = (event) => {
        if (event.target.checked) {
            // [Fix] Only select items currently visible by the filter
            const visibleItems = mrpItems.filter(item => !hideZeroShortage || (item.shortage_quantity > 0));
            setSelectedMrpItems(visibleItems.map(item => item.product_id));
        } else {
            setSelectedMrpItems([]);
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
                    {type === 'CONSUMABLE' ? '소모품 발주 관리' : '구매 자재 발주 관리'}
                </h1>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-700 print-safe-area">
                {(type === 'CONSUMABLE' ? [
                    '소모품 발주 대기', '발주 진행 현황', '발주 완료 이력'
                ] : [
                    '발주 대기 (Pending)', '미발주 소요량 (MRP)', '발주 현황 (Ordered)', '입고 완료 (Completed)'
                ]).map((label, index) => (
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
                {((type === 'CONSUMABLE' ? tabValue !== 0 : (tabValue === 2 || tabValue === 3))) && (
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
                            <label className="text-xs text-gray-400">공급사</label>
                            <select
                                value={selectedPartnerId || ''}
                                onChange={(e) => setSelectedPartnerId(e.target.value || null)}
                                className="w-full bg-gray-700 border-gray-600 rounded text-white px-3 py-2 text-sm h-[38px]"
                            >
                                <option value="">전체 공급사</option>
                                {partners.filter(p => p.type === 'SUPPLIER').map(p => (
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
                        columns={type === 'CONSUMABLE' ? PENDING_CONSUMABLE_COLS : PENDING_COLS}
                        className="w-full text-left text-sm"
                        theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700"
                        thClassName="px-4 py-3"
                    >
                        {pendingItems.length === 0 ? (
                            <tr><td colSpan={(type === 'CONSUMABLE' ? PENDING_CONSUMABLE_COLS : PENDING_COLS).length} className="px-4 py-12 text-center text-gray-500">발주 대기 중인 품목이 없습니다.</td></tr>
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
                                    {type === 'CONSUMABLE' ? (
                                        <>
                                            <td className="px-4 py-4 font-bold text-blue-700">{item.approval_title || '-'}</td>
                                            <td className="px-4 py-4">{item.requester_name || item.author_name || '-'} {item.department ? `(${item.department})` : ''}</td>
                                            <td className="px-4 py-4 font-bold">{item.requested_item_name || item.product?.name || '-'}</td>
                                            <td className="px-4 py-4">{item.product?.specification || item.remarks || '-'}</td>
                                            <td className="px-4 py-4">{item.quantity} {item.product?.unit || 'EA'}</td>
                                            <td className="px-4 py-4 truncate max-w-[200px]" title={item.remarks}>{item.remarks}</td>
                                            <td className="px-4 py-4 whitespace-nowrap">{item.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-4 py-4">
                                                <div className="flex items-center gap-1">
                                                    {item.plan?.order ? (
                                                        <Chip label="수주" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#e3f2fd', color: '#1976d2' }} />
                                                    ) : item.plan?.stock_production ? (
                                                        <Chip label="재고" size="small" sx={{ height: 18, fontSize: '0.6rem', bgcolor: '#fff3e0', color: '#e65100', fontWeight: 'bold' }} />
                                                    ) : null}
                                                    <span className="font-bold text-blue-700">{item.plan?.order?.order_no || item.plan?.stock_production?.production_no || '-'}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 truncate">{item.client_name || '-'}</td>
                                            <td className="px-4 py-4 truncate">{item.product_name_of_plan || '-'}</td>
                                            <td className="px-4 py-4 whitespace-nowrap">{item.process_name || '-'}</td>
                                            <td className="px-4 py-4 font-bold">{item.product?.name || '-'}</td>
                                            <td className="px-4 py-4 truncate">{item.product?.specification || '-'}</td>
                                            <td className="px-4 py-4">{item.quantity || 0}</td>
                                            <td className="px-4 py-4">{item.product?.unit || 'EA'}</td>
                                            <td className="px-4 py-4 whitespace-nowrap">{item.plan?.plan_date || '-'}</td>
                                            <td className="px-4 py-4 truncate">{item.partner_name || '-'}</td>
                                            <td className="px-4 py-4 truncate max-w-[150px]" title={item.note}>{item.note}</td>
                                        </>
                                    )}
                                </tr>
                            ))
                        )}
                    </ResizableTable>
                </>
            )}

            {type !== 'CONSUMABLE' && tabValue === 1 && (
                <>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <FormControlLabel
                            control={
                                <Switch
                                    checked={hideZeroShortage}
                                    onChange={(e) => setHideZeroShortage(e.target.checked)}
                                    color="primary"
                                />
                            }
                            label={<Typography variant="body2" sx={{ fontWeight: 'bold' }}>재고 충분(부족분 0) 항목 숨기기</Typography>}
                        />
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button
                                variant="outlined"
                                color="error"
                                startIcon={<DeleteIcon />}
                                onClick={handleDeleteSelectedMrp}
                                disabled={selectedMrpItems.length === 0}
                            >
                                선택 품목 삭제
                            </Button>
                            <Button
                                variant="contained"
                                startIcon={<AddIcon />}
                                onClick={handleCreateFromMRP}
                                disabled={selectedMrpItems.length === 0}
                            >
                                선택 품목 발주 등록
                            </Button>
                        </Box>
                    </Box>
                    <ResizableTable
                        columns={MRP_COLS}
                        className="w-full text-left text-sm"
                        theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700"
                        thClassName="px-4 py-3"
                    >
                        {mrpItems.filter(item => !hideZeroShortage || (item.shortage_quantity > 0)).length === 0 ? (
                            <tr><td colSpan={MRP_COLS.length} className="px-4 py-12 text-center text-gray-500">{mrpItems.length === 0 ? "수주 기반으로 계산된 추가 발주 필요 품목이 없습니다." : "조건에 맞는 소요량 내역이 없습니다."}</td></tr>
                        ) : (
                            mrpItems
                                .filter(item => !hideZeroShortage || (item.shortage_quantity > 0))
                                .map((item) => (
                                <tr 
                                    key={item.product_id} 
                                    className="hover:bg-gray-800/40 transition-colors cursor-pointer select-none divide-x divide-gray-700/30 text-gray-300"
                                    onClick={() => handleSelectMrpItem(item.product_id)}
                                >
                                    <td className="px-4 py-4 w-[40px]">
                                        <Checkbox checked={selectedMrpItems.includes(item.product_id)} size="small" />
                                    </td>
                                    <td className="px-4 py-4 font-bold">{item.product_name}</td>
                                    <td className="px-4 py-4 truncate">{item.specification}</td>
                                    <td className="px-4 py-4">
                                        <Chip label={item.item_type} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.6rem' }} />
                                    </td>
                                    <td className="px-4 py-4 font-medium text-gray-600">
                                        {item.sales_order_number || "-"}
                                    </td>
                                    <td className="px-4 py-4 text-right font-bold">{item.required_quantity?.toLocaleString() || '0'}</td>
                                    <td className={`px-4 py-4 text-right ${item.current_stock > 0 ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                                        {item.current_stock?.toLocaleString() || '0'}
                                    </td>
                                    <td className="px-4 py-4 text-right text-blue-600 font-bold">{item.open_purchase_qty?.toLocaleString() || '0'}</td>
                                    <td className={`px-4 py-4 text-right font-bold ${item.shortage_quantity > 0 ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}>
                                        {(item.shortage_quantity || 0).toLocaleString()}
                                    </td>
                                    <td className="px-4 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                        <IconButton size="small" color="error" onClick={() => handleDeleteMrpItem(item.id)}>
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </td>
                                </tr>
                            ))
                        )}
                    </ResizableTable>
                </>
            )}

            {(type === 'CONSUMABLE' ? (tabValue === 1 || tabValue === 2) : (tabValue === 2 || tabValue === 3)) && (
                <>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
                        {((type === 'CONSUMABLE' && tabValue === 1) || (type !== 'CONSUMABLE' && tabValue === 2)) && (
                            <Button variant="contained" startIcon={<AddIcon />} onClick={handleCreateClick}>
                                신규 발주 직접 등록
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
                            <tr><td colSpan={ORDER_COLS.length} className="px-4 py-12 text-center text-gray-500">{(type === 'CONSUMABLE' ? tabValue === 1 : tabValue === 2) ? "진행 중인 발주 내역이 없습니다." : "완료된 발주 내역이 없습니다."}</td></tr>
                        ) : (
                            orders.map((order) => (
                                <PurchaseOrderRow 
                                    key={order.id} 
                                    order={order} 
                                    type={type}
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
                                        if (type === 'CONSUMABLE') {
                                            if (tabValue === 0) fetchPendingItems();
                                            else if (tabValue === 1) fetchOrders();
                                            else fetchCompletedOrders();
                                        } else {
                                            if (tabValue === 0) fetchPendingItems();
                                            else if (tabValue === 1) fetchMrpItems();
                                            else if (tabValue === 2) fetchOrders();
                                            else fetchCompletedOrders();
                                        }
                                    }}
                                    onOpenSheet={(ord, stype) => {
                                        setSheetOrder(ord);
                                        setSheetType(stype);
                                        setSheetModalOpen(true);
                                    }}
                                    readonly={tabValue === (type === 'CONSUMABLE' ? 2 : 3)}
                                />
                            ))
                        )}
                    </ResizableTable>
                </>
            )}
                </div>
            </Card>

            <ConsumableOrderModal
                open={consumableModalOpen}
                onClose={() => setConsumableModalOpen(false)}
                onSuccess={handleSuccess}
                waitItem={initialModalItems[0]}
            />
            <PurchaseOrderModal
                isOpen={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleSuccess}
                order={selectedOrder}
                initialItems={initialModalItems}
                purchaseType={type}
            />
            <PurchaseSheetModal
                isOpen={sheetModalOpen}
                onClose={() => setSheetModalOpen(false)}
                order={sheetOrder}
                sheetType={sheetType}
                onSave={() => handleSuccess()} 
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
        </div>
    );
};

const PurchaseOrderRow = ({ order, type, expanded, onToggle, onEdit, onDelete, onComplete, onApproval, onOpenFiles, onRefresh, onOpenSheet, readonly }) => {
    return (
        <React.Fragment>
            <tr
                className={cn("hover:bg-gray-800/40 transition-colors select-none divide-x divide-gray-700/30 text-gray-300 cursor-pointer", expanded && "bg-gray-800/30")}
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
                            {order.sales_order_number ? (
                                <>
                                    {order.sales_order_number.includes('SP') ? (
                                        <span style={{ color: '#2e7d32' }}>[재고] </span>
                                    ) : (
                                        <span style={{ color: '#1976d2' }}>[수주] </span>
                                    )}
                                    {order.sales_order_number}
                                </>
                            ) : (
                                <span style={{ color: '#757575' }}>{type === 'CONSUMABLE' ? '소모품' : '재고용'}</span>
                            )}
                        </Typography>
                        <Typography variant="caption" color="textSecondary">{order.order?.partner?.name || order.related_customer_names || '-'}</Typography>
                    </Box>
                </td>
                <td className="px-4 py-4">{order.order_date}</td>
                <td className="px-4 py-4 font-bold">{order.partner?.name}</td>
                <td className="px-4 py-4 font-bold truncate">
                    {(() => {
                        const items = order.items || [];
                        if (items.length === 0) return '-';
                        const firstName = items[0]?.product?.name || '-';
                        return items.length > 1 ? `${firstName} 외 ${items.length - 1}건` : firstName;
                    })()}
                </td>
                <td className="px-4 py-4">{order.items?.length} 품목</td>
                <td className="px-4 py-4 text-orange-600 font-bold">{order.delivery_date}</td>
                <td className="px-4 py-4">
                    <Chip
                        label={order.status}
                        color={order.status === 'COMPLETED' ? "success" : order.status === 'PENDING' ? "warning" : "primary"}
                        size="small"
                        sx={{ height: 20, fontSize: '0.7rem' }}
                    />
                </td>
                <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                    <div className="flex gap-1">
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
                            <Tooltip title="발주 완료(입고)">
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
                                        id={`po-file-${order.id}`}
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
                                                await api.put(`/purchasing/purchase/orders/${order.id}`, { attachment_file: updatedFiles });
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
                                        <IconButton size="small" onClick={() => document.getElementById(`po-file-${order.id}`).click()}>
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
                        <Collapse in={expanded} timeout="auto" unmountOnExit>
                            <div className="p-4 bg-gray-900 rounded-lg border border-gray-700 mx-4 my-2">
                                <h4 className="text-sm font-semibold mb-2 text-gray-300">발주 상세 내역</h4>
                                <table className="w-full text-xs text-left text-gray-300 bg-gray-950 border border-gray-800 overflow-hidden rounded-md">
                                    <thead className="bg-gray-800/80 text-gray-400 font-semibold text-[11px] uppercase tracking-wider border-b border-gray-700">
                                     <tr>
                                             {!type || type !== 'CONSUMABLE' ? (
                                                 <th className="px-3 py-2">공정명</th>
                                             ) : null}
                                             <th className="px-3 py-2">품목명</th>
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
                                                 {!type || type !== 'CONSUMABLE' ? (
                                                     <td className="px-3 py-2">{item.process_name || '-'}</td>
                                                 ) : null}
                                                 <td className="px-3 py-2 font-bold">{item.product?.name}</td>
                                                 <td className="px-3 py-2">{item.product?.specification}</td>
                                                 <td className="px-3 py-2 text-right">{item.quantity} {item.product?.unit}</td>
                                                 <td className="px-3 py-2 text-right">{(item.unit_price || 0).toLocaleString()}</td>
                                                 <td className="px-3 py-2 text-right font-bold text-blue-900">{((item.quantity || 0) * (item.unit_price || 0)).toLocaleString()}</td>
                                                 <td className="px-3 py-2 truncate max-w-[150px]" title={item.note}>{item.note}</td>
                                             </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Collapse>
                    </td>
                </tr>
            )}
        </React.Fragment>
    );
};

export default PurchasePage;
