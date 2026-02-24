import React, { useState, useEffect } from 'react';
import { X, Search, Check, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

const StockProductionModal = ({ isOpen, onClose, onSuccess }) => {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);

    const [formData, setFormData] = useState({
        quantity: 1,
        request_date: new Date().toISOString().split('T')[0],
        target_date: '',
        note: ''
    });

    useEffect(() => {
        if (isOpen) {
            fetchProducts();
            setSelectedProduct(null);
            setFormData({
                quantity: 1,
                request_date: new Date().toISOString().split('T')[0],
                target_date: '',
                note: ''
            });
        }
    }, [isOpen]);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const res = await api.get('/product/products/');
            setProducts(res.data);
        } catch (error) {
            console.error("Failed to fetch products", error);
        } finally {
            setLoading(false);
        }
    };

    const filteredProducts = products.filter(p =>
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.code.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSubmit = async () => {
        if (!selectedProduct) return alert("제품을 선택해주세요.");
        if (formData.quantity <= 0) return alert("생산 수량을 입력해주세요.");

        try {
            const payload = {
                product_id: selectedProduct.id,
                ...formData
            };
            await api.post('/inventory/productions', payload);
            alert("재고 생산 요청이 등록되었습니다.");
            onSuccess();
        } catch (error) {
            console.error("Failed to create stock production", error);
            alert("등록 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-6 border-b border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-white">신규 재고 생산 요청</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Product Selection */}
                    <div className="space-y-3">
                        <label className="block text-sm font-medium text-gray-400">1. 생산 제품 선택</label>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                            <input
                                type="text"
                                placeholder="제품명 또는 코드 검색..."
                                className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <div className="border border-gray-700 rounded-lg max-h-48 overflow-y-auto bg-gray-900/50">
                            {loading ? (
                                <div className="p-4 text-center text-gray-500 text-sm">로딩 중...</div>
                            ) : filteredProducts.length === 0 ? (
                                <div className="p-4 text-center text-gray-500 text-sm">검색 결과가 없습니다.</div>
                            ) : (
                                filteredProducts.map(product => (
                                    <button
                                        key={product.id}
                                        onClick={() => setSelectedProduct(product)}
                                        className={cn(
                                            "w-full px-4 py-2 text-left text-sm border-b border-gray-800/50 last:border-0 hover:bg-gray-800 transition-colors flex justify-between items-center",
                                            selectedProduct?.id === product.id && "bg-blue-600/20 text-blue-400"
                                        )}
                                    >
                                        <div>
                                            <div className="font-medium text-white">{product.name}</div>
                                            <div className="text-xs text-gray-500">{product.code} | {product.specification}</div>
                                        </div>
                                        {selectedProduct?.id === product.id && <Check className="w-4 h-4" />}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Quantity and Dates */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">2. 생산 요청 수량</label>
                            <input
                                type="number"
                                className="w-full bg-gray-700 border-gray-600 rounded text-white p-2.5"
                                value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium text-gray-400">3. 완료 예정일</label>
                            <input
                                type="date"
                                className="w-full bg-gray-700 border-gray-600 rounded text-white p-2.5"
                                value={formData.target_date}
                                onChange={(e) => setFormData({ ...formData, target_date: e.target.value })}
                            />
                        </div>
                    </div>

                    {/* Note */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-400">4. 비고</label>
                        <textarea
                            className="w-full bg-gray-700 border-gray-600 rounded text-white p-2.5 h-24"
                            placeholder="특이사항을 입력하세요."
                            value={formData.note}
                            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
                        />
                    </div>
                </div>

                <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-lg text-gray-300 hover:bg-gray-700">취소</button>
                    <button
                        onClick={handleSubmit}
                        className="px-6 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-500 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!selectedProduct}
                    >
                        재고 생산 요청
                    </button>
                </div>
            </div>
        </div>
    );
};

export default StockProductionModal;
