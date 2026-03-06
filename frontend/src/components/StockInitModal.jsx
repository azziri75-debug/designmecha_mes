import React, { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import api from '../lib/api';

const StockInitModal = ({ isOpen, onClose, onSuccess }) => {
    const [selectedType, setSelectedType] = useState('ALL'); // ALL, PRODUCT, PART
    const [products, setProducts] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [formData, setFormData] = useState({
        current_quantity: 0,
        location: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            fetchProducts(selectedType);
            setSearchTerm('');
            setSelectedProduct(null);
            setFormData({ current_quantity: 0, location: '' });
        }
    }, [isOpen, selectedType]);

    const fetchProducts = async (type) => {
        try {
            const endpoint = type === 'ALL' ? '/product/products/' : `/product/products/?item_type=${type}`;
            const res = await api.get(endpoint);
            setProducts(res.data);
        } catch (error) {
            console.error('Failed to fetch products', error);
        }
    };

    const handleSearch = (e) => {
        setSearchTerm(e.target.value);
    };

    const filteredProducts = products.filter(p =>
        (p.name?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (p.code?.toLowerCase() || '').includes(searchTerm.toLowerCase())
    );

    const handleSubmit = async () => {
        if (!selectedProduct) {
            alert("재고를 초기화할 대상을 선택해주세요.");
            return;
        }

        setLoading(true);
        try {
            await api.post(`/inventory/stocks/init?product_id=${selectedProduct.id}`, {
                current_quantity: formData.current_quantity,
                in_production_quantity: 0,
                location: formData.location
            });
            alert("초기 재고가 성공적으로 등록되었습니다.");
            onSuccess();
        } catch (error) {
            console.error("Failed to initialize stock", error);
            alert("등록 실패: " + (error.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg w-full max-w-2xl flex flex-col h-[80vh] md:h-auto max-h-[90vh]">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        초기 재고 등록
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
                    {/* Left Panel: Selection */}
                    <div className="w-full md:w-1/2 p-4 border-b md:border-b-0 md:border-r border-gray-700 flex flex-col gap-4 bg-gray-900/20">
                        <div className="flex gap-2">
                            <select
                                className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none flex-1"
                                value={selectedType}
                                onChange={(e) => setSelectedType(e.target.value)}
                            >
                                <option value="ALL">전체 품목</option>
                                <option value="PRODUCT">생산 제품</option>
                                <option value="PART">부품</option>
                            </select>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="품목명, 코드 검색..."
                                value={searchTerm}
                                onChange={handleSearch}
                                className="w-full pl-9 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar min-h-[200px]">
                            {filteredProducts.map(p => (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => setSelectedProduct(p)}
                                    className={`w-full text-left p-3 rounded-lg border transition-all ${selectedProduct?.id === p.id
                                        ? 'bg-blue-900/40 border-blue-500 text-white'
                                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                                        }`}
                                >
                                    <div className="font-bold text-sm truncate">{p.name}</div>
                                    <div className="text-xs text-gray-400 mt-1 flex justify-between">
                                        <span>{p.code}</span>
                                        <span className="bg-gray-900 px-1.5 py-0.5 rounded text-[10px] uppercase">{p.item_type}</span>
                                    </div>
                                </button>
                            ))}
                            {filteredProducts.length === 0 && (
                                <div className="text-center py-10 text-gray-500 text-sm">
                                    조건에 맞는 품목이 없습니다.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: Data input */}
                    <div className="w-full md:w-1/2 p-6 flex flex-col justify-center space-y-6">
                        {selectedProduct ? (
                            <>
                                <div className="bg-blue-900/20 p-4 rounded-xl border border-blue-500/20 mb-2">
                                    <label className="block text-xs font-bold text-blue-400 mb-2 uppercase tracking-wider">선택된 품목</label>
                                    <div className="text-lg font-bold text-white truncate">{selectedProduct.name}</div>
                                    <div className="text-sm text-gray-400 mt-1">{selectedProduct.code} {selectedProduct.specification ? `| ${selectedProduct.specification}` : ''}</div>
                                </div>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-300">초기 현재고 수량</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full bg-gray-900 border border-gray-700 rounded-lg text-white p-3 focus:ring-2 focus:ring-blue-500 outline-none text-lg font-mono font-bold"
                                                value={formData.current_quantity}
                                                onChange={(e) => setFormData({ ...formData, current_quantity: parseInt(e.target.value) || 0 })}
                                            />
                                            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500">EA</span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium text-gray-300">보관 위치 (선택 사항)</label>
                                        <input
                                            type="text"
                                            className="w-full bg-gray-900 border border-gray-700 rounded-lg text-white p-3 focus:ring-2 focus:ring-blue-500 outline-none"
                                            placeholder="예: A-101 구역"
                                            value={formData.location}
                                            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                                <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-2">
                                    <Search className="w-8 h-8 opacity-50" />
                                </div>
                                <p>초기화할 품목을 좌측에서 선택하세요.</p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-6 border-t border-gray-700 flex justify-end gap-3 bg-gray-900/50">
                    <button onClick={onClose} className="px-6 py-2.5 rounded-lg text-gray-300 hover:bg-gray-700 font-medium transition-colors">취소</button>
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-2.5 bg-blue-600 rounded-lg text-white hover:bg-blue-500 font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-900/20"
                        disabled={loading || !selectedProduct}
                    >
                        {loading ? "등록 중..." : "초기 재고 등록"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StockInitModal;
