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

const InventoryPage = () => {
    const [activeTab, setActiveTab] = useState('status'); // 'status', 'productions'
    const [stocks, setStocks] = useState([]);
    const [productions, setProductions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showProdModal, setShowProdModal] = useState(false);
    const [showStockEditModal, setShowStockEditModal] = useState(false);
    const [editingProduction, setEditingProduction] = useState(null);
    const [editingStock, setEditingStock] = useState(null);

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'status') {
                const res = await api.get('/inventory/stocks');
                setStocks(res.data);
            } else {
                const res = await api.get('/inventory/productions');
                setProductions(res.data);
            }
        } catch (err) {
            console.error("Fetch failed", err);
        } finally {
            setLoading(false);
        }
    };

    const filteredStocks = stocks.filter(s =>
        s.product?.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.product?.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const filteredProductions = productions.filter(p =>
        p.production_no.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.product?.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

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

            {/* Content Control */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <Input
                        placeholder="품목명, 코드 검색..."
                        className="pl-10 bg-gray-900 border-gray-800 focus:ring-blue-500"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
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
                                        <th className="px-6 py-4 font-medium">품목명</th>
                                        <th className="px-6 py-4 font-medium">코드 / 규격</th>
                                        <th className="px-6 py-4 font-medium">보관 위치</th>
                                        <th className="px-6 py-4 font-medium text-right">현재고</th>
                                        <th className="px-6 py-4 font-medium text-right">생산중</th>
                                        <th className="px-6 py-4 font-medium">최근 업데이트</th>
                                        <th className="px-6 py-4 font-medium text-right">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {filteredStocks.map((stock) => (
                                        <tr key={stock.id} className="hover:bg-gray-800/30 transition-colors">
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
                                            <td className="px-6 py-4 text-right text-lg font-bold text-white">
                                                {stock.current_quantity.toLocaleString()}
                                            </td>
                                            <td className="px-6 py-4 text-right">
                                                <span className={cn(
                                                    "font-semibold",
                                                    stock.in_production_quantity > 0 ? "text-yellow-500" : "text-gray-600"
                                                )}>
                                                    {stock.in_production_quantity.toLocaleString()}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 text-xs">
                                                {new Date(stock.updated_at).toLocaleDateString()}
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
                                            <td colSpan="7" className="px-6 py-10 text-center text-gray-500 italic">
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
                                        <th className="px-6 py-4 font-medium">관리번호</th>
                                        <th className="px-6 py-4 font-medium">품목명 / 규격</th>
                                        <th className="px-6 py-4 font-medium">거래처</th>
                                        <th className="px-6 py-4 font-medium">요청수량</th>
                                        <th className="px-6 py-4 font-medium">요청일 / 완료예정일</th>
                                        <th className="px-6 py-4 font-medium">상태</th>
                                        <th className="px-6 py-4 font-medium">비고</th>
                                        <th className="px-6 py-4 font-medium text-right">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {filteredProductions.map((p) => (
                                        <tr key={p.id} className="hover:bg-gray-800/30 transition-colors">
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
        </div>
    );
};

export default InventoryPage;
