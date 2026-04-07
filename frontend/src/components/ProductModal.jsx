import React, { useState, useEffect } from 'react';
import { X, Package, Upload, FileText, Trash2, Save } from 'lucide-react';
import CreatableSelect from 'react-select/creatable';
import api from '../lib/api';
import { cn, safeParseJSON } from '../lib/utils';

const ProductModal = ({ 
    isOpen, 
    onClose, 
    onSuccess, 
    initialData = {}, 
    type = 'CONSUMABLE' // Default to CONSUMABLE as per pilot request
}) => {
    const [productFormData, setProductFormData] = useState({});
    const [partners, setPartners] = useState([]);
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setProductFormData({
                item_type: type,
                unit: 'EA',
                ...initialData
            });
            
            // Explicitly sync name if provided (User requested specific pre-fill fix)
            if (initialData?.name) {
                setProductFormData(prev => ({ ...prev, name: initialData.name }));
            }

            fetchPartners();
            fetchGroups();
        } else {
            setProductFormData({});
        }
    }, [isOpen, initialData, type]);

    const fetchPartners = async () => {
        try {
            // 거래처 타입(CUSTOMER, SUPPLIER 등) 필터링 해제: 
            // 실무상 사용자들이 거래처를 등록할 때 유형을 정확히 지정하지 않거나 복합적인 경우가 많아 검색 실패를 유발함.
            const res = await api.get('/basics/partners/');
            setPartners(res.data);
        } catch (error) {
            console.error("Failed to fetch partners", error);
        }
    };

    const fetchGroups = async () => {
        try {
            const res = await api.get('/product/groups/');
            setGroups(res.data || []);
        } catch (error) {
            console.error("Failed to fetch product groups", error);
        }
    };

    const handleFileUpload = async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            return { name: res.data.filename, url: res.data.url };
        } catch (error) {
            console.error("File upload failed", error);
            alert("파일 업로드 실패");
            return null;
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setProductFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (file) {
            const fileData = await handleFileUpload(file);
            if (fileData) {
                let currentFiles = [];
                try {
                    const parsed = safeParseJSON(productFormData.drawing_file, []);
                    currentFiles = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
                } catch {
                    currentFiles = [];
                }
                const updatedFiles = [...currentFiles, fileData];
                setProductFormData(prev => ({ ...prev, drawing_file: JSON.stringify(updatedFiles) }));
            }
        }
    };

    const handleRemoveFile = (index) => {
        let currentFiles = [];
        try {
            const parsed = safeParseJSON(productFormData.drawing_file, []);
            currentFiles = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        } catch {
            currentFiles = [];
        }
        const updatedFiles = currentFiles.filter((_, i) => i !== index);
        setProductFormData(prev => ({ ...prev, drawing_file: updatedFiles.length > 0 ? JSON.stringify(updatedFiles) : null }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const payload = {
                ...productFormData,
                item_type: type,
                unit: productFormData.unit || 'EA'
            };

            let res;
            if (productFormData.id) {
                res = await api.put(`/product/products/${productFormData.id}`, payload);
            } else {
                res = await api.post('/product/products/', payload);
            }
            
            alert(productFormData.id ? "수정되었습니다." : "등록되었습니다.");
            if (onSuccess) onSuccess(res.data);
            onClose();
        } catch (error) {
            console.error("Failed to save product", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleCreatePartner = async (inputValue) => {
        if (!window.confirm('등록되지 않은 거래처입니다. 신규 등록하시겠습니까?')) return;
        try {
            const newType = (type === 'PART' || type === 'CONSUMABLE') ? ['SUPPLIER'] : ['CUSTOMER'];
            const res = await api.post('/basics/partners/', {
                name: inputValue,
                partner_type: newType
            });
            const newPartner = res.data;
            setPartners(prev => [...prev, newPartner]);
            setProductFormData(prev => ({ ...prev, partner_id: newPartner.id }));
            alert('새로운 거래처가 등록되었습니다.');
        } catch (error) {
            console.error('Failed to create partner', error);
            alert('거래처 등록 실패: ' + (error.response?.data?.detail || error.message));
        }
    };

    const partnerOptions = partners.map(p => ({ value: p.id, label: p.name }));

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[10005] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col h-[85vh]">
                <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                        <Package className="w-5 h-5 text-emerald-500" />
                        {productFormData.id ? `제품 정보 수정: ${productFormData.name}` : `신규 ${type === 'CONSUMABLE' ? '소모품' : '제품'} 등록`}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    <form id="productModalForm" onSubmit={handleSubmit} className="space-y-6 max-w-3xl mx-auto">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">거래처 <span className="text-red-500">*</span></label>
                                    <CreatableSelect
                                        isClearable
                                        options={partnerOptions}
                                        value={partnerOptions.find(opt => opt.value === parseInt(productFormData.partner_id)) || null}
                                        onChange={(option) => setProductFormData(prev => ({ ...prev, partner_id: option ? option.value : "" }))}
                                        onCreateOption={handleCreatePartner}
                                        placeholder="거래처 검색 또는 신규 입력"
                                        className="text-sm"
                                        menuPosition="fixed"
                                        menuPortalTarget={document.body}
                                        styles={{
                                            menuPortal: base => ({ ...base, zIndex: 99999 }),
                                            control: (base) => ({
                                                ...base,
                                                backgroundColor: 'rgba(17, 24, 39, 0.5)',
                                                borderColor: 'rgb(55, 65, 81)',
                                                color: 'white',
                                                borderRadius: '0.5rem',
                                                padding: '1px',
                                                boxShadow: 'none',
                                                '&:hover': { borderColor: 'rgb(75, 85, 99)' }
                                            }),
                                            menu: (base) => ({
                                                ...base,
                                                backgroundColor: 'rgb(31, 41, 55)',
                                                border: '1px solid rgb(55, 65, 81)',
                                                zIndex: 10500
                                            }),
                                            option: (base, state) => ({
                                                ...base,
                                                backgroundColor: state.isFocused ? 'rgb(55, 65, 81)' : 'transparent',
                                                color: 'white'
                                            }),
                                            singleValue: (base) => ({ ...base, color: 'white' }),
                                            input: (base) => ({ ...base, color: 'white' }),
                                            placeholder: (base) => ({ ...base, color: 'rgb(156, 163, 175)' }),
                                            menuPortal: (base) => ({ ...base, zIndex: 10500 })
                                        }}
                                    />
                                </div>

                                {type !== 'CONSUMABLE' && (
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">대그룹</label>
                                            <select
                                                name="major_group_id"
                                                onChange={handleInputChange}
                                                value={productFormData.major_group_id || ""}
                                                className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                                            >
                                                <option value="">선택</option>
                                                {groups.filter(g => g.type === 'MAJOR').map(g => (
                                                    <option key={g.id} value={g.id}>{g.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">소그룹 <span className="text-red-500">*</span></label>
                                            <select
                                                name="group_id"
                                                onChange={handleInputChange}
                                                value={productFormData.group_id || ""}
                                                className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                                                required
                                                disabled={!productFormData.major_group_id}
                                            >
                                                <option value="">선택</option>
                                                {groups.filter(g => g.parent_id === parseInt(productFormData.major_group_id)).map(g => (
                                                    <option key={g.id} value={g.id}>{g.name}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">품명 <span className="text-red-500">*</span></label>
                                    <input name="name" value={productFormData.name || ""} onChange={handleInputChange} className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" required placeholder="제품명을 입력하세요" />
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">규격</label>
                                    <input name="specification" value={productFormData.specification || ""} onChange={handleInputChange} className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" placeholder="규격/사양" />
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    {type !== 'CONSUMABLE' && (
                                        <div className="space-y-2">
                                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">재질</label>
                                            <input name="material" value={productFormData.material || ""} onChange={handleInputChange} className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" placeholder="재질" />
                                        </div>
                                    )}
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">단위</label>
                                        <input name="unit" value={productFormData.unit || "EA"} onChange={handleInputChange} className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" placeholder="EA" />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-emerald-400 font-bold uppercase tracking-wider">최근 단가 (₩)</label>
                                    <input 
                                        name="recent_price" 
                                        type="number"
                                        value={productFormData.recent_price || productFormData.latest_price || 0} 
                                        onChange={handleInputChange} 
                                        className="w-full bg-emerald-900/10 border border-emerald-500/30 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium" 
                                        placeholder="0" 
                                    />
                                    {(!productFormData.recent_price && productFormData.latest_price > 0) && (
                                        <p className="text-[10px] text-emerald-500/70 mt-1 italic">이력 기반 자동 제안된 단가입니다.</p>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">비고</label>
                                    <textarea name="note" value={productFormData.note || ""} onChange={handleInputChange} className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all h-[106px] resize-none text-sm" placeholder="특이사항 입력" />
                                </div>

                            </div>
                        </div>

                        <div className="space-y-3 pt-2">
                            <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">도면 및 첨부 파일</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:bg-gray-700/20 hover:border-gray-600 transition-all relative group flex flex-col items-center justify-center min-h-[120px]">
                                    <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
                                    <div className="flex flex-col items-center gap-2 text-gray-500 group-hover:text-gray-400">
                                        <Upload className="w-8 h-8" />
                                        <div className="text-xs">
                                            <p className="font-medium">클릭하여 파일 업로드</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {(() => {
                                        let fileList = [];
                                        try {
                                            const parsed = safeParseJSON(productFormData.drawing_file, []);
                                            fileList = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
                                        } catch { fileList = []; }

                                        if (fileList.length > 0) {
                                            return fileList.map((file, idx) => (
                                                <div key={idx} className="flex items-center justify-between bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2 group">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                                                        <span className="text-xs text-gray-300 truncate">{file.name}</span>
                                                    </div>
                                                    <button type="button" onClick={() => handleRemoveFile(idx)} className="text-gray-500 hover:text-red-400 p-1 transition-colors">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ));
                                        }
                                        return <div className="h-full flex items-center justify-center border border-gray-700/50 rounded-xl bg-gray-900/20 py-8 px-4"><p className="text-[11px] text-gray-600 italic">첨부된 파일이 없습니다</p></div>;
                                    })()}
                                </div>
                            </div>
                        </div>
                    </form>
                </div>

                <div className="p-6 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-3">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white">취소</button>
                    <button type="submit" form="productModalForm" disabled={loading} className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40">
                        {loading ? "처리 중..." : (productFormData.id ? "수정 저장" : "등록 완료")}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProductModal;
