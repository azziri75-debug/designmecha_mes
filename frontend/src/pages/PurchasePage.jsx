import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Typography, Button, Paper, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, IconButton, Tabs, Tab, Checkbox, Tooltip
} from '@mui/material';
import { Add as AddIcon, Edit as EditIcon, Print as PrintIcon, Delete as DeleteIcon, Description as DescIcon, AttachFile as AttachIcon, Send as SendIcon, CheckCircle as CheckCircleIcon } from '@mui/icons-material';
import api from '../lib/api';
import ResizableTableCell from '../components/ResizableTableCell';
import PurchaseOrderModal from '../components/PurchaseOrderModal';
import PurchaseSheetModal from '../components/PurchaseSheetModal';
import FileViewerModal from '../components/FileViewerModal';
import OrderModal from '../components/OrderModal';
import StockProductionModal from '../components/StockProductionModal';
import ConsumableOrderModal from '../components/ConsumableOrderModal';

const PurchasePage = ({ type }) => {
    const navigate = useNavigate();
    const [tabValue, setTabValue] = useState(0);
    const [orders, setOrders] = useState([]);
    const [pendingItems, setPendingItems] = useState([]);
    const [mrpItems, setMrpItems] = useState([]); // MRP Unordered Requirements
    const [selectedPendingItems, setSelectedPendingItems] = useState([]);
    const [selectedMrpItems, setSelectedMrpItems] = useState([]);
    const [expandedOrderId, setExpandedOrderId] = useState(null);

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
    const [columnWidths, setColumnWidths] = useState({
        doc: 150,
        author: 100,
        product: 200,
        spec: 150,
        qty: 100,
        remarks: 200,
        date: 120,
        order_no: 150,
        process: 100,
        unit: 80,
        partner: 120,
        client: 120,
        target_product: 200
    });

    const handleResize = (column, newWidth) => {
        setColumnWidths(prev => ({ ...prev, [column]: newWidth }));
    };
    const [selectedPartnerId, setSelectedPartnerId] = useState(null);
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [partners, setPartners] = useState([]);


    useEffect(() => {
        fetchPartners();
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
    }, [tabValue, type, searchQuery, selectedPartnerId, startDate, endDate]);


    const fetchMrpItems = async () => {
        try {
            const response = await api.get('/purchasing/mrp/unordered-requirements');
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
            const params = { purchase_type: type };
            if (searchQuery) params.product_name = searchQuery;
            if (selectedPartnerId) params.partner_id = selectedPartnerId;
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;

            const response = await api.get('/purchasing/purchase/orders', { params });
            setOrders(response.data.filter(o => o.status !== 'COMPLETED'));
        } catch (error) {
            console.error("Failed to fetch purchase orders", error);
        }
    };

    const fetchCompletedOrders = async () => {
        try {
            const params = { status: 'COMPLETED', purchase_type: type };
            if (searchQuery) params.product_name = searchQuery;
            if (selectedPartnerId) params.partner_id = selectedPartnerId;
            if (startDate) params.start_date = startDate;
            if (endDate) params.end_date = endDate;

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
            if (type === 'CONSUMABLE') {
                const response = await api.get('/purchasing/purchase/consumable-waits');
                setPendingItems(response.data);
            } else {
                const response = await api.get('/purchasing/purchase/pending-items');
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
        if (!window.confirm("이 발주건을 발주 완료(입고) 처리하시겠습니까?\n관련 소모품 재고가 자동으로 업데이트됩니다.")) return;
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

            const files = typeof order.attachment_file === 'string' ? JSON.parse(order.attachment_file) : order.attachment_file;
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== indexToRemove);

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
            setInitialModalItems(itemsToOrder);
            setConsumableModalOpen(true);
        } else {
            setInitialModalItems(itemsToOrder.map(i => ({ ...i, type: 'PENDING' }))); // Mark as pending item
            setModalOpen(true);
        }
    };

    const handleCreateFromMRP = () => {
        if (selectedMrpItems.length === 0) return;
        const itemsToOrder = mrpItems.filter(item => selectedMrpItems.includes(item.product_id));

        setSelectedOrder(null);
        setInitialModalItems(itemsToOrder.map(i => ({ ...i, type: 'MRP' }))); // Mark as MRP item
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
        if (type === 'CONSUMABLE') {
            setSelectedPendingItems(selectedPendingItems.includes(id) ? [] : [id]);
        } else {
            if (selectedPendingItems.includes(id)) {
                setSelectedPendingItems(selectedPendingItems.filter(itemId => itemId !== id));
            } else {
                setSelectedPendingItems([...selectedPendingItems, id]);
            }
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
            setSelectedMrpItems(mrpItems.map(item => item.product_id));
        } else {
            setSelectedMrpItems([]);
        }
    };

    const handleSelectAllPending = (event) => {
        if (type === 'CONSUMABLE') return;
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
        <Box sx={{ width: '100%' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                <Typography variant="h4" component="div" sx={{ fontWeight: 'bold', color: '#1a237e' }}>
                    {type === 'CONSUMABLE' ? '소모품 발주 관리' : '구매 자재 발주 관리'}
                </Typography>
            </Box>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
                <Tabs
                    value={tabValue}
                    onChange={handleTabChange}
                    sx={{
                        '& .MuiTab-root': { color: 'rgba(255, 255, 255, 0.7)' },
                        '& .Mui-selected': { color: '#fff !important' },
                    }}
                >
                    {type === 'CONSUMABLE' ? (
                        [
                            <Tab key="pending_con" label="소모품 발주 대기" />,
                            <Tab key="current_con" label="발주 진행 현황" />,
                            <Tab key="history_con" label="발주 완료 이력" />
                        ]
                    ) : (
                        [
                            <Tab key="pending" label="발주 대기 (Pending)" />,
                            <Tab key="mrp" label="미발주 소요량 (MRP)" />,
                            <Tab key="ordered" label="발주 현황 (Ordered)" />,
                            <Tab key="completed" label="입고 완료 (Completed)" />
                        ]
                    )}
                </Tabs>
            </Box>

            {/* Filter Section */}
            {((type === 'CONSUMABLE' ? tabValue !== 0 : (tabValue === 2 || tabValue === 3))) && (
                <Paper sx={{ p: 2, mb: 2, bgcolor: '#fcfcfc', border: '1px solid #eee' }}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" color="textSecondary">기간:</Typography>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
                            />
                            <span>~</span>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', fontSize: '14px' }}
                            />
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 200 }}>
                            <Typography variant="body2" color="textSecondary">공급사:</Typography>
                            <Box sx={{ flex: 1 }}>
                                <select
                                    value={selectedPartnerId || ''}
                                    onChange={(e) => setSelectedPartnerId(e.target.value || null)}
                                    style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', width: '100%', fontSize: '14px' }}
                                >
                                    <option value="">전체 공급사</option>
                                    {partners.filter(p => p.type === 'SUPPLIER').map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </Box>
                        </Box>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" color="textSecondary">품명/품번:</Typography>
                            <input
                                type="text"
                                placeholder="검색어 입력..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ padding: '6px 12px', border: '1px solid #ccc', borderRadius: '4px', minWidth: '150px', fontSize: '14px' }}
                            />
                        </Box>
                        <Button
                            size="small"
                            variant="outlined"
                            color="inherit"
                            onClick={() => {
                                setStartDate('');
                                setEndDate('');
                                setSelectedPartnerId(null);
                                setSearchQuery('');
                            }}
                        >
                            초기화
                        </Button>
                    </Box>
                </Paper>
            )}


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
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell padding="checkbox">
                                        {type !== 'CONSUMABLE' && (
                                            <Checkbox
                                                indeterminate={selectedPendingItems.length > 0 && selectedPendingItems.length < pendingItems.length}
                                                checked={pendingItems.length > 0 && selectedPendingItems.length === pendingItems.length}
                                                onChange={handleSelectAllPending}
                                            />
                                        )}
                                    </TableCell>
                                    {type === 'CONSUMABLE' ? (
                                        <>
                                            <ResizableTableCell width={columnWidths.doc} onResize={(w) => handleResize('doc', w)}>연관 결재문서</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.author} onResize={(w) => handleResize('author', w)}>기안자</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.product} onResize={(w) => handleResize('product', w)}>품목명</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.spec} onResize={(w) => handleResize('spec', w)}>규격</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.qty} onResize={(w) => handleResize('qty', w)}>신청 수량</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.remarks} onResize={(w) => handleResize('remarks', w)}>사유/비고</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.date} onResize={(w) => handleResize('date', w)}>신청일자</ResizableTableCell>
                                        </>
                                    ) : (
                                        <>
                                            <ResizableTableCell width={columnWidths.order_no} onResize={(w) => handleResize('order_no', w)}>수주/재고번호</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.client} onResize={(w) => handleResize('client', w)}>고객사</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.target_product} onResize={(w) => handleResize('target_product', w)}>생산제품명</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.process} onResize={(w) => handleResize('process', w)}>공정명</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.product} onResize={(w) => handleResize('product', w)}>구매품목명</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.spec} onResize={(w) => handleResize('spec', w)}>규격</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.qty} onResize={(w) => handleResize('qty', w)}>수량</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.unit} onResize={(w) => handleResize('unit', w)}>단위</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.date} onResize={(w) => handleResize('date', w)}>계획일자</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.partner} onResize={(w) => handleResize('partner', w)}>구매처(계획)</ResizableTableCell>
                                            <ResizableTableCell width={columnWidths.remarks} onResize={(w) => handleResize('remarks', w)}>비고</ResizableTableCell>
                                        </>
                                    )}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {pendingItems.length === 0 ? (
                                    <TableRow><TableCell colSpan={12} align="center">발주 대기 중인 품목이 없습니다.</TableCell></TableRow>
                                ) : (
                                    pendingItems?.map((item) => (
                                        <TableRow key={item?.id} hover onClick={() => handleSelectPendingItem(item?.id)} sx={{ cursor: 'pointer' }}>
                                            <TableCell padding="checkbox">
                                                <Checkbox checked={selectedPendingItems.includes(item?.id)} />
                                            </TableCell>
                                            {type === 'CONSUMABLE' ? (
                                                <>
                                                    <TableCell>
                                                        <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                                            {item?.approval_title || '-'}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell>{item?.requester_name || item?.author_name || '-'} {item?.department ? `(${item.department})` : ''}</TableCell>
                                                    <TableCell><b>{item?.requested_item_name || item?.product?.name || '-'}</b></TableCell>
                                                    <TableCell>{item?.product?.specification || item?.remarks || '-'}</TableCell>
                                                    <TableCell>{item?.quantity} {item?.product?.unit || 'EA'}</TableCell>
                                                    <TableCell>{item?.remarks}</TableCell>
                                                    <TableCell>{item?.created_at ? new Date(item.created_at).toLocaleDateString() : '-'}</TableCell>
                                                </>
                                            ) : (
                                                <>
                                                    <TableCell>
                                                        <Box>
                                                            <Typography variant="body2" sx={{ fontWeight: 'bold', color: 'primary.main' }}>
                                                                {item?.plan?.order ? (
                                                                    <Chip label="수주" size="small" variant="outlined" sx={{ mr: 0.5, height: 20, fontSize: '0.7rem', color: 'primary.main' }} />
                                                                ) : item?.plan?.stock_production ? (
                                                                    <Chip label="재고" size="small" variant="outlined" color="success" sx={{ mr: 0.5, height: 20, fontSize: '0.7rem' }} />
                                                                ) : null}
                                                                {item?.plan?.order?.order_no || item?.plan?.stock_production?.production_no || '-'}
                                                            </Typography>
                                                        </Box>
                                                    </TableCell>
                                                    <TableCell>{item?.client_name || '-'}</TableCell>
                                                    <TableCell>{item?.product_name_of_plan || '-'}</TableCell>
                                                    <TableCell>{item?.process_name || '-'}</TableCell>
                                                    <TableCell>{item?.product?.name || '-'}</TableCell>
                                                    <TableCell>{item?.product?.specification || '-'}</TableCell>
                                                    <TableCell>{item?.quantity || 0}</TableCell>
                                                    <TableCell>{item?.product?.unit || 'EA'}</TableCell>
                                                    <TableCell>{item?.plan?.plan_date || '-'}</TableCell>
                                                    <TableCell>{item.partner_name || '-'}</TableCell>
                                                    <TableCell>{item.note}</TableCell>
                                                </>
                                            )}
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            )}

            {type !== 'CONSUMABLE' && tabValue === 1 && (
                <>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2, gap: 1 }}>
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
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell padding="checkbox">
                                        <Checkbox
                                            indeterminate={selectedMrpItems.length > 0 && selectedMrpItems.length < mrpItems.length}
                                            checked={mrpItems.length > 0 && selectedMrpItems.length === mrpItems.length}
                                            onChange={handleSelectAllMrp}
                                        />
                                    </TableCell>
                                    <TableCell>규격</TableCell>
                                    <TableCell>품목명</TableCell>
                                    <TableCell>구분</TableCell>
                                    <TableCell>수주 번호</TableCell>
                                    <TableCell align="right">총 소요량</TableCell>
                                    <TableCell align="right">현재고</TableCell>
                                    <TableCell align="right">발주잔량</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 'bold', color: 'primary.main' }}>최종 발주필요</TableCell>
                                    <TableCell align="center">관리</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {mrpItems.length === 0 ? (
                                    <TableRow><TableCell colSpan={8} align="center">수주 기반으로 계산된 추가 발주 필요 품목이 없습니다.</TableCell></TableRow>
                                ) : (
                                    mrpItems.map((item) => (
                                        <TableRow key={item.product_id} hover onClick={() => handleSelectMrpItem(item.product_id)} sx={{ cursor: 'pointer' }}>
                                            <TableCell padding="checkbox">
                                                <Checkbox checked={selectedMrpItems.includes(item.product_id)} />
                                            </TableCell>
                                            <TableCell>{item.specification}</TableCell>
                                            <TableCell>{item.product_name}</TableCell>
                                            <TableCell>
                                                <Chip label={item.item_type} size="small" variant="outlined" />
                                            </TableCell>
                                            <TableCell>{item.sales_order_number || "-"}</TableCell>
                                            <TableCell align="right">{item.required_quantity?.toLocaleString() || '0'}</TableCell>
                                            <TableCell align="right">{item.current_stock?.toLocaleString() || '0'}</TableCell>
                                            <TableCell align="right">{item.open_purchase_qty?.toLocaleString() || '0'}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold', color: 'error.main' }}>{item.shortage_quantity?.toLocaleString() || '0'}</TableCell>
                                            <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                                                <Tooltip title="삭제">
                                                    <IconButton size="small" color="error" onClick={() => handleDeleteMrpItem(item.id)}>
                                                        <DeleteIcon fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
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
                    <TableContainer component={Paper}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>발주번호</TableCell>
                                    <TableCell>연결 정보 (수주/재고)</TableCell>
                                    <TableCell>발주일자</TableCell>
                                    <TableCell>공급사</TableCell>
                                    <TableCell>규격</TableCell>
                                    <TableCell>품목 수</TableCell>
                                    <TableCell>납품예정일</TableCell>
                                    <TableCell>상태</TableCell>
                                    <TableCell>관리</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {orders.length === 0 ? (
                                    <TableRow><TableCell colSpan={9} align="center">{(type === 'CONSUMABLE' ? tabValue === 1 : tabValue === 2) ? "진행 중인 발주 내역이 없습니다." : "완료된 발주 내역이 없습니다."}</TableCell></TableRow>
                                ) : (
                                    orders.map((order) => (
                                        <React.Fragment key={order.id}>
                                            <TableRow
                                                hover
                                                onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                                onDoubleClick={(e) => {
                                                    e.stopPropagation();
                                                    handleEditClick(order);
                                                }}
                                                sx={{ cursor: 'pointer', backgroundColor: expandedOrderId === order.id ? 'action.hover' : 'inherit' }}
                                            >
                                                <TableCell>{order.order_no}</TableCell>
                                                <TableCell>
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
                                                                <span style={{ color: '#757575' }}>재고용</span>
                                                            )}
                                                        </Typography>
                                                        <Typography variant="caption" color="textSecondary">{order.order?.partner?.name || order.related_customer_names || '-'}</Typography>
                                                    </Box>
                                                </TableCell>
                                                <TableCell>{order.order_date}</TableCell>
                                                <TableCell>{order.partner?.name}</TableCell>
                                                <TableCell>{order.items[0]?.product?.specification || '-'}</TableCell>
                                                <TableCell>{order.items.length} 품목</TableCell>
                                                <TableCell>{order.delivery_date}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={order.status}
                                                        color={order.status === 'COMPLETED' ? "success" : order.status === 'PENDING' ? "warning" : "primary"}
                                                        size="small"
                                                    />
                                                </TableCell>
                                                <TableCell onClick={(e) => e.stopPropagation()}>
                                                    <Tooltip title="수정">
                                                        <IconButton size="small" onClick={() => handleEditClick(order)}>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="삭제">
                                                        <IconButton size="small" color="error" onClick={() => handleDeleteOrder(order.id)}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="견적의뢰서">
                                                        <IconButton size="small" color="info" onClick={() => {
                                                            setSheetOrder(order);
                                                            setSheetType('estimate_request');
                                                            setSheetModalOpen(true);
                                                        }}>
                                                            <DescIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="구매발주서">
                                                        <IconButton size="small" color="success" onClick={() => {
                                                            setSheetOrder(order);
                                                            setSheetType('purchase_order');
                                                            setSheetModalOpen(true);
                                                        }}>
                                                            <PrintIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {order.status === 'PENDING' && (
                                                        <Tooltip title="결재요청">
                                                            <IconButton size="small" color="primary" onClick={() => handleApprovalSubmit(order)}>
                                                                <SendIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    {type === 'CONSUMABLE' && order.status !== 'COMPLETED' && (
                                                        <Tooltip title="발주 완료(입고)">
                                                            <IconButton size="small" color="success" onClick={(e) => { e.stopPropagation(); handleCompleteOrder(order.id); }}>
                                                                <CheckCircleIcon fontSize="small" />
                                                            </IconButton>
                                                        </Tooltip>
                                                    )}
                                                    {(() => {
                                                        let files = [];
                                                        try { files = order.attachment_file ? (typeof order.attachment_file === 'string' ? JSON.parse(order.attachment_file) : order.attachment_file) : []; } catch { files = []; }
                                                        if (!Array.isArray(files)) files = [];
                                                        return (
                                                            <>
                                                                {files.length > 0 && (
                                                                    <Tooltip title={`첨부파일 ${files.length}개`}>
                                                                        <IconButton size="small" onClick={() => {
                                                                            setViewingFiles(files);
                                                                            setViewingFileTitle(order.order_no);
                                                                            setViewingTargetId(order.id);
                                                                            setShowFileModal(true);
                                                                        }}>
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
                                                                            if (type === 'CONSUMABLE') {
                                                                                if (tabValue === 0) fetchOrders();
                                                                                else fetchCompletedOrders();
                                                                            } else {
                                                                                if (tabValue === 2) fetchOrders();
                                                                                else fetchCompletedOrders();
                                                                            }
                                                                        } catch (err) {
                                                                            console.error("Upload failed", err);
                                                                            alert("파일 업로드 실패");
                                                                        } finally {
                                                                            e.target.value = null;
                                                                        }
                                                                    }}
                                                                />
                                                                <Tooltip title="첨부파일 추가">
                                                                    <IconButton size="small" onClick={(e) => { e.stopPropagation(); document.getElementById(`po-file-${order.id}`).click(); }}>
                                                                        <AddIcon sx={{ fontSize: 18 }} />
                                                                    </IconButton>
                                                                </Tooltip>
                                                            </>
                                                        );
                                                    })()}
                                                </TableCell>
                                            </TableRow>
                                            {expandedOrderId === order.id && (
                                                <TableRow>
                                                    <TableCell colSpan={7} sx={{ py: 0, bgcolor: '#f5f5f5' }}>
                                                        <Box sx={{ margin: 2 }}>
                                                            <Typography variant="subtitle2" gutterBottom component="div" color="primary">
                                                                * 발주 상세 내역
                                                            </Typography>
                                                            <Table size="small" aria-label="purchases">
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell>공정명</TableCell>
                                                                        <TableCell>품목명</TableCell>
                                                                        <TableCell>규격</TableCell>
                                                                        <TableCell>수량</TableCell>
                                                                        <TableCell>단가</TableCell>
                                                                        <TableCell>금액</TableCell>
                                                                        <TableCell>비고</TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {(order.items || []).map((item) => (
                                                                        <TableRow key={item.id}>
                                                                            <TableCell>{item.process_name || '-'}</TableCell>
                                                                            <TableCell>{item.product?.name}</TableCell>
                                                                            <TableCell>{item.product?.specification}</TableCell>
                                                                            <TableCell>{item.quantity} {item.product?.unit}</TableCell>
                                                                            <TableCell>{(item.unit_price || 0).toLocaleString()}</TableCell>
                                                                            <TableCell>{((item.quantity || 0) * (item.unit_price || 0)).toLocaleString()}</TableCell>
                                                                            <TableCell>{item.note}</TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </>
            )}

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
        </Box>
    );
};

export default PurchasePage;
