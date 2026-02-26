import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Plus, Search, Package, MoreHorizontal, X, Upload, FileText, Filter, Settings, Trash2, Edit2, Save } from 'lucide-react';
import { cn } from '../lib/utils';
import FileViewerModal from '../components/FileViewerModal';
import ProcessGroupManager from '../components/ProcessGroupManager';

const Card = ({ children, className }) => (
    <div className={cn("bg-gray-800 rounded-xl border border-gray-700", className)}>
        {children}
    </div>
);

const ProductsPage = () => {
    const [activeTab, setActiveTab] = useState('products'); // 'products' | 'processes'
    const [products, setProducts] = useState([]);
    const [processes, setProcesses] = useState([]); // Master processes
    const [partners, setPartners] = useState([]);
    const [groups, setGroups] = useState([]); // Product Groups
    const [loading, setLoading] = useState(true);

    // Product Modal State
    const [showProductModal, setShowProductModal] = useState(false);
    const [productFormData, setProductFormData] = useState({});
    const [selectedPartnerId, setSelectedPartnerId] = useState("");

    // Process Modal State (Master Data)
    const [showProcessModal, setShowProcessModal] = useState(false);
    const [processFormData, setProcessFormData] = useState({});

    // Routing Modal State (Product Specific)
    const [showRoutingModal, setShowRoutingModal] = useState(false);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [routingProcesses, setRoutingProcesses] = useState([]); // Processes for the selected product

    // Expanded state for products
    const [expandedProductId, setExpandedProductId] = useState(null);

    // File Viewer Modal State
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);
    const [fileModalTitle, setFileModalTitle] = useState('');
    const [viewingTargetId, setViewingTargetId] = useState(null);

    useEffect(() => {
        if (activeTab === 'products') {
            fetchProducts();
            fetchPartners();
            fetchGroups();
        } else {
            fetchProcesses();
            fetchGroups();
        }
    }, [activeTab, selectedPartnerId]);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const res = await api.get('/product/products/', {
                params: { partner_id: selectedPartnerId || undefined }
            });
            setProducts(res.data);
        } catch (error) {
            console.error("Failed to fetch products", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPartners = async () => {
        try {
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

    const fetchProcesses = async () => {
        setLoading(true);
        try {
            const res = await api.get('/product/processes/');
            setProcesses(res.data);
        } catch (error) {
            console.error("Failed to fetch processes", error);
        } finally {
            setLoading(false);
        }
    };

    // --- Constants ---
    const COURSE_TYPES = {
        INTERNAL: "내부",
        OUTSOURCING: "외주",
        PURCHASE: "구매"
    };

    // --- Product Handlers ---
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
    const handleProductInputChange = (e) => {
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
                    const parsed = productFormData.drawing_file ? (typeof productFormData.drawing_file === 'string' ? JSON.parse(productFormData.drawing_file) : productFormData.drawing_file) : [];
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
            const parsed = productFormData.drawing_file ? (typeof productFormData.drawing_file === 'string' ? JSON.parse(productFormData.drawing_file) : productFormData.drawing_file) : [];
            currentFiles = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
        } catch {
            currentFiles = [];
        }
        const updatedFiles = currentFiles.filter((_, i) => i !== index);
        setProductFormData(prev => ({ ...prev, drawing_file: updatedFiles.length > 0 ? JSON.stringify(updatedFiles) : null }));
    };

    const handleCreateProduct = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...productFormData,
                unit: productFormData.unit || 'EA'
            };

            if (productFormData.id) {
                await api.put(`/product/products/${productFormData.id}`, payload);
                alert("수정되었습니다.");
            } else {
                await api.post('/product/products/', payload);
                alert("등록되었습니다.");
            }

            setShowProductModal(false);
            setProductFormData({});
            fetchProducts();
        } catch (error) {
            console.error("Failed to save product", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    // --- Process (Master) Handlers ---
    const handleProcessInputChange = (e) => {
        const { name, value } = e.target;
        setProcessFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCreateProcess = async (e) => {
        e.preventDefault();
        try {
            // Sanitize payload: convert empty strings to null for group fields
            const payload = {
                ...processFormData,
                group_id: processFormData.group_id === "" ? null : (processFormData.group_id ? parseInt(processFormData.group_id) : null),
                major_group_id: processFormData.major_group_id === "" ? null : (processFormData.major_group_id ? parseInt(processFormData.major_group_id) : null)
            };

            if (processFormData.id) {
                await api.put(`/product/processes/${processFormData.id}`, payload);
                alert("수정되었습니다.");
            } else {
                await api.post('/product/processes/', payload);
                alert("등록되었습니다.");
            }
            setShowProcessModal(false);
            setProcessFormData({});
            fetchProcesses();
        } catch (error) {
            console.error("Failed to save process", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleDeleteProcess = async (id) => {
        if (!window.confirm("정말 삭제하시겠습니까?")) return;
        try {
            await api.delete(`/product/processes/${id}`);
            fetchProcesses();
        } catch (error) {
            console.error("Failed to delete process", error);
            alert("삭제 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const getMajorGroupId = (minorGroupId) => {
        if (!minorGroupId) return "";
        const minor = groups.find(g => g.id === minorGroupId);
        return minor ? minor.parent_id : "";
    };

    const handleEditProduct = (product) => {
        setProductFormData({
            ...product,
            major_group_id: getMajorGroupId(product.group_id)
        });
        setShowProductModal(true);
    };

    const handleDeleteProduct = async (id) => {
        if (!window.confirm("정말 삭제하시겠습니까? 관련 재고나 공정 정보도 모두 삭제될 수 있습니다.")) return;
        try {
            await api.delete(`/product/products/${id}`);
            fetchProducts();
        } catch (error) {
            console.error("Failed to delete product", error);
            alert("삭제 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const handleDeleteAttachment = async (targetId, indexToRemove) => {
        if (!targetId) return;
        if (!window.confirm("정말로 이 첨부파일을 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)")) return;

        try {
            const product = products.find(p => p.id === targetId);
            if (!product) return;

            const files = typeof product.attachment_file === 'string' ? JSON.parse(product.attachment_file) : product.attachment_file;
            const currentFiles = Array.isArray(files) ? files : [files];
            const newFiles = currentFiles.filter((_, idx) => idx !== indexToRemove);

            const res = await api.put(`/product/products/${targetId}`, { attachment_file: newFiles });
            const updatedProduct = res.data;

            setProducts(prev => prev.map(p => p.id === targetId ? updatedProduct : p));
            setViewingFiles(newFiles);
            if (newFiles.length === 0) setShowFileModal(false);

            alert("첨부파일이 삭제되었습니다.");
        } catch (error) {
            console.error("Failed to delete attachment", error);
            alert("첨부파일 삭제 실패");
        }
    };

    // --- Routing Handlers ---
    const openRoutingModal = (product) => {
        setSelectedProduct(product);
        // Deep copy or map to editable format
        const existing = product.standard_processes.map(p => ({
            process_id: p.process_id,
            sequence: p.sequence,
            estimated_time: p.estimated_time,
            notes: p.notes,
            partner_name: p.partner_name,
            equipment_name: p.equipment_name,
            attachment_file: p.attachment_file,
            _tempId: Math.random() // For key in list
        }));
        setRoutingProcesses(existing);
        // Ensure master processes are loaded
        fetchProcesses();
        setShowRoutingModal(true);
    };

    const addRoutingProcess = () => {
        setRoutingProcesses(prev => [
            ...prev,
            {
                process_id: "",
                sequence: prev.length + 1,
                estimated_time: 0,
                notes: "",
                partner_name: "",
                equipment_name: "",
                attachment_file: "",
                _tempId: Math.random()
            }
        ]);
    };

    const removeRoutingProcess = (index) => {
        setRoutingProcesses(prev => {
            const next = prev.filter((_, i) => i !== index);
            // Re-order sequences? Optional, but good practice
            return next.map((p, i) => ({ ...p, sequence: i + 1 }));
        });
    };

    const updateRoutingProcess = (index, field, value) => {
        setRoutingProcesses(prev => {
            const next = [...prev];
            next[index] = { ...next[index], [field]: value };
            return next;
        });
    };

    const handleSaveRouting = async () => {
        if (!selectedProduct) return;
        try {
            // Validate
            const validProcesses = routingProcesses.filter(p => p.process_id);
            if (validProcesses.length !== routingProcesses.length) {
                alert("공정이 선택되지 않은 항목이 있습니다.");
                return;
            }

            const payload = {
                standard_processes: validProcesses.map(p => ({
                    process_id: parseInt(p.process_id),
                    sequence: parseInt(p.sequence),
                    estimated_time: parseFloat(p.estimated_time) || 0,
                    notes: p.notes,
                    partner_name: p.partner_name,
                    equipment_name: p.equipment_name,
                    attachment_file: p.attachment_file
                }))
            };

            await api.put(`/product/products/${selectedProduct.id}`, payload);
            alert("공정 설정이 저장되었습니다.");
            setShowRoutingModal(false);
            fetchProducts(); // Refresh list to update any view if needed
        } catch (error) {
            console.error("Failed to save routing", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        }
    };


    // --- DnD State ---
    const dragItem = React.useRef(null);
    const dragOverItem = React.useRef(null);

    const handleDragStart = (e, position) => {
        dragItem.current = position;
    };

    const handleDragEnter = (e, position) => {
        dragOverItem.current = position;
    };

    const handleDragEnd = () => {
        const copyListItems = [...routingProcesses];
        const dragItemContent = copyListItems[dragItem.current];
        copyListItems.splice(dragItem.current, 1);
        copyListItems.splice(dragOverItem.current, 0, dragItemContent);

        // Update sequences
        const updatedList = copyListItems.map((item, index) => ({
            ...item,
            sequence: index + 1
        }));

        dragItem.current = null;
        dragOverItem.current = null;
        setRoutingProcesses(updatedList);
    };


    const toggleExpand = (id) => {
        setExpandedProductId(expandedProductId === id ? null : id);
    };

    return (
        <div className="space-y-6 relative">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">제품 및 공정 관리</h2>
                    <div className="flex space-x-4 mt-4 border-b border-gray-700">
                        <button
                            onClick={() => setActiveTab('products')}
                            className={cn(
                                "pb-2 text-sm font-medium transition-colors",
                                activeTab === 'products' ? "text-blue-500 border-b-2 border-blue-500" : "text-gray-400 hover:text-white"
                            )}
                        >
                            제품 목록
                        </button>
                        <button
                            onClick={() => setActiveTab('processes')}
                            className={cn(
                                "pb-2 text-sm font-medium transition-colors",
                                activeTab === 'processes' ? "text-blue-500 border-b-2 border-blue-500" : "text-gray-400 hover:text-white"
                            )}
                        >
                            공정 관리 (마스터)
                        </button>
                    </div>
                </div>

                {activeTab === 'products' && (
                    <button
                        type="button"
                        onClick={() => {
                            setProductFormData({});
                            setShowProductModal(true);
                        }}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
                    >
                        <Plus className="w-4 h-4" />
                        <span>신규 제품 등록</span>
                    </button>
                )}
            </div>

            {activeTab === 'products' && (
                <Card>
                    <div className="p-4 border-b border-gray-700 flex items-center gap-4">
                        <div className="relative flex-1 max-w-sm">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="제품명 검색..."
                                className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-gray-400" />
                            <select
                                className="bg-gray-900 border border-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500"
                                value={selectedPartnerId}
                                onChange={(e) => setSelectedPartnerId(e.target.value)}
                            >
                                <option value="">전체 거래처</option>
                                {partners.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm text-gray-400">
                            <thead className="bg-gray-900/50 text-xs uppercase font-medium text-gray-500">
                                <tr>
                                    <th className="px-6 py-3">거래처</th>
                                    <th className="px-6 py-3">제품 그룹</th>
                                    <th className="px-6 py-3">품명</th>
                                    <th className="px-6 py-3">규격</th>
                                    <th className="px-6 py-3">재질</th>
                                    <th className="px-6 py-3">단위</th>
                                    <th className="px-6 py-3">공정 수</th>
                                    <th className="px-6 py-3">첨부파일</th>
                                    <th className="px-6 py-3">비고</th>
                                    <th className="px-6 py-3 text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {loading ? (
                                    <tr><td colSpan="9" className="text-center py-8">Loading...</td></tr>
                                ) : products.length > 0 ? products.map((product) => (
                                    <React.Fragment key={product.id}>
                                        <tr
                                            className="hover:bg-gray-700/50 transition-colors cursor-pointer group"
                                            onClick={() => toggleExpand(product.id)}
                                        >
                                            <td className="px-6 py-4">
                                                {partners.find(p => p.id === product.partner_id)?.name || '-'}
                                            </td>
                                            <td className="px-6 py-4 text-xs font-medium">
                                                {(() => {
                                                    if (!product.group_id) return <span className="text-gray-600">-</span>;
                                                    const minor = groups.find(g => g.id === product.group_id);
                                                    const major = minor ? groups.find(g => g.id === minor.parent_id) : null;
                                                    if (major && minor) return <span className="text-blue-300">{major.name} &gt; {minor.name}</span>;
                                                    if (minor) return <span className="text-blue-300">{minor.name}</span>;
                                                    return <span className="text-gray-600">-</span>;
                                                })()}
                                            </td>
                                            <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                                    <Package className="w-4 h-4 text-emerald-400" />
                                                </div>
                                                {product.name}
                                            </td>
                                            <td className="px-6 py-4">{product.specification}</td>
                                            <td className="px-6 py-4">{product.material}</td>
                                            <td className="px-6 py-4">{product.unit}</td>
                                            <td className="px-6 py-4">
                                                <span className="bg-gray-700 text-white px-2 py-1 rounded text-xs">
                                                    {product.standard_processes ? product.standard_processes.length : 0} 공정
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 truncate max-w-xs" title={product.note}>{product.note || '-'}</td>
                                            <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                                {(() => {
                                                    let fileList = [];
                                                    try {
                                                        const parsed = product.drawing_file ? (typeof product.drawing_file === 'string' ? JSON.parse(product.drawing_file) : product.drawing_file) : null;
                                                        fileList = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
                                                    } catch { fileList = []; }
                                                    if (fileList.length > 0) {
                                                        return (
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setViewingFiles(fileList);
                                                                    setFileModalTitle(`${product.name} - 첨부파일`);
                                                                    setShowFileModal(true);
                                                                }}
                                                                className="flex items-center gap-1.5 text-blue-400 hover:text-blue-300 text-xs px-2 py-1 rounded bg-blue-900/20 hover:bg-blue-900/40 border border-blue-800/40 transition-colors"
                                                                title="첨부파일 보기"
                                                            >
                                                                <FileText className="w-3 h-3" />
                                                                첨부 {fileList.length}
                                                            </button>
                                                        );
                                                    }
                                                    return <span className="text-gray-600 text-xs">-</span>;
                                                })()}
                                            </td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => handleEditProduct(product)}
                                                    className="text-gray-400 hover:text-blue-400"
                                                    title="수정"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteProduct(product.id)}
                                                    className="text-gray-400 hover:text-red-400"
                                                    title="삭제"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                        {/* Expanded Process Information */}
                                        {expandedProductId === product.id && (
                                            <tr className="bg-gray-800/50 animation-fade-in-down">
                                                <td colSpan="9" className="p-4 pl-16">
                                                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                                                        <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2">
                                                            <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                                                <Settings className="w-4 h-4 text-gray-500" />
                                                                공정 구성
                                                            </h4>
                                                            <button
                                                                onClick={() => openRoutingModal(product)}
                                                                className="text-white bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-xs flex items-center gap-1 transition-colors shadow-sm"
                                                            >
                                                                <Settings className="w-3 h-3" />
                                                                공정 설정
                                                            </button>
                                                        </div>

                                                        {product.standard_processes && product.standard_processes.length > 0 ? (
                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-left text-sm text-gray-400">
                                                                    <thead className="bg-gray-800 text-xs uppercase font-medium text-gray-500">
                                                                        <tr>
                                                                            <th className="px-4 py-2 w-16 text-center">순서</th>
                                                                            <th className="px-4 py-2">공정명</th>
                                                                            <th className="px-4 py-2">구분</th>
                                                                            <th className="px-4 py-2">업체/장비</th>
                                                                            <th className="px-4 py-2">예상시간</th>
                                                                            <th className="px-4 py-2">설명</th>
                                                                            <th className="px-4 py-2">첨부</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-700">
                                                                        {product.standard_processes.sort((a, b) => a.sequence - b.sequence).map((pp, idx) => (
                                                                            <tr key={idx} className="hover:bg-gray-800/50 transition-colors">
                                                                                <td className="px-4 py-2 text-center text-white font-medium bg-gray-800/30">
                                                                                    {pp.sequence}
                                                                                </td>
                                                                                <td className="px-4 py-2 text-white font-medium">
                                                                                    {pp.process ? pp.process.name : 'Unknown'}
                                                                                </td>
                                                                                <td className="px-4 py-2">
                                                                                    {pp.process && (
                                                                                        <span className={cn(
                                                                                            "text-[10px] px-1.5 py-0.5 rounded border",
                                                                                            pp.process.course_type === 'INTERNAL' ? "bg-blue-900/30 border-blue-800 text-blue-300" :
                                                                                                pp.process.course_type === 'OUTSOURCING' ? "bg-orange-900/30 border-orange-800 text-orange-300" :
                                                                                                    "bg-purple-900/30 border-purple-800 text-purple-300"
                                                                                        )}>
                                                                                            {COURSE_TYPES[pp.process.course_type] || pp.process.course_type}
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-4 py-2 text-gray-400">
                                                                                    {pp.partner_name || pp.equipment_name || '-'}
                                                                                </td>
                                                                                <td className="px-4 py-2">
                                                                                    <span className="text-emerald-400">{pp.estimated_time || 0}분</span>
                                                                                </td>
                                                                                <td className="px-4 py-2 text-xs">
                                                                                    {pp.notes || '-'}
                                                                                </td>
                                                                                <td className="px-4 py-2">
                                                                                    {pp.attachment_file && (
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                // Parse files logic
                                                                                                let fileList = [];
                                                                                                try {
                                                                                                    fileList = pp.attachment_file ? JSON.parse(pp.attachment_file) : [];
                                                                                                    if (!Array.isArray(fileList)) fileList = [pp.attachment_file];
                                                                                                } catch {
                                                                                                    fileList = pp.attachment_file ? [pp.attachment_file] : [];
                                                                                                }

                                                                                                if (fileList.length > 0) {
                                                                                                    setViewingFiles(fileList);
                                                                                                    setFileModalTitle(`${pp.process ? pp.process.name : '공정'} 첨부파일`);
                                                                                                    setShowFileModal(true);
                                                                                                }
                                                                                            }}
                                                                                            className="text-blue-400 hover:text-blue-300"
                                                                                        >
                                                                                            <FileText className="w-4 h-4" />
                                                                                        </button>
                                                                                    )}
                                                                                </td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        ) : (
                                                            <div className="text-sm text-gray-500 py-4 text-center">
                                                                등록된 공정이 없습니다. '공정 설정'을 눌러 공정을 추가하세요.
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                )) : (
                                    <tr><td colSpan="9" className="text-center py-8">등록된 제품이 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {activeTab === 'processes' && (
                <ProcessGroupManager
                    groups={groups}
                    fetchGroups={fetchGroups}
                    fetchProcesses={fetchProcesses}
                    processes={processes}
                    onAddProcess={(initData) => {
                        setProcessFormData(initData || {});
                        setShowProcessModal(true);
                    }}
                    onEditProcess={(process) => {
                        setProcessFormData({
                            ...process,
                            major_group_id: getMajorGroupId(process.group_id)
                        });
                        setShowProcessModal(true);
                    }}
                    onDeleteProcess={handleDeleteProcess}
                />
            )}

            {/* Product Modal */}
            {showProductModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg shadow-2xl overflow-hidden animation-fade-in">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Package className="w-5 h-5 text-emerald-500" />
                                {productFormData.id ? "제품 수정" : "신규 제품 등록"}
                            </h3>
                            <button onClick={() => setShowProductModal(false)} className="text-gray-400 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <form onSubmit={handleCreateProduct} className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">거래처 <span className="text-red-500">*</span></label>
                                <select
                                    name="partner_id"
                                    onChange={handleProductInputChange}
                                    value={productFormData.partner_id || ""}
                                    className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    required
                                >
                                    <option value="">거래처 선택</option>
                                    {partners.filter(p => Array.isArray(p.partner_type) && p.partner_type.includes('CUSTOMER')).map(p => (
                                        <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">대그룹 (Major)</label>
                                    <select
                                        name="major_group_id"
                                        onChange={handleProductInputChange}
                                        value={productFormData.major_group_id || ""}
                                        className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                    >
                                        <option value="">대그룹 선택</option>
                                        {groups.filter(g => g.type === 'MAJOR').map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">소그룹 (Minor) <span className="text-red-500">*</span></label>
                                    <select
                                        name="group_id"
                                        onChange={handleProductInputChange}
                                        value={productFormData.group_id || ""}
                                        className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                        required
                                        disabled={!productFormData.major_group_id}
                                    >
                                        <option value="">소그룹 선택</option>
                                        {groups.filter(g => g.parent_id === parseInt(productFormData.major_group_id)).map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">품명 <span className="text-red-500">*</span></label>
                                <input name="name" value={productFormData.name || ""} onChange={handleProductInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" required />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">규격</label>
                                <input name="specification" value={productFormData.specification || ""} onChange={handleProductInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">재질</label>
                                    <input name="material" value={productFormData.material || ""} onChange={handleProductInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">단위</label>
                                    <input name="unit" value={productFormData.unit || "EA"} onChange={handleProductInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="EA" />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">비고</label>
                                <textarea name="note" value={productFormData.note || ""} onChange={handleProductInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all h-20 resize-none" placeholder="특이사항 입력" />
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">첨부 파일</label>

                                {/* File List */}
                                {(() => {
                                    let fileList = [];
                                    try {
                                        const parsed = productFormData.drawing_file ? (typeof productFormData.drawing_file === 'string' ? JSON.parse(productFormData.drawing_file) : productFormData.drawing_file) : [];
                                        fileList = Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
                                    } catch { fileList = []; }

                                    if (fileList.length > 0) {
                                        return (
                                            <div className="space-y-2 mb-3">
                                                {fileList.map((file, idx) => (
                                                    <div key={idx} className="flex items-center justify-between bg-gray-900/50 border border-gray-700 rounded-lg px-3 py-2 group">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <FileText className="w-4 h-4 text-blue-400 flex-shrink-0" />
                                                            <span className="text-xs text-gray-300 truncate">{file.name}</span>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveFile(idx)}
                                                            className="text-gray-500 hover:text-red-400 transition-colors"
                                                        >
                                                            <X className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                ))}
                                            </div>
                                        );
                                    }
                                    return null;
                                })()}

                                <div className="border border-dashed border-gray-700 rounded-lg p-4 text-center hover:bg-gray-700/30 transition-colors relative">
                                    <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
                                    <div className="flex flex-col items-center gap-2 text-gray-500">
                                        <Upload className="w-6 h-6" />
                                        <span className="text-sm">클릭하여 파일 추가</span>
                                    </div>
                                </div>
                            </div>

                            <div className="pt-4 flex justify-end gap-3 border-t border-gray-700 mt-6">
                                <button
                                    type="button"
                                    onClick={() => setShowProductModal(false)}
                                    className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-900/40"
                                >
                                    {productFormData.id ? "수정완료" : "등록완료"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Process (Master) Modal */}
            {showProcessModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg shadow-2xl overflow-hidden animation-fade-in">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Settings className="w-5 h-5 text-emerald-500" />
                                {processFormData.id ? "공정 수정" : "신규 공정 등록"}
                            </h3>
                            <button onClick={() => setShowProcessModal(false)} className="text-gray-400 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleCreateProcess} className="p-6 space-y-5">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">공정명 <span className="text-red-500">*</span></label>
                                <input
                                    name="name"
                                    value={processFormData.name || ""}
                                    onChange={handleProcessInputChange}
                                    className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                    required
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">대그룹 (Major)</label>
                                    <select
                                        name="major_group_id"
                                        onChange={handleProcessInputChange}
                                        value={processFormData.major_group_id || ""}
                                        className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                    >
                                        <option value="">대그룹 선택</option>
                                        {groups.filter(g => g.type === 'MAJOR').map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-300">소그룹 (Minor) <span className="text-red-500">*</span></label>
                                    <select
                                        name="group_id"
                                        value={processFormData.group_id || ""}
                                        onChange={handleProcessInputChange}
                                        className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                        required={!!processFormData.major_group_id}
                                        disabled={!processFormData.major_group_id}
                                    >
                                        <option value="">소그룹 선택</option>
                                        {groups.filter(g => g.parent_id === parseInt(processFormData.major_group_id)).map(g => (
                                            <option key={g.id} value={g.id}>{g.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">구분 <span className="text-red-500">*</span></label>
                                <select
                                    name="course_type"
                                    value={processFormData.course_type || "INTERNAL"}
                                    onChange={handleProcessInputChange}
                                    className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                                >
                                    <option value="INTERNAL">내부</option>
                                    <option value="OUTSOURCING">외주</option>
                                    <option value="PURCHASE">구매</option>
                                </select>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-gray-300">설명</label>
                                <textarea
                                    name="description"
                                    value={processFormData.description || ""}
                                    onChange={handleProcessInputChange}
                                    className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 transition-all h-20 resize-none"
                                />
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t border-gray-700 mt-6">
                                <button type="button" onClick={() => setShowProcessModal(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">취소</button>
                                <button type="submit" className="px-6 py-2 rounded-lg text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-lg shadow-emerald-900/40">저장</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Routing (Product Process) Modal */}
            {showRoutingModal && selectedProduct && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-4xl shadow-2xl overflow-hidden animation-fade-in flex flex-col h-[80vh]">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Settings className="w-5 h-5 text-blue-500" />
                                    공정 설정
                                </h3>
                                <p className="text-sm text-gray-400 mt-1">제품: <span className="text-white font-medium">{selectedProduct.name}</span></p>
                            </div>
                            <button onClick={() => setShowRoutingModal(false)} className="text-gray-400 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div className="space-y-2">
                                <div className="flex justify-between items-center mb-4">
                                    <h4 className="text-sm font-semibold text-gray-300">공정 순서 정의</h4>
                                    <button
                                        type="button"
                                        onClick={addRoutingProcess}
                                        className="text-xs bg-gray-700 hover:bg-gray-600 text-white px-3 py-1.5 rounded flex items-center gap-1 transition-colors"
                                    >
                                        <Plus className="w-3 h-3" /> 공정 추가
                                    </button>
                                </div>

                                {routingProcesses.length === 0 ? (
                                    <div className="text-center py-10 border border-dashed border-gray-700 rounded-lg text-gray-500">
                                        설정된 공정이 없습니다. '공정 추가' 버튼을 눌러 공정을 등록하세요.
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {routingProcesses.map((p, index) => (
                                            <div
                                                key={p._tempId || index}
                                                className="flex flex-col gap-3 bg-gray-700/30 p-4 rounded-lg border border-gray-700 group cursor-move hover:bg-gray-700/50 transition-colors"
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, index)}
                                                onDragEnter={(e) => handleDragEnter(e, index)}
                                                onDragEnd={handleDragEnd}
                                                onDragOver={(e) => e.preventDefault()}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-900 text-gray-400 text-xs font-bold shrink-0 border border-gray-700">
                                                        {index + 1}
                                                    </div>

                                                    <div className="flex-1 grid grid-cols-12 gap-3">
                                                        <div className="col-span-4">
                                                            <label className="text-xs text-gray-500 block mb-1">공정 선택</label>
                                                            <div className="flex gap-2">
                                                                <select
                                                                    value={p.process_id}
                                                                    onChange={(e) => updateRoutingProcess(index, 'process_id', e.target.value)}
                                                                    className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                >
                                                                    <option value="">(공정 선택)</option>
                                                                    {(() => {
                                                                        const availableProcesses = selectedProduct?.group_id
                                                                            ? processes.filter(pr => pr.group_id === selectedProduct.group_id || !pr.group_id)
                                                                            : processes;
                                                                        return availableProcesses.map(proc => (
                                                                            <option key={proc.id} value={proc.id}>{proc.name}</option>
                                                                        ));
                                                                    })()}
                                                                </select>
                                                            </div>
                                                            {p.process_id && (
                                                                <div className="mt-1">
                                                                    {(() => {
                                                                        const proc = processes.find(pr => pr.id == p.process_id);
                                                                        if (proc) {
                                                                            // Initialize course_type if not set
                                                                            const currentCourseType = p.course_type || proc.course_type;

                                                                            return (
                                                                                <select
                                                                                    value={currentCourseType}
                                                                                    onChange={(e) => updateRoutingProcess(index, 'course_type', e.target.value)}
                                                                                    className={cn(
                                                                                        "text-[10px] px-1 py-0.5 rounded border outline-none cursor-pointer",
                                                                                        currentCourseType === 'INTERNAL' ? "bg-blue-900/30 border-blue-800 text-blue-300" :
                                                                                            currentCourseType === 'OUTSOURCING' ? "bg-orange-900/30 border-orange-800 text-orange-300" :
                                                                                                "bg-purple-900/30 border-purple-800 text-purple-300"
                                                                                    )}
                                                                                >
                                                                                    {Object.entries(COURSE_TYPES).map(([key, label]) => (
                                                                                        <option key={key} value={key} className="bg-gray-800 text-gray-200">
                                                                                            {label}
                                                                                        </option>
                                                                                    ))}
                                                                                </select>
                                                                            );
                                                                        }
                                                                        return null;
                                                                    })()}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div className="col-span-4">
                                                            <label className="text-xs text-gray-500 block mb-1">업체/장비명</label>
                                                            {(() => {
                                                                const proc = processes.find(pr => pr.id == p.process_id);
                                                                // Use p.course_type if set (override), otherwise Use process default
                                                                const effectiveCourseType = p.course_type || (proc ? proc.course_type : 'INTERNAL');
                                                                const isOutsourcing = (effectiveCourseType === 'OUTSOURCING' || effectiveCourseType === 'PURCHASE');

                                                                // Filter partners for suggestion (Suppliers and Subcontractors)
                                                                const relevantPartners = partners.filter(pt => {
                                                                    const types = Array.isArray(pt.partner_type) ? pt.partner_type : (typeof pt.partner_type === 'string' ? JSON.parse(pt.partner_type) : []);
                                                                    return types.includes('SUPPLIER') || types.includes('SUBCONTRACTOR');
                                                                });

                                                                return (
                                                                    <>
                                                                        <input
                                                                            type="text"
                                                                            list={`partner-list-${index}`}
                                                                            value={isOutsourcing ? (p.partner_name || "") : (p.equipment_name || "")}
                                                                            onChange={(e) => updateRoutingProcess(index, isOutsourcing ? 'partner_name' : 'equipment_name', e.target.value)}
                                                                            className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                            placeholder={isOutsourcing ? "업체명 입력 또는 선택" : "장비/설비명 입력"}
                                                                        />
                                                                        {isOutsourcing && (
                                                                            <datalist id={`partner-list-${index}`}>
                                                                                {relevantPartners.map(pt => (
                                                                                    <option key={pt.id} value={pt.name} />
                                                                                ))}
                                                                            </datalist>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>

                                                        <div className="col-span-2">
                                                            <label className="text-xs text-gray-500 block mb-1">예상시간(분)</label>
                                                            <input
                                                                type="number"
                                                                value={p.estimated_time}
                                                                onChange={(e) => updateRoutingProcess(index, 'estimated_time', e.target.value)}
                                                                className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                placeholder="0"
                                                            />
                                                        </div>

                                                        <div className="col-span-2 flex justify-end">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); removeRoutingProcess(index); }}
                                                                className="text-gray-500 hover:text-red-400 p-1 rounded hover:bg-gray-700 transition-colors mt-6"
                                                                title="삭제"
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-12 gap-3 pl-11">
                                                    <div className="col-span-6">
                                                        <label className="text-xs text-gray-500 block mb-1">비고/작업내용</label>
                                                        <input
                                                            type="text"
                                                            value={p.notes || ""}
                                                            onChange={(e) => updateRoutingProcess(index, 'notes', e.target.value)}
                                                            className="w-full bg-gray-900 border border-gray-600 text-white text-sm rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
                                                            placeholder="작업 내용 메모..."
                                                        />
                                                    </div>
                                                    <div className="col-span-6">
                                                        <label className="text-xs text-gray-500 block mb-1">첨부파일</label>
                                                        <div className="flex flex-col gap-2">
                                                            <div className="relative flex-1">
                                                                <input
                                                                    type="file"
                                                                    multiple
                                                                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                                    onChange={async (e) => {
                                                                        const files = Array.from(e.target.files);
                                                                        if (files.length > 0) {
                                                                            // Existing files
                                                                            let existingFiles = [];
                                                                            try {
                                                                                existingFiles = p.attachment_file ? JSON.parse(p.attachment_file) : [];
                                                                                if (!Array.isArray(existingFiles)) existingFiles = [p.attachment_file];
                                                                            } catch {
                                                                                existingFiles = p.attachment_file ? [p.attachment_file] : [];
                                                                            }

                                                                            const newFiles = [];
                                                                            for (const file of files) {
                                                                                const fileData = await handleFileUpload(file);
                                                                                if (fileData) newFiles.push(fileData);
                                                                            }

                                                                            if (newFiles.length > 0) {
                                                                                const updatedFiles = [...existingFiles, ...newFiles];
                                                                                updateRoutingProcess(index, 'attachment_file', JSON.stringify(updatedFiles));
                                                                            }
                                                                        }
                                                                    }}
                                                                />
                                                                <div className="w-full bg-gray-900 border border-gray-600 text-gray-400 text-xs rounded px-2 py-1.5 flex items-center justify-center gap-1 cursor-pointer hover:border-gray-500">
                                                                    <Upload className="w-3 h-3" />
                                                                    <span>파일 추가 업로드</span>
                                                                </div>
                                                            </div>

                                                            {/* File List */}
                                                            {(() => {
                                                                let fileList = [];
                                                                try {
                                                                    fileList = p.attachment_file ? JSON.parse(p.attachment_file) : [];
                                                                    if (!Array.isArray(fileList)) fileList = [p.attachment_file];
                                                                } catch {
                                                                    fileList = p.attachment_file ? [p.attachment_file] : [];
                                                                }

                                                                if (fileList.length > 0) {
                                                                    return (
                                                                        <div className="space-y-1">
                                                                            {fileList.map((fileItem, fIndex) => {
                                                                                // Handle both old string URLs and new object format {name, url}
                                                                                const isString = typeof fileItem === 'string';
                                                                                const url = isString ? fileItem : fileItem.url;
                                                                                const name = isString ? decodeURIComponent(url.split('/').pop()) : fileItem.name;

                                                                                return (
                                                                                    <div key={fIndex} className="flex items-center justify-between bg-gray-800 px-2 py-1 rounded border border-gray-700">
                                                                                        <button
                                                                                            type="button"
                                                                                            onClick={() => {
                                                                                                setViewingFiles(fileList);
                                                                                                setFileModalTitle('공정 첨부파일 미리보기');
                                                                                                setShowFileModal(true);
                                                                                            }}
                                                                                            className="text-white text-xs hover:underline truncate max-w-[150px] text-left"
                                                                                            title={`${name} - 클릭하여 미리보기`}
                                                                                        >
                                                                                            {name}
                                                                                        </button>
                                                                                        <button
                                                                                            onClick={() => {
                                                                                                const newFiles = fileList.filter((_, i) => i !== fIndex);
                                                                                                updateRoutingProcess(index, 'attachment_file', JSON.stringify(newFiles));
                                                                                            }}
                                                                                            className="text-gray-500 hover:text-red-400 p-0.5"
                                                                                        >
                                                                                            <X className="w-3 h-3" />
                                                                                        </button>
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    );
                                                                }
                                                                return null;
                                                            })()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-3">
                            <button
                                onClick={() => setShowRoutingModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                            >
                                취소
                            </button>
                            <button
                                onClick={handleSaveRouting}
                                className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-900/40"
                            >
                                <Save className="w-4 h-4" />
                                설정 저장
                            </button>
                        </div>
                    </div>
                </div>
            )
            }

            <FileViewerModal
                isOpen={showFileModal}
                onClose={() => setShowFileModal(false)}
                files={viewingFiles}
                title={fileModalTitle}
                onDeleteFile={(index) => handleDeleteAttachment(viewingTargetId, index)}
            />
        </div >
    );
};

export default ProductsPage;
