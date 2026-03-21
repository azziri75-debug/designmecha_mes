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
    Trash2
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { cn } from '../lib/utils';
import api from '../lib/api';
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
        setColumnWidths(prev => ({ ...prev, [column]: newWidth }));
    };
    const [searchTerm, setSearchTerm] = useState('');
    const [itemType, setItemType] = useState(''); // For stocks
    const [selectedPartnerId, setSelectedPartnerId] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [statusFilter, setStatusFilter] = useState(''); // For productions
    const [partners, setPartners] = useState([]);

    const [showProdModal, setShowProdModal] = useState(false);
    const [showStockEditModal, setShowStockEditModal] = useState(false);
    const [showStockInitModal, setShowStockInitModal] = useState(false);
    const [editingProduction, setEditingProduction] = useState(null);
    const [editingStock, setEditingStock] = useState(null);


    useEffect(() => {
        fetchPartners();
    }, []);

    useEffect(() => {
        fetchData();
    }, [activeTab, searchTerm, itemType, selectedPartnerId, startDate, endDate, statusFilter]);


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
        
        // 1. Deduplicate by ID to prevent "infinite push" visual bugs
        const uniqueMap = new Map();
        stocks.forEach(s => {
            if (s.id) uniqueMap.set(s.id, s);
        });
        const uniqueList = Array.from(uniqueMap.values());

        // 2. Apply "Hide Empty" filter
        if (!hideEmpty) return uniqueList;
        
        return uniqueList.filter(s => {
            const current = Number(s.current_quantity || 0);
            const producing = Number(s.producing_total || 0);
            // Hide if both are non-positive
            return current > 0 || producing > 0;
        });
    }, [stocks, hideEmpty]);
    
    const filteredProductions = productions;


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
                                placeholder="품목명, 코드 검색..."
                                className="pl-10 bg-gray-950 border-gray-800 focus:ring-blue-500"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
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
                                <option value="PRODUCT">제품</option>
                                <option value="PART">부품</option>
                                <option value="RAW_MATERIAL">원자재</option>
                                <option value="CONSUMABLE">소모품</option>
                            </select>
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

                    <div className="w-48 flex items-center gap-2 pb-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input 
                                type="checkbox" 
                                className="sr-only peer" 
                                checked={hideEmpty}
                                onChange={(e) => setHideEmpty(e.target.checked)}
                            />
                            <div className="w-11 h-6 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                            <span className="ml-3 text-sm font-medium text-gray-300">재고 없는 품목 숨기기</span>
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
                                <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs">
                                    <tr>
                                        <ResizableTableCell width={columnWidths.type} onResize={(w) => handleResize('type', w)} className="px-6 py-4 font-medium">구분</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.product} onResize={(w) => handleResize('product', w)} className="px-6 py-4 font-medium">품목명</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.spec} onResize={(w) => handleResize('spec', w)} className="px-6 py-4 font-medium">코드 / 규격</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.loc} onResize={(w) => handleResize('loc', w)} className="px-6 py-4 font-medium">보관 위치</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.qty} onResize={(w) => handleResize('qty', w)} className="px-6 py-4 font-medium text-right">현재고</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.producing} onResize={(w) => handleResize('producing', w)} className="px-6 py-4 font-medium text-right">생산중</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.updated} onResize={(w) => handleResize('updated', w)} className="px-6 py-4 font-medium">최근 업데이트</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.actions} onResize={(w) => handleResize('actions', w)} className="px-6 py-4 font-medium text-right">관리</ResizableTableCell>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {filteredStocks.map((stock) => (
                                        <tr key={stock.id} className="hover:bg-gray-800/30 transition-colors cursor-pointer" onDoubleClick={() => handleStockEdit(stock)}>
                                            <td className="px-6 py-4">
                                                <Badge variant="outline" className="bg-gray-800 text-gray-300 border-gray-700">
                                                    {stock.product?.item_type === 'PRODUCT' ? '제품' : stock.product?.item_type === 'PART' ? '부품' : stock.product?.item_type === 'RAW_MATERIAL' ? '원자재' : stock.product?.item_type || '-'}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-white font-bold">{stock.product?.name}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-xs text-gray-300">{stock.product?.code}</div>
                                                <div className="text-xs text-gray-500">{stock.product?.specification}</div>
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
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                                                    onClick={() => handleStockEdit(stock)}
                                                >
                                                    <Pencil className="w-4 h-4 mr-2" />
                                                    수정
                                                </Button>
                                            </td>
                                        </tr>
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
                                <thead className="bg-gray-800/50 text-gray-400 uppercase text-xs">
                                    <tr>
                                        <ResizableTableCell width={columnWidths.no} onResize={(w) => handleResize('no', w)} className="px-6 py-4 font-medium">관리번호</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.product} onResize={(w) => handleResize('product', w)} className="px-6 py-4 font-medium">품목명 / 규격</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.partner} onResize={(w) => handleResize('partner', w)} className="px-6 py-4 font-medium">거래처</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.req_qty} onResize={(w) => handleResize('req_qty', w)} className="px-6 py-4 font-medium">요청수량</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.req_date} onResize={(w) => handleResize('req_date', w)} className="px-6 py-4 font-medium">요청일 / 완료예정일</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.status} onResize={(w) => handleResize('status', w)} className="px-6 py-4 font-medium">상태</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.note} onResize={(w) => handleResize('note', w)} className="px-6 py-4 font-medium">비고</ResizableTableCell>
                                        <ResizableTableCell width={columnWidths.actions} onResize={(w) => handleResize('actions', w)} className="px-6 py-4 font-medium text-right">관리</ResizableTableCell>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {filteredProductions.map((p) => (
                                        <tr key={p.id} className="hover:bg-gray-800/30 transition-colors cursor-pointer" onDoubleClick={() => handleEdit(p)}>
                                            <td className="px-6 py-4 font-mono text-blue-400">{p.production_no}</td>
                                            <td className="px-6 py-4">
                                                <div className="text-white font-medium">{p.product?.name}</div>
                                                <div className="text-xs text-gray-500">{p.product?.specification}</div>
                                            </td>
                                            <td className="px-6 py-4 text-gray-300">{p.partner?.name || '-'}</td>
                                            <td className="px-6 py-4 text-white font-semibold">{p.quantity.toLocaleString()}</td>
                                            <td className="px-6 py-4">
                                                <div className="text-gray-300">{p.request_date}</div>
                                                <div className="text-xs text-yellow-500/70">{p.target_date || '-'}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Badge className={cn(
                                                    "px-2 py-0.5",
                                                    p.status === 'COMPLETED' ? "bg-green-500/10 text-green-500 border-green-500/20" :
                                                        p.status === 'IN_PROGRESS' ? "bg-blue-500/10 text-blue-500 border-blue-500/20" :
                                                            "bg-gray-500/10 text-gray-500 border-gray-500/20"
                                                )}>
                                                    {p.status === 'COMPLETED' ? '생산완료' :
                                                        p.status === 'IN_PROGRESS' ? '생산중' : '대기'}
                                                </Badge>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 truncate max-w-[150px]">{p.note || '-'}</td>
                                            <td className="px-6 py-4 text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-blue-400 hover:text-blue-300 hover:bg-blue-900/20"
                                                        onClick={() => handleEdit(p)}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-900/20"
                                                        onClick={() => handleDelete(p.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredProductions.length === 0 && (
                                        <tr>
                                            <td colSpan="6" className="px-6 py-10 text-center text-gray-500 italic">
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
