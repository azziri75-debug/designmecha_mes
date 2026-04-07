import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Plus, Search, Package, MoreHorizontal, X, Upload, FileText, Filter, Settings, Trash2, Edit2, Save, History, Bolt, Copy, Printer } from 'lucide-react';
import CreatableSelect from 'react-select/creatable';
import Select from 'react-select';
import { Box, Typography, Button, Checkbox, Dialog, DialogTitle, DialogContent } from '@mui/material';
import { cn, safeParseJSON } from '../lib/utils';
import FileViewerModal from '../components/FileViewerModal';
import ProcessGroupManager from '../components/ProcessGroupManager';
import ResizableTh from '../components/ResizableTh';
import ProcessChartTemplate from '../components/ProcessChartTemplate';
import ProductModal from '../components/ProductModal';

const Card = ({ children, className }) => (
    <div className={cn("bg-gray-800 rounded-xl border border-gray-700", className)}>
        {children}
    </div>
);

const ProductsPage = ({ type }) => {
    const [activeTab, setActiveTab] = useState(type === 'PROCESSES' ? 'processes' : 'products'); // 'products' | 'processes'
    const [products, setProducts] = useState([]);
    const [allParts, setAllParts] = useState([]); // All PART items for BOM combobox
    const [processes, setProcesses] = useState([]); // Master processes
    const [partners, setPartners] = useState([]);
    const [groups, setGroups] = useState([]); // Product Groups
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');

    // Product Modal State
    const [showProductModal, setShowProductModal] = useState(false);
    const [productFormData, setProductFormData] = useState({});
    const [selectedPartnerId, setSelectedPartnerId] = useState("");
    const [selectedMajorGroupId, setSelectedMajorGroupId] = useState("");

    // Process Modal State (Master Data)
    const [showProcessModal, setShowProcessModal] = useState(false);
    const [processFormData, setProcessFormData] = useState({});

    // Routing Modal State (Product Specific)
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [routingProcesses, setRoutingProcesses] = useState([]); // Processes for the selected product

    // Expanded state for products
    const [expandedProductId, setExpandedProductId] = useState(null);

    // File Viewer Modal State
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);
    const [fileModalTitle, setFileModalTitle] = useState('');
    const [viewingTargetId, setViewingTargetId] = useState(null);

    // Sub-tab in expanded product view
    const [detailSubTab, setDetailSubTab] = useState('routing'); // 'routing' | 'priceHistory' | 'bom'
    const [priceHistory, setPriceHistory] = useState([]);
    const [loadingHistory, setLoadingHistory] = useState(false);

    // Cost History in Routing Modal
    const [showCostHistoryModal, setShowCostHistoryModal] = useState(false);
    const [costHistory, setCostHistory] = useState([]);
    const [loadingCostHistory, setLoadingCostHistory] = useState(false);
    const [historyTarget, setHistoryTarget] = useState({ productName: '', processName: '', productId: null, processId: null, index: null });

    // Part History Modal for BOM components
    const [showPartHistoryModal, setShowPartHistoryModal] = useState(false);
    const [partHistoryData, setPartHistoryData] = useState([]);
    const [loadingPartHistory, setLoadingPartHistory] = useState(false);
    const [partHistoryTitle, setPartHistoryTitle] = useState("");

    // Quick Process Registration State
    const [showQuickProcessModal, setShowQuickProcessModal] = useState(false);
    const [quickProcessData, setQuickProcessData] = useState({ name: "", course_type: "INTERNAL", major_group_id: null, group_id: null, index: null });

    // BOM State
    const [bomItems, setBomItems] = useState([]); // 현재 BOM 목록 (편집 중)
    const [bomNewRow, setBomNewRow] = useState({ child_product_id: '', required_quantity: 1 }); // 새 BOM 항목 입력용
    const [loadingBom, setLoadingBom] = useState(false);

    // Quick Part Registration State (Sub-modal for BOM)
    const [showQuickPartModal, setShowQuickPartModal] = useState(false);
    const [quickPartData, setQuickPartData] = useState({ name: "", specification: "", unit: "EA", partner_id: "", major_group_id: "", group_id: "" });

    // Print State
    const [printProductId, setPrintProductId] = useState(null);

    // Clone System Refactoring State
    const [cloneChoiceModalOpen, setCloneChoiceModalOpen] = useState(false);
    const [selectedSourceProduct, setSelectedSourceProduct] = useState(null);
    const [isCloneMode, setIsCloneMode] = useState(false); // 리스트 체크박스 모드 활성화 여부
    const [targetProductIds, setTargetProductIds] = useState([]);

    const ITEM_TYPES = {
        PRODUCED: '생산제품',
        PART: '부품',
        CONSUMABLE: '소모품'
    };
    const BOM_ITEM_TYPES = ['PRODUCED']; // BOM 탭 표시 조건

    // Removed useEffect for activeTab based on type, now set directly in useState

    // Reset activeTab when type prop changes (fixes tab switching bug)
    useEffect(() => {
        setActiveTab(type === 'PROCESSES' ? 'processes' : 'products');
        setSearchQuery('');
    }, [type]);

    useEffect(() => {
        if (activeTab === 'products') {
            fetchProducts();
            fetchPartners();
            fetchGroups();
            fetchProcesses(); // Needed for routing modal names
            fetchAllParts(); // For BOM combobox
        } else {
            fetchProcesses();
            fetchGroups();
        }
    }, [activeTab, selectedPartnerId, selectedMajorGroupId, type]);

    // [Fix] Sync price history for expanded row
    useEffect(() => {
        if (expandedProductId && detailSubTab === 'priceHistory') {
            const p = products.find(prod => prod.id === expandedProductId);
            if (p) fetchPriceHistory(p);
        }
    }, [expandedProductId, detailSubTab]);

    // [Fix] Sync state and cleanup for Product Modal
    useEffect(() => {
        if (showProductModal && productFormData.id) {
            // When modal opens or tab changes, ensure data is synced
            if (detailSubTab === 'priceHistory') {
                fetchPriceHistory(productFormData);
            } else if (detailSubTab === 'routing') {
                const p = productFormData;
                if (!routingProcesses || routingProcesses.length === 0) {
                    const existing = (p.standard_processes || []).map(proc => ({
                        process_id: proc.process_id,
                        sequence: proc.sequence,
                        estimated_time: proc.estimated_time,
                        notes: proc.notes,
                        partner_name: proc.partner_name,
                        equipment_name: proc.equipment_name,
                        attachment_file: proc.attachment_file,
                        cost: proc.cost || 0,
                        _tempId: Math.random()
                    }));
                    setRoutingProcesses(existing);
                    setSelectedProduct(p);
                }
            } else if (detailSubTab === 'bom') {
                fetchBomItems(productFormData.id);
            }
        }

        // Cleanup on modal close
        if (!showProductModal) {
            setRoutingProcesses([]);
            setPriceHistory([]);
            setBomItems([]);
            setBomNewRow({ child_product_id: '', required_quantity: 1 });
            // Don't reset detailSubTab here if it's being used by expanded row
        }
    }, [showProductModal, productFormData.id, detailSubTab]);

    const fetchProducts = async () => {
        setLoading(true);
        try {
            const params = { 
                partner_id: selectedPartnerId || undefined,
                major_group_id: selectedMajorGroupId || undefined
            };
            if (type && type !== 'PROCESSES') {
                params.item_type = type;
            }
            const res = await api.get('/product/products/', { params });
            setProducts(res.data);
        } catch (error) {
            console.error("Failed to fetch products", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAllParts = async () => {
        try {
            const res = await api.get('/product/products/', { params: { item_type: 'PART,CONSUMABLE' } });
            setAllParts(res.data || []);
        } catch (error) {
            console.error('Failed to fetch all parts', error);
        }
    };

    const fetchPartners = async () => {
        try {
            const partnerType = (type === 'PART' || type === 'CONSUMABLE') ? 'SUPPLIER' : 'CUSTOMER';
            const res = await api.get('/basics/partners/', { params: { type: partnerType } });
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
            const params = {};
            // [Fix] 공정 관리 탭에서는 상단 사업부 필터에 구애받지 않고 모든 공정을 불러와야 함
            // (ProcessGroupManager 내부에서 각 그룹별로 공정을 분류하여 보여주기 때문)
            if (activeTab !== 'processes' && selectedMajorGroupId) {
                params.major_group_id = selectedMajorGroupId;
            }
            
            const res = await api.get('/product/processes/', { params });
            setProcesses(res.data);
        } catch (error) {
            console.error("Failed to fetch processes", error);
            alert("공정 목록을 불러오는 데 실패했습니다: " + (error.response?.data?.detail || error.message));
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

    const handleCreatePartner = async (inputValue) => {
        if (!window.confirm('등록되지 않은 거래처입니다. 신규 등록하시겠습니까?')) {
            console.log('[DEBUG] Partner creation cancelled by user');
            return;
        }
        console.log('[DEBUG] Creating new partner:', inputValue);

        try {
            // Determine partner type based on current page type
            // If it's PART or CONSUMABLE, mark as SUPPLIER. Otherwise CUSTOMER.
            const newType = (type === 'PART' || type === 'CONSUMABLE') ? ['SUPPLIER'] : ['CUSTOMER'];

            const res = await api.post('/basics/partners/', {
                name: inputValue,
                partner_type: newType
            });
            const newPartner = res.data;

            // Update partners list to include the new one
            setPartners(prev => [...prev, newPartner]);

            // Select the newly created partner
            setProductFormData(prev => ({ ...prev, partner_id: newPartner.id }));

            alert('새로운 거래처가 등록되었습니다.');
        } catch (error) {
            console.error('Failed to create partner', error);
            alert('거래처 등록 실패: ' + (error.response?.data?.detail || error.message));
        }
    };

    const partnerOptions = partners.map(p => ({ value: p.id, label: p.name }));

    console.log('[DEBUG] Partner options count:', partnerOptions.length);

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

    const handleCreateProduct = async (e) => {
        e.preventDefault();
        try {
            const payload = {
                ...productFormData,
                unit: productFormData.unit || 'EA'
            };

            // Auto-assign item_type based on the 'type' prop (PRODUCED, PART, CONSUMABLE)
            if (type && type !== 'PROCESSES') {
                payload.item_type = type;
            } else {
                payload.item_type = 'PRODUCED'; // Default fallback
            }

            setLoading(true);
            if (productFormData.id) {
                await api.put(`/product/products/${productFormData.id}`, payload);
                alert("수정되었습니다.");
            } else {
                // For new products (including duplication), send standard_processes if they exist
                if (routingProcesses && routingProcesses.length > 0) {
                    payload.standard_processes = routingProcesses;
                }
                await api.post('/product/products/', payload);
                alert("등록되었습니다.");
            }

            setShowProductModal(false);
            setProductFormData({});
            fetchProducts();
        } catch (error) {
            console.error("Failed to save product", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
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
        setDetailSubTab('info');
        setShowProductModal(true);
    };

    const handleCloneClick = (product) => {
        setSelectedSourceProduct(product);
        setCloneChoiceModalOpen(true);
    };

    const handleExecuteOverwrite = async () => {
        if (window.confirm("선택한 제품들에 덮어쓰기를 진행할까요?\n(고객사, 품명, 규격 등 기존 정보는 유지되며, 공정과 BOM만 원본과 동일하게 덮어씌워집니다.)")) {
            try {
                // The endpoint is /product/products/:id/clone-to-targets
                await api.post(`/product/products/${selectedSourceProduct.id}/clone-to-targets`, { 
                    target_product_ids: targetProductIds 
                });
                alert('성공적으로 공정과 BOM이 덮어씌워졌습니다.');
                setIsCloneMode(false);
                setTargetProductIds([]);
                fetchProducts();
            } catch (e) {
                alert('복제 중 오류가 발생했습니다: ' + (e.response?.data?.detail || e.message));
            }
        }
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

    const handleDuplicateProduct = (product) => {
        // Prepare the duplicated data
        const { id, created_at, updated_at, vendor, partner, ...rest } = product;
        const cleanData = { ...rest };

        // [ 정밀 클렌징 ]
        // '부품(PART)'과 '소모품(CONSUMABLE)'은 생산 전용 데이터(공정, 라우팅, BOM)를 가지지 않음
        if (type === 'PART' || type === 'CONSUMABLE') {
            delete cleanData.standard_processes;
            delete cleanData.routings;
            delete cleanData.bom;
            delete cleanData.processes; // 혹시라도 존재할 경우 삭제
        }

        // Append "- 복사본" to the name
        const duplicatedName = `${product.name} - 복사본`;

        // Handle standard_processes duplication for PRODUCED items
        let duplicatedProcesses = [];
        if (type === 'PRODUCED') {
            duplicatedProcesses = (product.standard_processes || []).map((proc, idx) => {
                const { id, product_id, created_at, updated_at, process, ...procData } = proc;
                return {
                    ...procData,
                    sequence: idx + 1,
                    _tempId: Math.random()
                };
            });
        }

        setProductFormData({
            ...cleanData,
            name: duplicatedName,
            major_group_id: getMajorGroupId(product.group_id),
            standard_processes: duplicatedProcesses
        });

        setRoutingProcesses(duplicatedProcesses);
        setDetailSubTab('info');
        setShowProductModal(true);
    };

    const handleDeleteAttachment = async (targetId, indexToRemove) => {
        if (!targetId) return;
        if (!window.confirm("정말로 이 첨부파일을 삭제하시겠습니까? (이 작업은 되돌릴 수 없습니다)")) return;

        try {
            const product = products.find(p => p.id === targetId);
            if (!product) return;

            const files = safeParseJSON(product.attachment_file, []);
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
                cost: 0,
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
                    attachment_file: p.attachment_file,
                    cost: parseFloat(p.cost) || 0
                }))
            };

            setLoading(true);
            await api.put(`/product/products/${selectedProduct.id}`, payload);
            alert("공정 설정이 저장되었습니다.");
            setShowProductModal(false);
            fetchProducts();
        } catch (error) {
            console.error("Failed to save routing", error);
            alert("저장 실패: " + (error.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
        }
    };

    const handleQuickCreateProcess = async (e) => {
        e.preventDefault();
        try {
            const res = await api.post('/product/processes/quick', {
                name: quickProcessData.name,
                course_type: quickProcessData.course_type,
                major_group_id: quickProcessData.major_group_id,
                group_id: quickProcessData.group_id
            });
            const newProc = res.data;

            // Add to master processes list
            setProcesses(prev => [...prev, newProc]);

            // Link to the routing line that triggered this
            if (quickProcessData.index !== null) {
                updateRoutingProcess(quickProcessData.index, 'process_id', newProc.id);
            }

            setShowQuickProcessModal(false);
            alert("공정이 등록되었습니다.");
        } catch (error) {
            console.error("Quick process creation failed", error);
            alert("공정 등록 실패");
        }
    };

    const handleQuickPartSuccess = (newPart) => {
        // Add to allParts list for immediate selection
        setAllParts(prev => [...prev, newPart]);

        // Automatically select in BOM new row
        setBomNewRow(prev => ({ ...prev, child_product_id: newPart.id }));
        alert("부품이 등록되었으며 BOM 선택창에 자동 적용되었습니다.");
    };

    // Custom styles for react-select
    const selectStyles = {
        control: (base) => ({
            ...base,
            backgroundColor: '#111827',
            borderColor: '#4b5563',
            color: 'white',
            fontSize: '12px',
            minHeight: '32px',
            height: '32px',
            borderRadius: '4px',
            boxShadow: 'none',
            '&:hover': {
                borderColor: '#3b82f6'
            }
        }),
        input: (base) => ({ ...base, color: 'white' }),
        menu: (base) => ({ ...base, backgroundColor: '#111827', border: '1px solid #4b5563', zIndex: 9999 }),
        menuPortal: (base) => ({ ...base, zIndex: 9999 }),
        option: (base, { isFocused, isSelected }) => ({
            ...base,
            backgroundColor: isSelected ? '#2563eb' : isFocused ? '#1f2937' : '#111827',
            color: 'white',
            fontSize: '12px',
            cursor: 'pointer'
        }),
        singleValue: (base) => ({ ...base, color: 'white' }),
        placeholder: (base) => ({ ...base, color: '#9ca3af' }),
        noOptionsMessage: (base) => ({ ...base, color: '#9ca3af', fontSize: '11px' }),
        loadingMessage: (base) => ({ ...base, color: '#9ca3af', fontSize: '11px' })
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
        const isExpanding = expandedProductId !== id;
        setExpandedProductId(isExpanding ? id : null);

        if (isExpanding) {
            const product = products.find(p => p.id === id);
            // PART 또는 CONSUMABLE인 경우 '발주 이력' 탭을 기본으로
            if (product && (product.item_type === 'PART' || product.item_type === 'CONSUMABLE')) {
                setDetailSubTab('priceHistory');
                fetchPriceHistory(product);
            } else {
                setDetailSubTab('routing');
            }
        }
    };

    const fetchPriceHistory = async (product) => {
        if (!product) return;
        setLoadingHistory(true);
        try {
            const endpoint = product.item_type === 'PRODUCED'
                ? `/product/${product.id}/sales-history`
                : `/product/${product.id}/purchase-history`;
            const res = await api.get(endpoint);
            setPriceHistory(res.data);
        } catch (error) {
            console.error("Failed to fetch price history", error);
        } finally {
            setLoadingHistory(false);
        }
    };

    const updateToLatestPrice = async (index, productId, processId) => {
        if (!productId || !processId) return;
        try {
            const res = await api.get(`/product/${productId}/latest-cost/${processId}`);
            const latestCost = res.data.latest_cost;
            if (latestCost > 0) {
                updateRoutingProcess(index, 'cost', latestCost);
                alert(`최신 단가 ₩${latestCost.toLocaleString()}로 업데이트되었습니다.`);
            } else {
                alert("과거 구매/외주 이력이 없습니다.");
            }
        } catch (error) {
            console.error("Failed to fetch latest cost", error);
            alert("단가 정보를 불러오는데 실패했습니다.");
        }
    };

    const openCostHistory = async (index, productId, processId, procName) => {
        if (!productId || !processId) return;
        setHistoryTarget({ productName: (selectedProduct?.name || ''), processName: procName, productId, processId, index });
        setShowCostHistoryModal(true);
        setLoadingCostHistory(true);
        setCostHistory([]); // [Fix] Clear previous history to avoid ghosting
        try {
            const res = await api.get(`/product/${productId}/cost-history/${processId}`);
            setCostHistory(res.data);
        } catch (error) {
            console.error("Failed to fetch cost history", error);
        } finally {
            setLoadingCostHistory(false);
        }
    };

    const fetchBomItems = async (productId) => {
        setLoadingBom(true);
        try {
            const res = await api.get(`/product/products/${productId}/bom`);
            setBomItems(res.data);
        } catch (error) {
            console.error('Failed to fetch BOM', error);
        } finally {
            setLoadingBom(false);
        }
    };

    const openPartHistory = async (childProductId, childProductName) => {
        setPartHistoryTitle(childProductName);
        setShowPartHistoryModal(true);
        setLoadingPartHistory(true);
        try {
            const res = await api.get(`/sales/history/product/${childProductId}`);
            setPartHistoryData(res.data);
        } catch (error) {
            console.error(error);
            alert("이력을 불러오는데 실패했습니다.");
            setShowPartHistoryModal(false);
        } finally {
            setLoadingPartHistory(false);
        }
    };

    const handleSaveBom = async () => {
        if (!productFormData.id) return;
        setLoading(true);
        try {
            const payload = bomItems.map(item => ({
                child_product_id: item.child_product_id,
                required_quantity: item.required_quantity
            }));
            const res = await api.put(`/product/products/${productFormData.id}/bom`, payload);
            setBomItems(res.data);
            alert('BOM이 저장되었습니다.');
        } catch (error) {
            console.error('Failed to save BOM', error);
            alert('저장 실패: ' + (error.response?.data?.detail || error.message));
        } finally {
            setLoading(false);
        }
    };

    const addBomRow = () => {
        if (!bomNewRow.child_product_id) {
            alert('하위 품목을 선택하세요.');
            return;
        }
        if (parseInt(bomNewRow.child_product_id) === productFormData.id) {
            alert('자기 자신을 BOM 하위 품목으로 설정할 수 없습니다.');
            return;
        }
        const childProduct = allParts.find(p => p.id === parseInt(bomNewRow.child_product_id));
        if (!childProduct || childProduct.item_type !== 'PART') {
            alert('BOM 하위 품목은 "부품" 유형만 선택할 수 있습니다.');
            return;
        }

        setBomItems(prev => [...prev, {
            id: null, // 저장 전이라 id 없음
            parent_product_id: productFormData.id,
            child_product_id: parseInt(bomNewRow.child_product_id),
            required_quantity: parseFloat(bomNewRow.required_quantity) || 1,
            child_product: childProduct || { id: parseInt(bomNewRow.child_product_id), name: '(알 수 없음)' }
        }]);
        setBomNewRow({ child_product_id: '', required_quantity: 1 });
    };

    const removeBomRow = (index) => {
        setBomItems(prev => prev.filter((_, i) => i !== index));
    };

    const getPageTitle = () => {
        switch (type) {
            case 'PRODUCED': return '생산제품 관리';
            case 'PART': return '부품 관리';
            case 'CONSUMABLE': return '소모품 관리';
            case 'PROCESSES': return '공정 관리';
            default: return '제품 및 공정 관리';
        }
    };

    const getNewProductButtonText = () => {
        switch (type) {
            case 'PRODUCED': return '신규 생산제품 등록';
            case 'PART': return '신규 부품 등록';
            case 'CONSUMABLE': return '신규 소모품 등록';
            default: return '신규 제품 등록';
        }
    };

    return (
        <div className="space-y-6 relative">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold text-white tracking-tight">
                        {getPageTitle()}
                    </h2>
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
                        {type === 'PRODUCED' && (
                            <button
                                onClick={() => setActiveTab('processes')}
                                className={cn(
                                    "pb-2 text-sm font-medium transition-colors",
                                    activeTab === 'processes' ? "text-blue-500 border-b-2 border-blue-500" : "text-gray-400 hover:text-white"
                                )}
                            >
                                공정 관리 (마스터)
                            </button>
                        )}
                    </div>
                </div>

                {activeTab === 'products' && (
                    <button
                        type="button"
                        onClick={() => {
                            setProductFormData({
                                item_type: type === 'PROCESSES' ? 'PRODUCED' : type,
                                unit: 'EA'
                            });
                            setDetailSubTab('info');
                            setShowProductModal(true);
                        }}
                        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
                    >
                        <Plus className="w-4 h-4" />
                        <span>{getNewProductButtonText()}</span>
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
                                placeholder={type === 'PART' ? '부품명 검색...' : '제품명 검색...'}
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                        <Select
                            isClearable
                            placeholder="전체 사업부"
                            options={groups.filter(g => g.type === 'MAJOR').map(g => ({ value: g.id, label: g.name }))}
                            value={groups.find(g => g.id === selectedMajorGroupId) ? { value: selectedMajorGroupId, label: groups.find(g => g.id === selectedMajorGroupId).name } : null}
                            onChange={(opt) => setSelectedMajorGroupId(opt ? opt.value : "")}
                            styles={selectStyles}
                            className="min-w-[150px]"
                            menuPortalTarget={document.body}
                        />
                        <Select
                            isClearable
                            placeholder="전체 거래처"
                            options={partners.map(p => ({ value: p.id, label: p.name }))}
                            value={partners.find(p => p.id === selectedPartnerId) ? { value: selectedPartnerId, label: partners.find(p => p.id === selectedPartnerId).name } : null}
                            onChange={(opt) => setSelectedPartnerId(opt ? opt.value : "")}
                            styles={selectStyles}
                            className="min-w-[150px]"
                            menuPortalTarget={document.body}
                        />
                    </div>

                    {isCloneMode && (
                        <Box sx={{ p: 2, mb: 0, borderBottom: '1px solid #374151', bgcolor: '#fff3cd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography sx={{ color: '#856404', fontWeight: 'bold' }}>
                                🔄 [원본: {selectedSourceProduct?.name}] - 덮어씌울 대상 제품을 아래 리스트에서 체크해주세요.
                            </Typography>
                            <Box>
                                <Button variant="outlined" color="inherit" onClick={() => { setIsCloneMode(false); setTargetProductIds([]); }} sx={{ mr: 1, bgcolor: 'white', borderColor: '#ccc' }}>
                                    취소
                                </Button>
                                <Button variant="contained" color="error" onClick={handleExecuteOverwrite} disabled={targetProductIds.length === 0} sx={{ fontWeight: 'bold' }}>
                                    선택한 제품에 덮어쓰기 ({targetProductIds.length}건)
                                </Button>
                            </Box>
                        </Box>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full table-fixed text-left text-sm text-gray-400">
                            <thead className="bg-gray-900/50 text-xs uppercase font-medium text-gray-500">
                                <tr>
                                    {isCloneMode && <th className="px-3 py-3 w-10 text-center">선택</th>}
                                    <ResizableTh initialWidth={120} className="px-6 py-3">{type === 'PART' ? '구입처' : '거래처'}</ResizableTh>
                                    {type !== 'CONSUMABLE' && <ResizableTh initialWidth={150} className="px-6 py-3">{type === 'PART' ? '부품 그룹' : '제품 그룹'}</ResizableTh>}
                                    <ResizableTh initialWidth={200} className="px-6 py-3">{type === 'PART' ? '부품명' : '품명'}</ResizableTh>
                                    <ResizableTh initialWidth={120} className="px-6 py-3">규격</ResizableTh>
                                    {type !== 'CONSUMABLE' && <ResizableTh initialWidth={100} className="px-6 py-3">재질</ResizableTh>}
                                    <ResizableTh initialWidth={80} className="px-6 py-3">단위</ResizableTh>
                                    {type !== 'PART' && type !== 'CONSUMABLE' && <ResizableTh initialWidth={80} className="px-6 py-3">공정 수</ResizableTh>}
                                    <ResizableTh initialWidth={120} className="px-6 py-3">최근 단가</ResizableTh>
                                    <ResizableTh initialWidth={80} className="px-6 py-3">첨부파일</ResizableTh>
                                    <ResizableTh initialWidth={120} className="px-6 py-3">비고</ResizableTh>
                                    <ResizableTh initialWidth={120} className="px-6 py-3 text-right">관리</ResizableTh>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {loading ? (
                                    <tr><td colSpan="9" className="text-center py-8">Loading...</td></tr>
                                ) : (() => {
                                    const q = searchQuery.toLowerCase();
                                    const sorted = [...products]
                                        .filter(p => {
                                            // Search Query Filter
                                            const matchesSearch = !q || (
                                                (p.name || '').toLowerCase().includes(q) ||
                                                (p.specification || '').toLowerCase().includes(q) ||
                                                (partners.find(pt => pt.id === p.partner_id)?.name || '').toLowerCase().includes(q)
                                            );

                                            // Partner Selector Filter
                                            const matchesPartner = !selectedPartnerId || p.partner_id === selectedPartnerId;

                                            return matchesSearch && matchesPartner;
                                        })
                                        .sort((a, b) => {
                                            const pa = partners.find(pt => pt.id === a.partner_id)?.name || '';
                                            const pb = partners.find(pt => pt.id === b.partner_id)?.name || '';
                                            if (pa !== pb) return pa.localeCompare(pb);
                                            const ga = a.group_id ? (groups.find(g => g.id === a.group_id)?.name || '') : '';
                                            const gb = b.group_id ? (groups.find(g => g.id === b.group_id)?.name || '') : '';
                                            if (ga !== gb) return ga.localeCompare(gb);
                                            return (a.name || '').localeCompare(b.name || '');
                                        });
                                    return sorted.length > 0 ? sorted.map((product) => (
                                        <React.Fragment key={product.id}>
                                            <tr
                                                className={cn("hover:bg-gray-700/50 transition-colors cursor-pointer group", isCloneMode && targetProductIds.includes(product.id) ? "bg-blue-900/30" : "")}
                                                onClick={() => toggleExpand(product.id)}
                                                onDoubleClick={() => handleEditProduct(product)}
                                            >
                                                {isCloneMode && (
                                                    <td className="px-3 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                        <Checkbox
                                                            checked={targetProductIds.includes(product.id)}
                                                            disabled={product.id === selectedSourceProduct?.id}
                                                            onChange={(e) => {
                                                                if (e.target.checked) setTargetProductIds([...targetProductIds, product.id]);
                                                                else setTargetProductIds(targetProductIds.filter(id => id !== product.id));
                                                            }}
                                                            sx={{ color: 'gray', '&.Mui-checked': { color: '#3b82f6' } }}
                                                        />
                                                    </td>
                                                )}
                                                <td className="px-6 py-4">
                                                    {partners.find(p => p.id === product.partner_id)?.name || '-'}
                                                </td>
                                                {type !== 'CONSUMABLE' && (
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
                                                )}
                                                <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                                        <Package className="w-4 h-4 text-emerald-400" />
                                                    </div>
                                                    {product.name}
                                                </td>
                                                <td className="px-6 py-4">{product.specification}</td>
                                                {type !== 'CONSUMABLE' && <td className="px-6 py-4">{product.material}</td>}
                                                <td className="px-6 py-4">{product.unit}</td>
                                                {type !== 'PART' && type !== 'CONSUMABLE' && (
                                                    <td className="px-6 py-4">
                                                        <span className="bg-gray-700 text-white px-2 py-1 rounded text-xs">
                                                            {product.standard_processes ? product.standard_processes.length : 0} 공정
                                                        </span>
                                                    </td>
                                                )}
                                                <td className="px-6 py-4 font-medium text-blue-400">
                                                    {product.recent_price ? `₩${product.recent_price.toLocaleString()}` : '-'}
                                                </td>
                                                <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                                    {(() => {
                                                        let fileList = [];
                                                        try {
                                                            const parsed = safeParseJSON(product.drawing_file, null);
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
                                                <td className="px-6 py-4 text-gray-500 whitespace-normal break-all" title={product.note}>{product.note || '-'}</td>
                                                <td className="px-6 py-4 text-right flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setPrintProductId(product.id);
                                                        }}
                                                        className="text-gray-400 hover:text-blue-500"
                                                        title="공정도 인쇄"
                                                    >
                                                        <Printer className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleCloneClick(product);
                                                        }}
                                                        className={cn("text-gray-400 hover:text-emerald-400", isCloneMode && "opacity-30 cursor-not-allowed")}
                                                        disabled={isCloneMode}
                                                        title="복제"
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleEditProduct(product)}
                                                        className="text-gray-500 hover:text-blue-400"
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
                                                                <div className="flex space-x-4">
                                                                    {product.item_type === 'PRODUCED' && (
                                                                        <button
                                                                            onClick={() => setDetailSubTab('routing')}
                                                                            className={cn(
                                                                                "pb-2 text-xs font-semibold flex items-center gap-2 transition-colors",
                                                                                detailSubTab === 'routing' ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-500 hover:text-gray-300"
                                                                            )}
                                                                        >
                                                                            <Settings className="w-3.5 h-3.5" />
                                                                            공정 구성
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        onClick={() => {
                                                                            setDetailSubTab('priceHistory');
                                                                            fetchPriceHistory(product);
                                                                        }}
                                                                        className={cn(
                                                                            "pb-2 text-xs font-semibold flex items-center gap-2 transition-colors",
                                                                            detailSubTab === 'priceHistory' ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-500 hover:text-gray-300"
                                                                        )}
                                                                    >
                                                                        <History className="w-3.5 h-3.5" />
                                                                        {product.item_type === 'PRODUCED' ? '견적/수주 이력' : '발주 이력'}
                                                                    </button>
                                                                    {product.item_type === 'PRODUCED' && (
                                                                        <button
                                                                            onClick={() => {
                                                                                setDetailSubTab('bom');
                                                                                fetchBomItems(product.id);
                                                                            }}
                                                                            className={cn(
                                                                                "pb-2 text-xs font-semibold flex items-center gap-2 transition-colors",
                                                                                detailSubTab === 'bom' ? "text-blue-400 border-b-2 border-blue-400" : "text-gray-500 hover:text-gray-300"
                                                                            )}
                                                                        >
                                                                            <Package className="w-3.5 h-3.5" />
                                                                            BOM 부품목록
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {detailSubTab === 'routing' ? (
                                                                product.standard_processes && product.standard_processes.length > 0 ? (
                                                                    <div className="overflow-x-auto">
                                                                        <table className="w-full text-left text-sm text-gray-400">
                                                                            <thead className="bg-gray-800 text-xs uppercase font-medium text-gray-500">
                                                                                <tr>
                                                                                    <ResizableTh className="px-4 py-2 w-16 text-center">순서</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">공정명</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">구분</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">업체/장비</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">예상시간</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">공정단가</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">설명</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">첨부</ResizableTh>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-gray-700">
                                                                                {(product.standard_processes || []).slice().sort((a, b) => a.sequence - b.sequence).map((pp, idx) => (
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
                                                                                        <td className="px-4 py-2 text-orange-400">
                                                                                            {pp.cost ? `₩${pp.cost.toLocaleString()}` : '-'}
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
                                                                                                            fileList = safeParseJSON(pp.attachment_file, []);
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
                                                                        등록된 공정이 없습니다. 제품을 더블 클릭하여 '상세 공정'을 설정하세요.
                                                                    </div>
                                                                )
                                                            ) : detailSubTab === 'bom' ? (
                                                                // BOM Tab (inline)
                                                                <div>
                                                                    {loadingBom ? (
                                                                        <div className="text-center py-8 text-gray-500">로딩 중...</div>
                                                                    ) : bomItems.length > 0 ? (
                                                                        <table className="w-full text-left text-sm text-gray-400">
                                                                            <thead className="bg-gray-800 text-xs uppercase font-medium text-gray-500">
                                                                                <tr>
                                                                                    <ResizableTh className="px-4 py-2">품목 유형</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">품명</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">규격</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2 text-right">소요량</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">단위</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2 text-right">최근 단가</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2 text-center">이력</ResizableTh>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-gray-700">
                                                                                {bomItems.map((item, idx) => (
                                                                                    <tr key={idx} className="hover:bg-gray-800/50 transition-colors">
                                                                                        <td className="px-4 py-2">
                                                                                            <span className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-700/50 border-gray-600 text-gray-300">
                                                                                                {ITEM_TYPES[item.child_product?.item_type] || '-'}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="px-4 py-2 text-white font-medium">{item.child_product?.name || '(알 수 없음)'}</td>
                                                                                        <td className="px-4 py-2 text-xs text-gray-400">{item.child_product?.specification || '-'}</td>
                                                                                        <td className="px-4 py-2 text-right text-emerald-400 font-medium">{item.required_quantity}</td>
                                                                                        <td className="px-4 py-2 text-xs">{item.child_product?.unit || 'EA'}</td>
                                                                                        <td className="px-4 py-2 text-right font-medium text-blue-400">
                                                                                            {allParts.find(p => p.id === item.child_product_id)?.recent_price ?
                                                                                                `₩${allParts.find(p => p.id === item.child_product_id).recent_price.toLocaleString()}` : '-'}
                                                                                        </td>
                                                                                        <td className="px-4 py-2 text-center">
                                                                                            <button
                                                                                                onClick={() => openPartHistory(item.child_product_id, item.child_product?.name)}
                                                                                                className="p-1 hover:text-blue-400 text-gray-500 transition-colors"
                                                                                                title="단가 이력"
                                                                                            >
                                                                                                <History className="w-3.5 h-3.5" />
                                                                                            </button>
                                                                                        </td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    ) : (
                                                                        <div className="text-sm text-gray-500 py-4 text-center">등록된 BOM 항목이 없습니다.</div>
                                                                    )}
                                                                </div>
                                                            ) : (
                                                                // priceHistory Tab
                                                                <div className="overflow-x-auto">
                                                                    {loadingHistory ? (
                                                                        <div className="text-center py-8 text-gray-500">데이터 로딩 중...</div>
                                                                    ) : priceHistory.length > 0 ? (
                                                                        <table className="w-full text-left text-sm text-gray-400">
                                                                            <thead className="bg-gray-800 text-xs uppercase font-medium text-gray-500">
                                                                                <tr>
                                                                                    <ResizableTh className="px-4 py-2">날짜</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">구분</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">거래처</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">수량</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">단가</ResizableTh>
                                                                                    <ResizableTh className="px-4 py-2">비고</ResizableTh>
                                                                                </tr>
                                                                            </thead>
                                                                            <tbody className="divide-y divide-gray-700">
                                                                                {priceHistory.map((item, idx) => (
                                                                                    <tr key={idx} className="hover:bg-gray-800/50 transition-colors">
                                                                                        <td className="px-4 py-2">{item.date}</td>
                                                                                        <td className="px-4 py-2">
                                                                                            <span className={cn(
                                                                                                "text-[10px] px-1.5 py-0.5 rounded border",
                                                                                                item.type === 'QUOTATION' ? "bg-amber-900/30 border-amber-800 text-amber-300" :
                                                                                                    item.type === 'PURCHASE' ? "bg-blue-900/30 border-blue-800 text-blue-300" :
                                                                                                        "bg-emerald-900/30 border-emerald-800 text-emerald-300"
                                                                                            )}>
                                                                                                {item.type === 'QUOTATION' ? '견적' : item.type === 'PURCHASE' ? '발주' : '수주'}
                                                                                            </span>
                                                                                        </td>
                                                                                        <td className="px-4 py-2 text-white">{item.partner_name}</td>
                                                                                        <td className="px-4 py-2">{item.quantity}</td>
                                                                                        <td className="px-4 py-2 text-blue-400 font-medium">{item.unit_price.toLocaleString()}</td>
                                                                                        <td className="px-4 py-2 text-xs text-gray-500">{item.order_no || '-'}</td>
                                                                                    </tr>
                                                                                ))}
                                                                            </tbody>
                                                                        </table>
                                                                    ) : (
                                                                        <div className="text-sm text-gray-500 py-8 text-center">
                                                                            과거 견적 또는 수주 이력이 없습니다.
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )) : (
                                        <tr><td colSpan="9" className="text-center py-8">등록된 제품이 없습니다.</td></tr>
                                    );
                                })()
                                }
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
                        // [Fix] Convert integer IDs to strings so <select> value comparison works correctly
                        const formattedData = initData ? {
                            ...initData,
                            major_group_id: initData.major_group_id != null ? String(initData.major_group_id) : '',
                            group_id: initData.group_id != null ? String(initData.group_id) : '',
                        } : {};
                        setProcessFormData(formattedData);
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

            {/* Unified Product Modal (Info + Routing + History) */}
            {showProductModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-4xl shadow-2xl overflow-hidden animation-fade-in flex flex-col h-[85vh]">
                        {/* Modal Header */}
                        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                            <div>
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    <Package className="w-5 h-5 text-emerald-500" />
                                    {productFormData.id ? `제품 정보: ${productFormData.name}` : "신규 제품 등록"}
                                </h3>
                                {(productFormData.id || routingProcesses.length > 0) && (
                                    <div className="flex gap-4 mt-3">
                                        {['info', ...((productFormData.item_type === 'PRODUCED' || (!productFormData.id && routingProcesses.length > 0)) ? ['routing'] : []), ...(productFormData.id ? ['history'] : []), ...(BOM_ITEM_TYPES.includes(productFormData.item_type) ? ['bom'] : [])].map((tab) => (
                                            <button
                                                key={tab}
                                                className={cn(
                                                    "px-3 py-1.5 text-xs font-semibold rounded-md transition-all border",
                                                    (tab === 'info' && detailSubTab === 'info') ||
                                                        (tab === 'routing' && detailSubTab === 'routing') ||
                                                        (tab === 'history' && detailSubTab === 'priceHistory') ||
                                                        (tab === 'bom' && detailSubTab === 'bom')
                                                        ? "bg-blue-600/20 border-blue-500 text-blue-400 shadow-sm"
                                                        : "border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-700/50"
                                                )}
                                                type="button"
                                                onClick={() => {
                                                    if (tab === 'info') setDetailSubTab('info');
                                                    else if (tab === 'routing') setDetailSubTab('routing');
                                                    else if (tab === 'history') setDetailSubTab('priceHistory');
                                                    else if (tab === 'bom') setDetailSubTab('bom');
                                                }}
                                            >
                                                {tab === 'info' ? '기본 정보' : tab === 'routing' ? '상세 공정' : tab === 'bom' ? '🧩 BOM' : (productFormData.item_type === 'PRODUCED' ? '견적/수주 이력' : '발주 이력')}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            <button onClick={() => setShowProductModal(false)} className="text-gray-400 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar">
                            {(detailSubTab === 'info' || (!productFormData.id && routingProcesses.length === 0)) && (
                                <form id="productForm" onSubmit={handleCreateProduct} className="space-y-6 max-w-3xl mx-auto py-2">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">거래처 <span className="text-red-500">*</span></label>
                                                <CreatableSelect
                                                    isClearable
                                                    options={partnerOptions}
                                                    value={partnerOptions.find(opt => opt.value === parseInt(productFormData.partner_id)) || null}
                                                    onChange={(option) => {
                                                        setProductFormData(prev => ({ ...prev, partner_id: option ? option.value : "" }));
                                                    }}
                                                    onCreateOption={handleCreatePartner}
                                                    placeholder="거래처 검색 또는 신규 입력"
                                                    noOptionsMessage={() => "검색 결과가 없습니다"}
                                                    formatCreateLabel={(inputValue) => `"${inputValue}" 신규 등록`}
                                                    menuPosition="fixed"
                                                    menuPortalTarget={document.body}
                                                    className="text-sm"
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
                                                            '&:hover': {
                                                                borderColor: 'rgb(75, 85, 99)'
                                                            }
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
                                                            color: 'white',
                                                            '&:active': {
                                                                backgroundColor: 'rgb(75, 85, 99)'
                                                            }
                                                        }),
                                                        singleValue: (base) => ({
                                                            ...base,
                                                            color: 'white'
                                                        }),
                                                        input: (base) => ({
                                                            ...base,
                                                            color: 'white'
                                                        }),
                                                        placeholder: (base) => ({
                                                            ...base,
                                                            color: 'rgb(156, 163, 175)'
                                                        })
                                                    }}
                                                />
                                            </div>

                                            {type !== 'CONSUMABLE' && (
                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">대그룹</label>
                                                        <select
                                                            name="major_group_id"
                                                            onChange={handleProductInputChange}
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
                                                            onChange={handleProductInputChange}
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
                                                <input name="name" value={productFormData.name || ""} onChange={handleProductInputChange} className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" required placeholder="제품명을 입력하세요" />
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">규격</label>
                                                <input name="specification" value={productFormData.specification || ""} onChange={handleProductInputChange} className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" placeholder="규격/사양" />
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <div className="grid grid-cols-2 gap-3">
                                                {type !== 'CONSUMABLE' && (
                                                    <div className="space-y-2">
                                                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">재질</label>
                                                        <input name="material" value={productFormData.material || ""} onChange={handleProductInputChange} className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" placeholder="재질" />
                                                    </div>
                                                )}
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">단위</label>
                                                    <input name="unit" value={productFormData.unit || "EA"} onChange={handleProductInputChange} className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm" placeholder="EA" />
                                                </div>
                                            </div>

                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-emerald-400 font-bold uppercase tracking-wider">최근 단가 (₩)</label>
                                                <input 
                                                    name="recent_price" 
                                                    type="number"
                                                    value={productFormData.recent_price || 0} 
                                                    onChange={handleProductInputChange} 
                                                    className="w-full bg-emerald-900/10 border border-emerald-500/30 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 transition-all text-sm font-medium" 
                                                    placeholder="0" 
                                                />
                                            </div>


                                            {/* Item Type selection removed as requested - auto-assigned from background */}

                                            <div className="space-y-2">
                                                <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">비고</label>
                                                <textarea name="note" value={productFormData.note || ""} onChange={handleProductInputChange} className="w-full bg-gray-900/50 border border-gray-700 text-white rounded-lg px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all h-[106px] resize-none text-sm" placeholder="특이사항 입력" />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-3 pt-2">
                                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">도면 및 첨부 파일</label>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            <div className="border-2 border-dashed border-gray-700 rounded-xl p-6 text-center hover:bg-gray-700/20 hover:border-gray-600 transition-all relative group h-full flex flex-col items-center justify-center min-h-[120px]">
                                                <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={handleFileChange} />
                                                <div className="flex flex-col items-center gap-2 text-gray-500 group-hover:text-gray-400">
                                                    <Upload className="w-8 h-8" />
                                                    <div className="text-xs">
                                                        <p className="font-medium">클릭하여 파일 업로드</p>
                                                        <p className="mt-1 text-[10px] opacity-70">PDF, 이미지, CAD 파일 등</p>
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
                                                            <div key={idx} className="flex items-center justify-between bg-gray-900/80 border border-gray-700 rounded-lg px-3 py-2.5 group">
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    <div className="p-1.5 bg-blue-500/10 rounded">
                                                                        <FileText className="w-3.5 h-3.5 text-blue-400" />
                                                                    </div>
                                                                    <span className="text-xs text-gray-300 truncate">{file.name}</span>
                                                                </div>
                                                                <button type="button" onClick={() => handleRemoveFile(idx)} className="text-gray-500 hover:text-red-400 p-1 transition-colors">
                                                                    <Trash2 className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        ));
                                                    }
                                                    return (
                                                        <div className="h-full flex items-center justify-center border border-gray-700/50 rounded-xl bg-gray-900/20 py-8 px-4">
                                                            <p className="text-[11px] text-gray-600 italic">첨부된 도면이 없습니다</p>
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                </form>
                            )}

                            {(detailSubTab === 'routing' && (productFormData.id || routingProcesses.length > 0)) && (
                                <div className="space-y-4">
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
                                        <div className="text-center py-20 border border-dashed border-gray-700 rounded-lg text-gray-500">
                                            작성된 공정이 없습니다. '공정 추가' 버튼을 눌러 구성하세요.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {routingProcesses.map((p, index) => (
                                                <div
                                                    key={p._tempId || index}
                                                    className="flex flex-col gap-3 bg-gray-700/20 p-4 rounded-lg border border-gray-700 group relative"
                                                    draggable
                                                    onDragStart={(e) => handleDragStart(e, index)}
                                                    onDragEnter={(e) => handleDragEnter(e, index)}
                                                    onDragEnd={handleDragEnd}
                                                    onDragOver={(e) => e.preventDefault()}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex items-center justify-center w-7 h-7 rounded-full bg-gray-900 text-gray-500 text-[10px] font-bold shrink-0 border border-gray-700 cursor-move">
                                                            {index + 1}
                                                        </div>
                                                        <div className="flex-1 grid grid-cols-12 gap-3">
                                                            <div className="col-span-4">
                                                                <CreatableSelect
                                                                    isClearable
                                                                    options={processes
                                                                        .filter(proc => !proc.group_id || String(proc.group_id) === String(productFormData.group_id))
                                                                        .map(proc => ({ value: proc.id, label: proc.name }))}
                                                                    value={processes.find(pr => pr.id == p.process_id) ? { value: p.process_id, label: processes.find(pr => pr.id == p.process_id).name } : null}
                                                                    onChange={(selected) => {
                                                                        updateRoutingProcess(index, 'process_id', selected ? selected.value : "");
                                                                    }}
                                                                    onCreateOption={(inputValue) => {
                                                                        setQuickProcessData({
                                                                            name: inputValue,
                                                                            course_type: "INTERNAL",
                                                                            major_group_id: productFormData.major_group_id ? parseInt(productFormData.major_group_id) : null,
                                                                            group_id: productFormData.group_id ? parseInt(productFormData.group_id) : null,
                                                                            index: index
                                                                        });
                                                                        setShowQuickProcessModal(true);
                                                                    }}
                                                                    styles={selectStyles}
                                                                    placeholder="(공정 선택 및 입력)"
                                                                    menuPortalTarget={document.body}
                                                                    formatCreateLabel={(inputValue) => `"${inputValue}" 신규 등록`}
                                                                />
                                                            </div>
                                                            <div className="col-span-4">
                                                                <input
                                                                    type="text"
                                                                    value={p.partner_name || p.equipment_name || ""}
                                                                    onChange={(e) => {
                                                                        const proc = processes.find(pr => pr.id == p.process_id);
                                                                        const type = p.course_type || (proc ? proc.course_type : 'INTERNAL');
                                                                        updateRoutingProcess(index, (type === 'INTERNAL' ? 'equipment_name' : 'partner_name'), e.target.value);
                                                                    }}
                                                                    className="w-full bg-gray-900 border border-gray-600 text-white text-xs rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                    placeholder="업체/장비명"
                                                                />
                                                            </div>
                                                            <div className="col-span-2">
                                                                <input
                                                                    type="number"
                                                                    value={p.estimated_time}
                                                                    onChange={(e) => updateRoutingProcess(index, 'estimated_time', e.target.value)}
                                                                    className="w-full bg-gray-900 border border-gray-600 text-white text-xs rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none text-right"
                                                                    placeholder="시간(분)"
                                                                />
                                                            </div>
                                                            <div className="col-span-2 flex justify-end">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeRoutingProcess(index)}
                                                                    className="text-gray-500 hover:text-red-400"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-12 gap-3 pl-10">
                                                        <div className="col-span-3">
                                                            <div className="relative">
                                                                <input
                                                                    type="number"
                                                                    value={p.cost}
                                                                    onChange={(e) => updateRoutingProcess(index, 'cost', e.target.value)}
                                                                    className="w-full bg-gray-900 border border-gray-600 text-white text-xs rounded pl-2 pr-12 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                    placeholder="단가"
                                                                />
                                                                <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-0.5">
                                                                    <button type="button" onClick={() => updateToLatestPrice(index, productFormData.id, p.process_id)} className="p-1 hover:text-emerald-400 text-gray-500 transition-colors" title="최근가"><Save className="w-3 h-3" /></button>
                                                                    <button type="button" onClick={() => openCostHistory(index, productFormData.id, p.process_id, processes.find(pr => pr.id == p.process_id)?.name)} className="p-1 hover:text-blue-400 text-gray-500 transition-colors" title="이력"><History className="w-3 h-3" /></button>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <div className="col-span-9">
                                                            <input
                                                                type="text"
                                                                value={p.notes || ""}
                                                                onChange={(e) => updateRoutingProcess(index, 'notes', e.target.value)}
                                                                className="w-full bg-gray-900 border border-gray-600 text-white text-xs rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none"
                                                                placeholder="작업 내용 메모"
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {detailSubTab === 'priceHistory' && productFormData.id && (
                                <div className="space-y-4">
                                    {loadingHistory ? (
                                        <div className="text-center py-20 text-gray-500 text-sm">로딩 중...</div>
                                    ) : priceHistory.length > 0 ? (
                                        <div className="overflow-x-auto rounded-lg border border-gray-700">
                                            <table className="w-full text-left text-xs">
                                                <thead className="bg-gray-900/80 text-gray-400 uppercase font-medium">
                                                    <tr>
                                                        <th className="px-4 py-3">날짜</th>
                                                        <th className="px-4 py-3">구분</th>
                                                        <th className="px-4 py-3">거래처</th>
                                                        <th className="px-4 py-3 text-right">수량</th>
                                                        <th className="px-4 py-3 text-right">적용 단가</th>
                                                        <th className="px-4 py-3 text-right">합계 금액</th>
                                                        <th className="px-4 py-3">비고</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-700 text-gray-300">
                                                    {priceHistory.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-gray-700/30 transition-colors">
                                                            <td className="px-4 py-3">{item.date}</td>
                                                            <td className="px-4 py-3">
                                                                <span className={cn(
                                                                    "px-2 py-0.5 rounded text-[10px] font-bold border",
                                                                    item.type === 'QUOTATION' ? "bg-amber-900/20 border-amber-800 text-amber-400" : "bg-emerald-900/20 border-emerald-800 text-emerald-400"
                                                                )}>
                                                                    {item.type === 'QUOTATION' ? '견적' : '수주'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3">{item.partner_name}</td>
                                                            <td className="px-4 py-3 text-right">{item.quantity.toLocaleString()}</td>
                                                            <td className="px-4 py-3 text-right text-blue-400 font-medium font-mono">₩{item.unit_price.toLocaleString()}</td>
                                                            <td className="px-4 py-3 text-right text-emerald-400 font-bold font-mono">₩{item.total_amount?.toLocaleString()}</td>
                                                            <td className="px-4 py-3 text-gray-500 font-mono">{item.order_no || '-'}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-20 text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg">
                                            매출(견적/수주) 이력이 없습니다.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* BOM Tab */}
                            {detailSubTab === 'bom' && productFormData.id && (
                                <div className="space-y-4">
                                    <div className="text-xs text-gray-300 bg-blue-900/40 border border-blue-800/50 rounded-lg px-4 py-2">
                                        💡 <strong className="text-white">하위 부품 목록</strong>을 설정하세요. 저장 버튼을 눌러야 반영됩니다.
                                    </div>

                                    {/* BOM \ud56d\ubaa9 \uc785\ub825 */}
                                    <div className="flex items-center gap-2 bg-gray-900/50 border border-gray-700 rounded-lg p-3">
                                        <div className="flex-1">
                                            <CreatableSelect
                                                isClearable
                                                options={allParts
                                                    .filter(p => p.id !== productFormData.id && p.item_type !== 'CONSUMABLE')
                                                    .map(p => ({ 
                                                        value: p.id, 
                                                        label: `[${ITEM_TYPES[p.item_type] || p.item_type || '-'}] ${p.name} ${p.specification ? `(${p.specification})` : ''}` 
                                                    }))}
                                                value={allParts.find(p => p.id == bomNewRow.child_product_id) ? { 
                                                    value: bomNewRow.child_product_id, 
                                                    label: `[${ITEM_TYPES[allParts.find(p => p.id == bomNewRow.child_product_id).item_type] || '-'}] ${allParts.find(p => p.id == bomNewRow.child_product_id).name} ${allParts.find(p => p.id == bomNewRow.child_product_id).specification ? `(${allParts.find(p => p.id == bomNewRow.child_product_id).specification})` : ''}`
                                                } : null}
                                                onChange={(selected) => {
                                                    setBomNewRow(prev => ({ ...prev, child_product_id: selected ? selected.value : "" }));
                                                }}
                                                onCreateOption={(inputValue) => {
                                                    setQuickPartData({
                                                        name: inputValue,
                                                        specification: "",
                                                        unit: "EA",
                                                        partner_id: "",
                                                        major_group_id: productFormData.major_group_id || "",
                                                        group_id: productFormData.group_id || ""
                                                    });
                                                    setShowQuickPartModal(true);
                                                }}
                                                styles={selectStyles}
                                                placeholder="하위 품목 검색 및 신규 등록..."
                                                menuPortalTarget={document.body}
                                                formatCreateLabel={(inputValue) => `"${inputValue}" 신규 등록`}
                                            />
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                min="0.001"
                                                step="0.001"
                                                value={bomNewRow.required_quantity}
                                                onChange={(e) => setBomNewRow(prev => ({ ...prev, required_quantity: e.target.value }))}
                                                className="w-24 bg-gray-900 border border-gray-600 text-white text-sm rounded px-2 py-1.5 outline-none focus:ring-1 focus:ring-blue-500 text-right"
                                                placeholder="수량"
                                            />
                                            <span className="text-xs text-gray-500">{products.find(p => p.id === parseInt(bomNewRow.child_product_id))?.unit || 'EA'}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={addBomRow}
                                            className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                        >
                                            <Plus className="w-3.5 h-3.5" /> 추가
                                        </button>
                                    </div>

                                    {/* BOM \ubaa9\ub85d */}
                                    {loadingBom ? (
                                        <div className="text-center py-8 text-gray-500 text-sm">로딩 중...</div>
                                    ) : bomItems.length > 0 ? (
                                        <div className="rounded-lg border border-gray-700 overflow-hidden">
                                            <table className="w-full text-left text-sm">
                                                <thead className="bg-gray-900/80 text-xs text-gray-400 uppercase font-medium">
                                                    <tr>
                                                        <th className="px-4 py-3">품목 유형</th>
                                                        <th className="px-4 py-3">품명</th>
                                                        <th className="px-4 py-3">규격</th>
                                                        <th className="px-4 py-3 text-right">소요량</th>
                                                        <th className="px-4 py-3">단위</th>
                                                        <th className="px-4 py-3 text-right">최근 단가</th>
                                                        <th className="px-4 py-3 text-center">동작</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-700 text-gray-300">
                                                    {bomItems.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-gray-700/30 transition-colors">
                                                            <td className="px-4 py-3">
                                                                <span className="text-[10px] px-1.5 py-0.5 rounded border bg-gray-700/50 border-gray-600 text-gray-300">
                                                                    {ITEM_TYPES[item.child_product?.item_type] || '-'}
                                                                </span>
                                                            </td>
                                                            <td className="px-4 py-3 text-white font-medium">{item.child_product?.name || '(알 수 없음)'}</td>
                                                            <td className="px-4 py-3 text-gray-400 text-xs">{item.child_product?.specification || '-'}</td>
                                                            <td className="px-4 py-3 text-right">
                                                                <input
                                                                    type="number"
                                                                    min="0.001"
                                                                    step="0.001"
                                                                    value={item.required_quantity}
                                                                    onChange={(e) => setBomItems(prev => prev.map((b, i) => i === idx ? { ...b, required_quantity: parseFloat(e.target.value) || 1 } : b))}
                                                                    className="w-20 bg-gray-900 border border-gray-600 text-white text-xs rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500 text-right"
                                                                />
                                                            </td>
                                                            <td className="px-4 py-3 text-xs text-gray-400">{item.child_product?.unit || 'EA'}</td>
                                                            <td className="px-4 py-3 text-right font-medium text-blue-400">
                                                                {allParts.find(p => p.id === item.child_product_id)?.recent_price ?
                                                                    `₩${allParts.find(p => p.id === item.child_product_id).recent_price.toLocaleString()}` : '-'}
                                                            </td>
                                                            <td className="px-4 py-3 text-center">
                                                                <div className="flex items-center justify-center gap-2">
                                                                    <button type="button" onClick={() => openPartHistory(item.child_product_id, item.child_product?.name)} className="text-gray-500 hover:text-blue-400 transition-colors" title="이력">
                                                                        <History className="w-4 h-4" />
                                                                    </button>
                                                                    <button type="button" onClick={() => removeBomRow(idx)} className="text-gray-500 hover:text-red-400 transition-colors" title="삭제">
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="text-center py-16 border border-dashed border-gray-700 rounded-lg text-gray-500 text-sm">
                                            등록된 하위 부품이 없습니다. 위에서 품목을 추가하세요.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 border-t border-gray-700 bg-gray-900/50 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowProductModal(false)}
                                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                            >
                                닫기
                            </button>
                            {(detailSubTab === 'info' || !productFormData.id) && (
                                <button
                                    type="submit"
                                    form="productForm"
                                    disabled={loading}
                                    className={cn(
                                        "px-6 py-2 rounded-lg text-sm font-medium text-white transition-all shadow-lg flex items-center gap-2",
                                        loading ? "bg-gray-600" : "bg-blue-600 hover:bg-blue-500 shadow-blue-900/40"
                                    )}
                                >
                                    {loading ? "처리 중..." : (productFormData.id ? "기본 정보 수정" : "제품 등록")}
                                </button>
                            )}
                            {detailSubTab === 'routing' && productFormData.id && (
                                <button
                                    onClick={handleSaveRouting}
                                    disabled={loading}
                                    className={cn(
                                        "px-6 py-2 rounded-lg text-sm font-medium text-white transition-all shadow-lg flex items-center gap-2",
                                        loading ? "bg-gray-600" : "bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40"
                                    )}
                                >
                                    <Save className="w-4 h-4" />
                                    {loading ? "저장 중..." : "공정 설정 저장"}
                                </button>
                            )}
                            {detailSubTab === 'bom' && productFormData.id && (
                                <button
                                    type="button"
                                    onClick={handleSaveBom}
                                    disabled={loading}
                                    className={cn(
                                        "px-6 py-2 rounded-lg text-sm font-medium text-white transition-all shadow-lg flex items-center gap-2",
                                        loading ? "bg-gray-600" : "bg-purple-600 hover:bg-purple-500 shadow-purple-900/40"
                                    )}
                                >
                                    <Save className="w-4 h-4" />
                                    {loading ? "저장 중..." : "BOM 저장"}
                                </button>
                            )}
                        </div>
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

            {/* Cost History Sub-Modal */}
            {showCostHistoryModal && (
                <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-4">
                    <div className="bg-gray-800 rounded-lg border border-gray-700 w-full max-w-lg shadow-2xl flex flex-col max-h-[70vh]">
                        <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/40">
                            <div>
                                <h3 className="text-white font-bold flex items-center gap-2">
                                    <History className="w-4 h-4 text-blue-400" />
                                    단가 변동 이력
                                </h3>
                                <p className="text-[10px] text-gray-500 mt-0.5">{historyTarget.productName} &gt; {historyTarget.processName}</p>
                            </div>
                            <button onClick={() => setShowCostHistoryModal(false)} className="text-gray-500 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-4 overflow-y-auto">
                            {loadingCostHistory ? (
                                <div className="text-center py-8 text-gray-500">로딩 중...</div>
                            ) : costHistory.length > 0 ? (
                                <table className="w-full text-xs text-left">
                                    <thead className="text-gray-500 uppercase bg-gray-900/50">
                                        <tr>
                                            <th className="px-3 py-2">거래일자</th>
                                            <th className="px-3 py-2">거래처</th>
                                            <th className="px-3 py-2 text-right">단가</th>
                                            <th className="px-3 py-2 text-center w-12">선택</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-700 text-gray-300">
                                        {costHistory.map((h, i) => (
                                            <tr key={i} className="hover:bg-gray-700/50">
                                                <td className="px-3 py-2">{h.date}</td>
                                                <td className="px-3 py-2">{h.partner_name || '-'}</td>
                                                <td className="px-3 py-2 text-right text-blue-400 font-medium">₩{h.unit_price.toLocaleString()}</td>
                                                <td className="px-3 py-2 text-center">
                                                    <button
                                                        onClick={() => {
                                                            updateRoutingProcess(historyTarget.index, 'cost', h.unit_price);
                                                            setShowCostHistoryModal(false);
                                                        }}
                                                        className="text-[10px] bg-blue-600/20 text-blue-400 hover:bg-blue-600/40 px-1.5 py-0.5 rounded border border-blue-600/30"
                                                    >
                                                        적용
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            ) : (
                                <div className="text-center py-10 text-gray-500">
                                    비용 변동 이력이 없습니다.
                                </div>
                            )}
                        </div>

                        <div className="p-3 border-t border-gray-700 flex justify-end bg-gray-900/20">
                            <button onClick={() => setShowCostHistoryModal(false)} className="px-4 py-1.5 bg-gray-700 text-white rounded text-sm hover:bg-gray-600 transition-colors">닫기</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Quick Process Registration Modal */}
            {showQuickProcessModal && (
                <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md shadow-2xl overflow-hidden animation-fade-in">
                        <div className="flex items-center justify-between p-4 border-b border-gray-700 bg-gray-900/50">
                            <h3 className="text-md font-bold text-white flex items-center gap-2">
                                <Bolt className="w-4 h-4 text-blue-400" />
                                빠른 공정 등록
                            </h3>
                            <button onClick={() => setShowQuickProcessModal(false)} className="text-gray-400 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleQuickCreateProcess} className="p-5 space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-gray-400">공정명</label>
                                <input
                                    value={quickProcessData.name}
                                    readOnly
                                    className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none text-sm"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-gray-400">대그룹 (상속)</label>
                                    <div className="w-full bg-gray-800 border border-gray-700 text-gray-400 rounded-lg px-3 py-2 text-sm italic">
                                        {groups.find(g => g.id === quickProcessData.major_group_id)?.name || "미지정"}
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-xs font-medium text-gray-400">소그룹 (상속)</label>
                                    <div className="w-full bg-gray-800 border border-gray-700 text-gray-400 rounded-lg px-3 py-2 text-sm italic">
                                        {groups.find(g => g.id === quickProcessData.group_id)?.name || "미지정"}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-gray-400">공정 구분</label>
                                <select
                                    value={quickProcessData.course_type}
                                    onChange={(e) => setQuickProcessData(prev => ({ ...prev, course_type: e.target.value }))}
                                    className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
                                >
                                    <option value="INTERNAL">내부</option>
                                    <option value="OUTSOURCING">외주</option>
                                    <option value="PURCHASE">구매</option>
                                </select>
                            </div>

                            <div className="pt-4 flex justify-end gap-2 border-t border-gray-700 mt-4">
                                <button type="button" onClick={() => setShowQuickProcessModal(false)} className="px-4 py-1.5 rounded text-xs font-medium text-gray-400 hover:text-white transition-colors">취소</button>
                                <button type="submit" className="px-5 py-1.5 rounded text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all">등록 및 선택</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <FileViewerModal
                isOpen={showFileModal}
                onClose={() => setShowFileModal(false)}
                files={viewingFiles}
                title={fileModalTitle}
                onDeleteFile={(index) => handleDeleteAttachment(viewingTargetId, index)}
            />

            {/* Part History Modal */}
            {showPartHistoryModal && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                    <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-2xl shadow-2xl overflow-hidden animation-fade-in">
                        <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <History className="w-5 h-5 text-blue-400" />
                                [{partHistoryTitle}] 단가 이력
                            </h3>
                            <button onClick={() => setShowPartHistoryModal(false)} className="text-gray-400 hover:text-white transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <div className="p-6">
                            {loadingPartHistory ? (
                                <div className="text-center py-12 text-gray-500">이력을 불러오는 중...</div>
                            ) : partHistoryData.length > 0 ? (
                                <div className="overflow-hidden rounded-lg border border-gray-700">
                                    <table className="w-full text-left text-sm">
                                        <thead className="bg-gray-900/80 text-gray-400 uppercase font-medium">
                                            <tr>
                                                <th className="px-4 py-3">일자</th>
                                                <th className="px-4 py-3">구분</th>
                                                <th className="px-4 py-3">공급처/거래처</th>
                                                <th className="px-4 py-3 text-right">수량</th>
                                                <th className="px-4 py-3 text-right">단가</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-700 text-gray-300">
                                            {partHistoryData.map((h, i) => (
                                                <tr key={i} className="hover:bg-gray-700/30 transition-colors">
                                                    <td className="px-4 py-3 whitespace-nowrap">{h.date}</td>
                                                    <td className="px-4 py-3 whitespace-nowrap">
                                                        <span className={cn(
                                                            "px-2 py-0.5 rounded text-[10px] font-bold border",
                                                            h.type === 'QUOTATION' ? "bg-amber-900/20 border-amber-800 text-amber-400" :
                                                                h.type === 'ORDER' ? "bg-emerald-900/20 border-emerald-800 text-emerald-400" :
                                                                    "bg-gray-900/20 border-gray-800 text-gray-400"
                                                        )}>
                                                            {h.type === 'QUOTATION' ? '견적' : h.type === 'ORDER' ? '수주' : h.type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 truncate max-w-[150px]">{h.partner_name}</td>
                                                    <td className="px-4 py-3 text-right">{h.quantity ? h.quantity.toLocaleString() : '-'}</td>
                                                    <td className="px-4 py-3 text-right text-blue-400 font-medium">₩{h.unit_price ? h.unit_price.toLocaleString() : '0'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-gray-500 border border-dashed border-gray-700 rounded-lg">
                                    단가 변동 이력이 없습니다.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
            
            {/* Print Process Chart Overlay */}
            {printProductId && (
                <ProcessChartTemplate 
                    productId={printProductId} 
                    onClose={() => setPrintProductId(null)} 
                />
            )}

            {/* Smart Clone Mode Choice Dialog */}
            <Dialog open={cloneChoiceModalOpen} onClose={() => setCloneChoiceModalOpen(false)} maxWidth="xs" fullWidth>
                <DialogTitle sx={{ fontWeight: 'bold', textAlign: 'center', pt: 3 }}>
                    어떤 방식으로 복제할까요?
                </DialogTitle>
                <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
                    <Button 
                        variant="outlined" 
                        size="large" 
                        sx={{ py: 2, fontWeight: 'bold', fontSize: '1.1rem' }}
                        onClick={() => {
                            setCloneChoiceModalOpen(false);
                            handleDuplicateProduct(selectedSourceProduct); // 기존 신규등록 모달 호출
                        }}
                    >
                        ✨ 신규 제품으로 복제 (새로 등록)
                    </Button>
                    <Button 
                        variant="contained" 
                        color="primary" 
                        size="large" 
                        sx={{ py: 2, fontWeight: 'bold', fontSize: '1.1rem', bgcolor: '#2563eb' }}
                        onClick={() => {
                            setCloneChoiceModalOpen(false);
                            setIsCloneMode(true);
                            setTargetProductIds([]);
                        }}
                    >
                        🔄 기존 제품에 덮어쓰기 (공정/BOM)
                    </Button>
                </DialogContent>
            </Dialog>

            {/* Quick Part Registration Modal (Sub-modal for BOM) */}
            <ProductModal
                isOpen={showQuickPartModal}
                onClose={() => setShowQuickPartModal(false)}
                onSuccess={handleQuickPartSuccess}
                initialData={quickPartData}
                type="PART"
            />
        </div>
    );
};

export default ProductsPage;
