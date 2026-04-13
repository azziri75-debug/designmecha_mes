import React, { useState, useEffect } from 'react';
import {
    Boxes,
    Plus,
    Search,
    History,
    AlertCircle,
    CheckCircle2,
    Clock,
    Filter,
    ArrowUpRight,
    ArrowDownLeft,
    Pencil,
    Trash2,
    Layers,
    ChevronDown,
    ChevronRight,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import api from '../lib/api';
import Select from 'react-select';
import StockProductionModal from '../components/StockProductionModal';
import StockEditModal from '../components/StockEditModal';
import StockInitModal from '../components/StockInitModal';
import ResizableTableCell from '../components/ResizableTableCell';

const InventoryPage = () => {
    const [activeTab, setActiveTab] = useState('status'); // 'status', 'productions'
    const [stocks, setStocks] = useState([]);
    const [productions, setProductions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [columnWidths, setColumnWidths] = useState({
        type: 100,
        product: 200,
        spec: 150,
        partner_stock: 120,
        loc: 120,
        qty: 100,
        producing: 120,
        updated: 120,
        actions: 100,
        // Production history
        no: 150,
        partner: 150,
        req_qty: 100,
        req_date: 180,
        status: 100,
        note: 150
    });

    const handleResize = (column, newWidth) => {
        setColumnWidths(prev => {
            const colKeys = Object.keys(prev);
            const idx = colKeys.indexOf(column);
            if (idx < 0 || idx >= colKeys.length - 1) return { ...prev, [column]: newWidth };
            const rightKey = colKeys[idx + 1];
            const delta = newWidth - prev[column];
            const newRight = Math.max(40, (prev[rightKey] || 80) - delta);
            if (newRight < 40) return prev;
            return { ...prev, [column]: newWidth, [rightKey]: newRight };
        });
    };
    const [searchTerm, setSearchTerm] = useState('');
    const [itemType, setItemType] = useState(''); // For stocks
    const [selectedPartnerId, setSelectedPartnerId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState(''); // For productions
    const [majorGroupId, setMajorGroupId] = useState('');
    const [partners, setPartners] = useState([]);
    const [groups, setGroups] = useState([]);

    const [showProdModal, setShowProdModal] = useState(false);
    const [showStockEditModal, setShowStockEditModal] = useState(false);
    const [showStockInitModal, setShowStockInitModal] = useState(false);
    const [editingProduction, setEditingProduction] = useState(null);
    const [editingStock, setEditingStock] = useState(null);

    const [expandedGroup, setExpandedGroup] = useState(null);

    // BOM Expand States
    const [expandedProductId, setExpandedProductId] = useState(null);
    const [bomStockData, setBomStockData] = useState([]);
    const [isBomLoading, setIsBomLoading] = useState(false);

    const toggleBOM = async (productId) => {
        if (expandedProductId === productId) {
            setExpandedProductId(null);
            setBomStockData([]);
        } else {
            setExpandedProductId(productId);
            setIsBomLoading(true);
            try {
                const res = await api.get(`/inventory/bom-stock/${productId}`);
                setBomStockData(res.data);
            } catch (err) {
                console.error("BOM stock fetch failed", err);
                setBomStockData([]);
            } finally {
                setIsBomLoading(true); // Small delay feel or keep it loading
                setTimeout(() => setIsBomLoading(false), 300);
            }
        }
    };


    useEffect(() => {
        fetchPartners();
        fetchGroups();
    }, []);

    useEffect(() => {
        fetchData();
    }, [activeTab, searchTerm, itemType, selectedPartnerId, startDate, endDate, statusFilter, majorGroupId]);

    const fetchGroups = async () => {
        try {
            const res = await api.get('/product/groups/');
            setGroups(res.data.filter(g => g.type === 'MAJOR') || []);
        } catch (err) {
            console.error("Fetch groups failed", err);
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

    const fetchData = async () => {
        setLoading(true);
        try {
            const params = {};
            if (searchTerm) params.product_name = searchTerm;
            if (selectedPartnerId) params.partner_id = selectedPartnerId;
            if (majorGroupId) params.major_group_id = majorGroupId;

            if (activeTab === 'status') {
                if (itemType) params.item_type = itemType;
                const res = await api.get('/inventory/stocks', { params });
                setStocks(res.data);
            } else {
                if (startDate) params.start_date = startDate;
                if (endDate) params.end_date = endDate;
                if (statusFilter) params.status = statusFilter;
                const res = await api.get('/inventory/productions', { params });
                setProductions(res.data);
            }
        } catch (err) {
            console.error("Fetch failed", err);
        } finally {
            setLoading(false);
        }
    };


    const [hideEmpty, setHideEmpty] = useState(false);

    const filteredStocks = React.useMemo(() => {
        if (!Array.isArray(stocks)) return [];
        
        // 1. Deduplicate by product_id (9 vs 6 items bug fix)
        // Using product_id is more reliable as Stock 'id' is 0 for items without stock records
        const uniqueMap = new Map();
        stocks.forEach(s => {
            if (s.product_id) {
                uniqueMap.set(s.product_id, s);
            }
        });
        const uniqueList = Array.from(uniqueMap.values());

        // 2. Apply "Hide Empty" filter
        if (!hideEmpty) return uniqueList;
        
        return uniqueList.filter(s => {
            const current = Number(s.current_quantity || 0);
            const producing = Number(s.producing_total || 0);
            // Hide only if both are exactly zero
            return current > 0 || producing > 0;
        });
    }, [stocks, hideEmpty]);
    
    // 재고생산 내역 그룹화: batch_no 기준 (다중등록 시 첫 번째 production_no 공유)
    const groupedProductions = React.useMemo(() => {
        const groups = new Map();
        productions.forEach(p => {
            // batch_no가 있으면 그 기준으로, 없으면 production_no로 단독 그룹
            const key = p.batch_no || p.production_no;
            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    batch_no: key,
                    request_date: p.request_date,
                    partner: p.partner,
                    items: []
                });
            }
            groups.get(key).items.push(p);
        });
        return Array.from(groups.values());
    }, [productions]);

    const filteredProductions = productions;

    const selectStyles = {
        control: (base) => ({
            ...base,
            backgroundColor: '#030712',
            borderColor: '#1f2937',
            color: 'white',
            fontSize: '0.875rem',
            minHeight: '40px',
            height: '40px',
            borderRadius: '0.375rem',
            boxShadow: 'none',
            '&:hover': {
                borderColor: '#3b82f6'
            }
        }),
        input: (base) => ({ ...base, color: 'white', margin: 0, paddingBottom: 0, paddingTop: 0 }),
        valueContainer: (base) => ({ ...base, padding: '0 8px' }),
        menu: (base) => ({ ...base, backgroundColor: '#030712', border: '1px solid #1f2937', zIndex: 9999 }),
        option: (base, { isFocused, isSelected }) => ({
            ...base,
            backgroundColor: isSelected ? '#2563eb' : isFocused ? '#1f2937' : '#030712',
            color: 'white',
            fontSize: '0.875rem',
            cursor: 'pointer'
        }),
        singleValue: (base) => ({ ...base, color: 'white' }),
        placeholder: (base) => ({ ...base, color: '#9ca3af' }),
        noOptionsMessage: (base) => ({ ...base, color: '#9ca3af', fontSize: '0.875rem' }),
    };


    const handleEdit = (prod) => {
        setEditingProduction(prod);
        setShowProdModal(true);
    };

    const handleStockEdit = (stock) => {
        setEditingStock(stock);
        setShowStockEditModal(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm("정말 이 생산 요청을 삭제하시겠습니까? 관련 재고 정보가 롤백됩니다.")) return;
        try {
            await api.delete(`/inventory/productions/${id}`);
            alert("삭제되었습니다.");
            fetchData();
        } catch (err) {
            console.error("Delete failed", err);
            alert("삭제 실패: " + (err.response?.data?.detail || err.message));
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Boxes className="w-6 h-6 text-blue-500" />
                        재고 및 재고생산 관리
                    </h2>
                    <p className="text-gray-400">품목별 현재고 현황 및 계획 생산 요청을 관리합니다.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={fetchData} size="sm">
                        새로고침
                    </Button>
                    <Button
                        className="bg-blue-600 hover:bg-blue-700 text-white"
                        size="sm"
                        onClick={() => {
                            setEditingProduction(null);
                            setShowProdModal(true);
                        }}
                    >
                        <Plus className="w-4 h-4 mr-2" />
                        재고 생산 요청
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-800">
                <button
                    onClick={() => setActiveTab('status')}
                    className={cn(
                        "px-6 py-3 text-sm font-medium transition-colors relative",
                        activeTab === 'status' ? "text-blue-500" : "text-gray-400 hover:text-gray-200"
                    )}
                >
                    재고 현황
                    {activeTab === 'status' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
                </button>
                <button
                    onClick={() => setActiveTab('productions')}
                    className={cn(
                        "px-6 py-3 text-sm font-medium transition-colors relative",
                        activeTab === 'productions' ? "text-blue-500" : "text-gray-400 hover:text-gray-200"
                    )}
                >
                    재고 생산 내역
                    {activeTab === 'productions' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />}
                </button>
            </div>

            {/* Content Control & Filters */}
            <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-800 space-y-4">
                <div className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[240px]">
                        <label className="text-xs text-gray-500 mb-1 block">품목 검색</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <Input
                                placeholder="품목명, 규격 검색..."
                                className="pl-10 bg-gray-950 border-gray-800 focus:ring-blue-500"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="w-48">
                        <label className="text-xs text-gray-500 mb-1 block">사업부</label>
                        <div className="relative">
                            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <select
                                className="w-full bg-gray-950 border-gray-800 rounded-md text-sm pl-10 pr-3 py-2 text-white h-10 focus:ring-blue-500 appearance-none"
                                value={majorGroupId}
                                onChange={(e) => setMajorGroupId(e.target.value)}
                            >
                                <option value="">전체 사업부</option>
                                {groups.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {activeTab === 'status' && (
                        <div className="w-40">
                            <label className="text-xs text-gray-500 mb-1 block">구분</label>
                            <select
                                className="w-full bg-gray-950 border-gray-800 rounded-md text-sm px-3 py-2 text-white h-10 focus:ring-blue-500"
                                value={itemType}
                                onChange={(e) => setItemType(e.target.value)}
                            >
                                <option value="">전체</option>
                                <option value="PRODUCED">제품</option>
                                <option value="PART">부품</option>
                                <option value="RAW_MATERIAL">원자재</option>
                            </select>
                        </div>
                    )}

                    {activeTab === 'status' && (
                        <div className="w-56">
                            <label className="text-xs text-gray-500 mb-1 block">고객사</label>
                            <Select
                                options={[{ value: '', label: '전체 고객사' }, ...partners.map(p => ({ value: p.id, label: p.name }))]}
                                value={selectedPartnerId ? { value: selectedPartnerId, label: partners.find(p => p.id == selectedPartnerId)?.name } : { value: '', label: '전체 고객사' }}
                                onChange={(option) => setSelectedPartnerId(option ? option.value : '')}
                                placeholder="고객사 선택/검색..."
                                isClearable={false}
                                styles={selectStyles}
                                className="react-select-container"
                                classNamePrefix="react-select"
                                noOptionsMessage={() => "검색 결과가 없습니다"}
                            />
                        </div>
                    )}

                    {activeTab === 'productions' && (
                        <>
                            <div className="w-40">
                                <label className="text-xs text-gray-500 mb-1 block">상태</label>
                                <select
                                    className="w-full bg-gray-950 border-gray-800 rounded-md text-sm px-3 py-2 text-white h-10 focus:ring-blue-500"
                                    value={statusFilter}
                                    onChange={(e) => setStatusFilter(e.target.value)}
                                >
                                    <option value="">전체 (Status)</option>
                                    <option value="PENDING">대기</option>
                                    <option value="IN_PROGRESS">생산중</option>
                                    <option value="COMPLETED">생산완료</option>
                                </select>
                            </div>
                            <div className="w-40">
                                <label className="text-xs text-gray-500 mb-1 block">시작일</label>
                                <Input
                                    type="date"
                                    className="bg-gray-950 border-gray-800"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                />
                            </div>
                            <div className="w-40">
                                <label className="text-xs text-gray-500 mb-1 block">종료일</label>
                                <Input
                                    type="date"
                                    className="bg-gray-950 border-gray-800"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                />
                            </div>
                        </>
                    )}

                    <div className="flex-shrink-0 flex items-center gap-2 pb-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={hideEmpty}
                                onChange={(e) => setHideEmpty(e.target.checked)}
                            />
                            <div className="relative w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            <span className="ml-3 text-sm font-medium text-gray-300 whitespace-nowrap">재고 없는 품목 숨기기</span>
                        </label>
                    </div>

                    <div className="w-40">
                        <Button
                            variant="ghost"
                            className="text-gray-500 hover:text-white"
                            onClick={() => {
                                setSearchTerm('');
                                setItemType('');
                                setSelectedPartnerId('');
                                setStartDate('');
                                setEndDate('');
                                setStatusFilter('');
                                setMajorGroupId('');
                                setHideEmpty(false);
                            }}
                        >
                            필터 초기화
                        </Button>
                    </div>
                </div>
            </div>


            {loading ? (
                <div className="py-20 text-center">
                    <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto" />
                    <p className="text-gray-500 mt-4">데이터를 불러오는 중입니다...</p>
                </div>
            ) : activeTab === 'status' ? (
                <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700">
                                    <tr>
                                        <ResizableTableCell width={columnWidths.type} onResize={(w) => handleResize('type', w)} className="px-6 py-4 font-medium">구분</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.product} onResize={(w) => handleResize('product', w)} className="px-6 py-4 font-medium">품목명</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.spec} onResize={(w) => handleResize('spec', w)} className="px-6 py-4 font-medium">코드 / 규격</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.partner_stock} onResize={(w) => handleResize('partner_stock', w)} className="px-6 py-4 font-medium">고객사</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.loc} onResize={(w) => handleResize('loc', w)} className="px-6 py-4 font-medium">보관 위치</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.qty} onResize={(w) => handleResize('qty', w)} className="px-6 py-4 font-medium text-right">현재고</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.producing} onResize={(w) => handleResize('producing', w)} className="px-6 py-4 font-medium text-right">생산중</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.updated} onResize={(w) => handleResize('updated', w)} className="px-6 py-4 font-medium">최근 업데이트</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.actions} onResize={(w) => handleResize('actions', w)} className="px-6 py-4 font-medium text-right">관리</ResizableTableCell>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {filteredStocks.map((stock) => (
                                        <React.Fragment key={stock.product_id}>
                                            <tr 
                                                className="hover:bg-gray-800/40 transition-colors border-b border-gray-700 text-gray-300 cursor-pointer" 
                                                onDoubleClick={() => handleStockEdit(stock)}
                                                onClick={() => toggleBOM(stock.product_id)}
                                            >
                                                <td className="px-6 py-4">
                                                    <Badge variant="outline" className="bg-gray-800 text-gray-300 border-gray-700">
                                                        {stock.product?.item_type === 'PRODUCED' || stock.product?.item_type === 'PRODUCT' ? '제품' : 
                                                         stock.product?.item_type === 'PART' ? '부품' : 
                                                         stock.product?.item_type === 'RAW_MATERIAL' ? '원자재' : stock.product?.item_type || '-'}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-2">
                                                        <div className="text-white font-bold">{stock.product?.name}</div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-xs text-gray-300">{stock.product?.code}</div>
                                                    <div className="text-xs text-gray-500">{stock.product?.specification}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-300 truncate max-w-[120px]" title={partners.find(p => p.id === stock.product?.partner_id)?.name || ''}>
                                                        {partners.find(p => p.id === stock.product?.partner_id)?.name || '-'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge variant="outline" className="bg-blue-500/10 text-blue-400 border-blue-500/20">
                                                        {stock.location || '기본창고'}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="text-lg font-bold text-white">
                                                        {stock.current_quantity.toLocaleString()}
                                                    </div>
                                                    <div className="text-[10px] text-gray-500">물리적 실재고</div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    {stock.producing_total > 0 ? (
                                                        <div className="flex flex-col items-end gap-1">
                                                            <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 font-bold text-sm px-3">
                                                                + {stock.producing_total.toLocaleString()}
                                                            </Badge>
                                                            <div className="text-[10px] text-gray-400 flex items-center gap-1">
                                                                <span className="w-1 h-1 rounded-full bg-blue-500"></span>
                                                                수주: {stock.producing_so || 0} / 재고: {stock.producing_sp || 0}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-gray-600 font-medium">-</div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 text-gray-500 text-xs">
                                                    {stock.updated_at ? new Date(stock.updated_at).toLocaleDateString() : '-'}
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex items-center justify-end gap-1">
                                                        {stock.has_bom && (stock.product?.item_type === 'PRODUCED' || stock.product?.item_type === 'PRODUCT') && (
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className={cn(
                                                                    "h-8 transition-all",
                                                                    expandedProductId === stock.product_id 
                                                                        ? "bg-blue-600 text-white" 
                                                                        : "text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                                                                )}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    toggleBOM(stock.product_id);
                                                                }}
                                                                title="BOM 재고 현황 보기"
                                                            >
                                                                <Layers className="w-4 h-4 mr-2" />
                                                                BOM재고
                                                            </Button>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="h-8 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleStockEdit(stock);
                                                            }}
                                                        >
                                                            <Pencil className="w-4 h-4 mr-2" />
                                                            수정
                                                        </Button>
                                                    </div>
                                                </td>
                                            </tr>
                                            {/* BOM Stock Expanded View */}
                                            {expandedProductId === stock.product_id && (
                                                <tr className="bg-blue-900/5 transition-all">
                                                    <td colSpan="9" className="px-8 py-4">
                                                        <div className="bg-gray-950 rounded-xl border border-blue-500/30 p-4 shadow-2xl relative overflow-hidden">
                                                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                                                            <div className="flex items-center justify-between mb-4">
                                                                <div className="flex items-center gap-2">
                                                                    <Layers className="w-4 h-4 text-blue-400" />
                                                                    <h4 className="text-sm font-bold text-blue-400">BOM 구성품 및 자재 재고 현황</h4>
                                                                    <span className="text-[10px] text-gray-500 ml-2">부품 재고를 기준으로 생산 가능 수량을 산출합니다.</span>
                                                                </div>
                                                                <button onClick={() => setExpandedProductId(null)} className="text-gray-500 hover:text-white">
                                                                    <AlertCircle className="w-4 h-4 rotate-45" />
                                                                </button>
                                                            </div>

                                                            {isBomLoading ? (
                                                                <div className="py-8 text-center">
                                                                    <div className="animate-spin w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
                                                                    <p className="text-xs text-gray-500">BOM 정보를 불러오는 중...</p>
                                                                </div>
                                                            ) : bomStockData.length > 0 ? (
                                                                <div className="overflow-hidden rounded-lg border border-gray-800">
                                                                    <table className="w-full text-xs text-left">
                                                                        <thead className="bg-gray-900 text-gray-500">
                                                                            <tr>
                                                                                <th className="px-4 py-2 font-medium">구분</th>
                                                                                <th className="px-4 py-2 font-medium">부품/자재명</th>
                                                                                <th className="px-4 py-2 font-medium">규격</th>
                                                                                <th className="px-4 py-2 font-medium text-right">소요량(1EA당)</th>
                                                                                <th className="px-4 py-2 font-medium text-right">현재고</th>
                                                                                <th className="px-4 py-2 font-medium text-right text-blue-400 font-bold">생산 가능 수량</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-800 bg-gray-950/30">
                                                                            {bomStockData.map((child, idx) => {
                                                                                const maxProducible = child.required_quantity > 0 
                                                                                    ? Math.floor(child.current_stock / child.required_quantity)
                                                                                    : 0;
                                                                                
                                                                                return (
                                                                                    <tr key={idx} className="hover:bg-gray-900 transition-colors">
                                                                                        <td className="px-4 py-2.5">
                                                                                            <Badge variant="outline" className="text-[10px] py-0 bg-gray-900">
                                                                                                {child.child_type === 'PART' ? '부품' : '원자재'}
                                                                                            </Badge>
                                                                                        </td>
                                                                                        <td className="px-4 py-2.5 font-medium text-gray-200">{child.child_name}</td>
                                                                                        <td className="px-4 py-2.5 text-gray-500">{child.child_spec || '-'}</td>
                                                                                        <td className="px-4 py-2.5 text-right font-mono text-gray-400">{child.required_quantity} {child.unit}</td>
                                                                                        <td className="px-4 py-2.5 text-right font-bold text-gray-300">{child.current_stock.toLocaleString()}</td>
                                                                                        <td className="px-4 py-2.5 text-right">
                                                                                            <Badge className={cn(
                                                                                                "font-bold",
                                                                                                maxProducible <= 0 ? "bg-red-500/10 text-red-500 border-red-500/20" :
                                                                                                maxProducible < 10 ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20" :
                                                                                                "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                                                                            )}>
                                                                                                {maxProducible.toLocaleString()} EA 가능
                                                                                            </Badge>
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            })}
                                                                        </tbody>
                                                                    </table>
                                                                    <div className="bg-blue-900/10 px-4 py-2 border-t border-gray-800 flex justify-between items-center">
                                                                        <span className="text-[10px] text-blue-400 font-medium">전체 구성품 요약 현황</span>
                                                                        <div className="flex items-center gap-3">
                                                                            <span className="text-[11px] text-gray-400">최대 생산 가능(병목 기준):</span>
                                                                            <span className="text-sm font-bold text-emerald-400">
                                                                                {Math.min(...bomStockData.map(c => c.required_quantity > 0 ? Math.floor(c.current_stock / c.required_quantity) : 999999999)).toLocaleString()} EA
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="py-8 text-center text-gray-600 italic text-xs">
                                                                    등록된 BOM 정보가 없거나 가져올 수 없습니다.
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                    {filteredStocks.length === 0 && (
                                        <tr>
                                            <td colSpan="8" className="px-6 py-10 text-center text-gray-500 italic">
                                                재고 내역이 없습니다.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <Card className="bg-gray-900 border-gray-800">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700">
                                    <tr>
                                        <ResizableTableCell width={columnWidths.no} onResize={(w) => handleResize('no', w)} className="px-6 py-4 font-medium">관리번호</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.product} onResize={(w) => handleResize('product', w)} className="px-6 py-4 font-medium">품목명 / 규격</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.partner} onResize={(w) => handleResize('partner', w)} className="px-6 py-4 font-medium">거래처</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.req_qty} onResize={(w) => handleResize('req_qty', w)} className="px-6 py-4 font-medium">요청수량</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.req_date} onResize={(w) =                                 <tbody className="divide-y divide-gray-800">
                                    {groupedProductions.map((grp) => {
                                        const isMulti = grp.items.length > 1;
                                        const isExpanded = expandedGroup === grp.key;
                                        const totalQty = grp.items.reduce((s, p) => s + (p.quantity || 0), 0);

                                        return (
                                            <React.Fragment key={grp.key}>
                                                {/* 그룹 행 */}
                                                <tr
                                                    className={cn(
                                                        "hover:bg-gray-800/40 transition-colors border-b border-gray-700 text-gray-300 cursor-pointer",
                                                        isExpanded && "bg-gray-800/30"
                                                    )}
                                                    onClick={() => isMulti && setExpandedGroup(isExpanded ? null : grp.key)}
                                                    onDoubleClick={() => !isMulti && handleEdit(grp.items[0])}
                                                >
                                                    <td className="px-6 py-4 font-mono text-blue-400">
                                                        <div className="flex items-center gap-2">
                                                            {isMulti ? (
                                                                <>
                                                                    {isExpanded
                                                                        ? <ChevronDown className="w-3.5 h-3.5 text-blue-400" />
                                                                        : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
                                                                    }
                                                                    <span className="text-blue-300 text-xs">{grp.batch_no}</span>
                                                                    <span className="text-[10px] bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded px-1">{grp.items.length}건</span>
                                                                </>
                                                            ) : (
                                                                <span>{grp.items[0].production_no}</span>
                                                            )}

                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {isMulti ? (
                                                            <div className="text-gray-400 text-xs italic">
                                                                {grp.items[0].product?.name} 외 {grp.items.length - 1}건
                                                            </div>
                                                        ) : (
                                                            <>
                                                                <div className="text-white font-medium">{grp.items[0].product?.name}</div>
                                                                <div className="text-xs text-gray-500">{grp.items[0].product?.specification}</div>
                                                            </>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-300">{grp.partner?.name || '-'}</td>
                                                    <td className="px-6 py-4 text-white font-semibold">
                                                        {isMulti ? `${totalQty.toLocaleString()} (합계)` : grp.items[0].quantity?.toLocaleString()}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="text-gray-300">{grp.request_date}</div>
                                                        {!isMulti && <div className="text-xs text-yellow-500/70">{grp.items[0].target_date || '-'}</div>}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {!isMulti && (
                                                            <Badge className={cn(
                                                                "px-2 py-0.5",
                                                                grp.items[0].status === 'COMPLETED' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                                                grp.items[0].status === 'IN_PROGRESS' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                                                "bg-gray-500/10 text-gray-500 border-gray-500/20"
                                                            )}>
                                                                {grp.items[0].status === 'COMPLETED' ? '생산완료' :
                                                                 grp.items[0].status === 'IN_PROGRESS' ? '생산중' : '대기'}
                                                            </Badge>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-500 truncate max-w-[150px]">
                                                        {!isMulti && (grp.items[0].note || '-')}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {!isMulti && (
                                                            <div className="flex justify-end gap-2">
                                                                <Button variant="ghost" size="icon"
                                                                    className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                                                                    onClick={(e) => { e.stopPropagation(); handleEdit(grp.items[0]); }}>
                                                                    <Pencil className="h-4 w-4" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon"
                                                                    className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(grp.items[0].id); }}>
                                                                    <Trash2 className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>

                                                {/* 그룹 펼침: 품목별 상세 행 */}
                                                {isMulti && isExpanded && grp.items.map((p) => (
                                                    <tr key={p.id} className="bg-gray-900/60 border-b border-gray-800 text-gray-400 text-xs">
                                                        <td className="px-6 py-3 pl-12 font-mono text-blue-300/70">{p.production_no}</td>
                                                        <td className="px-6 py-3">
                                                            <div className="text-gray-200 font-medium">{p.product?.name}</div>
                                                            <div className="text-gray-600">{p.product?.specification}</div>
                                                        </td>
                                                        <td className="px-6 py-3">-</td>
                                                        <td className="px-6 py-3 text-white font-semibold">{p.quantity?.toLocaleString()}</td>
                                                        <td className="px-6 py-3">
                                                            <div className="text-gray-400">{p.request_date}</div>
                                                            <div className="text-yellow-500/60">{p.target_date || '-'}</div>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            <Badge className={cn(
                                                                "px-2 py-0.5 text-[10px]",
                                                                p.status === 'COMPLETED' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                                                p.status === 'IN_PROGRESS' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                                                "bg-gray-500/10 text-gray-500 border-gray-500/20"
                                                            )}>
                                                                {p.status === 'COMPLETED' ? '완료' : p.status === 'IN_PROGRESS' ? '생산중' : '대기'}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-6 py-3 text-gray-600 truncate">{p.note || '-'}</td>
                                                        <td className="px-6 py-3 text-right">
                                                            <div className="flex justify-end gap-1">
                                                                <Button variant="ghost" size="icon"
                                                                    className="h-7 w-7 text-blue-400 hover:bg-blue-900/20"
                                                                    onClick={(e) => { e.stopPropagation(); handleEdit(p); }}>
                                                                    <Pencil className="h-3 w-3" />
                                                                </Button>
                                                                <Button variant="ghost" size="icon"
                                                                    className="h-7 w-7 text-red-400 hover:bg-red-900/20"
                                                                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}>
                                                                    <Trash2 className="h-3 w-3" />
                                                                </Button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </React.Fragment>
                                        );
                                    })}
                                    {groupedProductions.length === 0 && (
                                        <tr>
                                            <td colSpan="8" className="px-6 py-10 text-center text-gray-500 italic">
                                                생산 요청 내역이 없습니다.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}
            <StockProductionModal
                isOpen={showProdModal}
                onClose={() => {
                    setShowProdModal(false);
                    setEditingProduction(null);
                }}
                initialData={editingProduction}
                onSuccess={() => {
                    setShowProdModal(false);
                    setEditingProduction(null);
                    fetchData();
                    setActiveTab('productions');
                }}
            />
            <StockEditModal
                isOpen={showStockEditModal}
                onClose={() => {
                    setShowStockEditModal(false);
                    setEditingStock(null);
                }}
                initialData={editingStock}
                onSuccess={() => {
                    setShowStockEditModal(false);
                    setEditingStock(null);
                    fetchData();
                }}
            />
            <StockInitModal
                isOpen={showStockInitModal}
                onClose={() => setShowStockInitModal(false)}
                onSuccess={() => {
                    setShowStockInitModal(false);
                    fetchData();
                }}
            />
        </div>
    );
};

export default InventoryPage;
