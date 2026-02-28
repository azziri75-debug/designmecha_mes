import React, { useEffect, useState } from 'react';
import api from '../lib/api';
import { Plus, Search, Building2, User, MoreHorizontal, X, UserPlus, Phone, Mail, Pencil, Trash, Smartphone, Upload, FileText, MapPin, Factory } from 'lucide-react';
import { cn, getImageUrl } from '../lib/utils';

import FileViewerModal from '../components/FileViewerModal';
import Card from '../components/Card';

// Helper Components
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error("ErrorBoundary caught an error", error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="p-8 text-center text-red-400 bg-gray-800 rounded-xl border border-red-500/30">
                    <h2 className="text-xl font-bold mb-2">오류가 발생했습니다</h2>
                    <p className="text-sm text-gray-400 mb-4">페이지를 로드하는 중 문제가 발생했습니다.</p>
                    <pre className="text-xs bg-gray-900 p-4 rounded text-left overflow-auto max-w-lg mx-auto">
                        {this.state.error && this.state.error.toString()}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

// Auto-hyphenation helper
const autoHyphen = (value, type) => {
    const rawValue = value.replace(/[^0-9]/g, '');
    let result = '';

    if (type === 'bizNum') {
        if (rawValue.length < 4) {
            return rawValue;
        } else if (rawValue.length < 6) {
            result = rawValue.substr(0, 3) + '-' + rawValue.substr(3);
        } else {
            result = rawValue.substr(0, 3) + '-' + rawValue.substr(3, 2) + '-' + rawValue.substr(5);
        }
    } else if (type === 'phone') {
        if (rawValue.length < 4) {
            return rawValue;
        } else if (rawValue.length < 7) {
            result = rawValue.substr(0, 3) + '-' + rawValue.substr(3);
        } else if (rawValue.length < 11) {
            result = rawValue.substr(0, 3) + '-' + rawValue.substr(3, 3) + '-' + rawValue.substr(6);
        } else {
            result = rawValue.substr(0, 3) + '-' + rawValue.substr(3, 4) + '-' + rawValue.substr(7);
        }
    }
    return result;
}

const BasicsPageContent = () => {
    const [activeTab, setActiveTab] = useState('partners');

    const [partners, setPartners] = useState([]);
    const [staff, setStaff] = useState([]);
    const [equipments, setEquipments] = useState([]);
    const [instruments, setInstruments] = useState([]);
    const [company, setCompany] = useState(null); // eslint-disable-line no-unused-vars
    const [loading, setLoading] = useState(true);

    // Modal States
    const [showModal, setShowModal] = useState(false);
    const [modalType, setModalType] = useState('create'); // 'create', 'edit', 'add_contact', 'edit_contact'
    const [selectedPartner, setSelectedPartner] = useState(null);
    const [selectedContact, setSelectedContact] = useState(null);
    const [selectedStaff, setSelectedStaff] = useState(null); // For editing staff
    const [selectedEquipment, setSelectedEquipment] = useState(null);
    const [selectedInstrument, setSelectedInstrument] = useState(null);
    const [selectedHistory, setSelectedHistory] = useState(null);

    // File Viewer Modal State
    const [showFileModal, setShowFileModal] = useState(false);
    const [viewingFiles, setViewingFiles] = useState([]);
    const [fileModalTitle, setFileModalTitle] = useState('');

    // Expanded state
    const [expandedPartnerId, setExpandedPartnerId] = useState(null);
    const [expandedEquipmentId, setExpandedEquipmentId] = useState(null);
    const [expandedInstrumentId, setExpandedInstrumentId] = useState(null);

    // Form State
    const [formData, setFormData] = useState({});

    // Filter State
    const [filterType, setFilterType] = useState('ALL'); // 'ALL', 'CUSTOMER', 'SUPPLIER', 'SUBCONTRACTOR'

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        try {
            if (activeTab === 'partners') {
                const res = await api.get('/basics/partners/');
                if (Array.isArray(res.data)) {
                    setPartners(res.data);
                } else {
                    console.error("Invalid data format for partners:", res.data);
                    setPartners([]);
                }
            } else if (activeTab === 'staff') {
                const res = await api.get('/basics/staff/');
                if (Array.isArray(res.data)) {
                    setStaff(res.data);
                } else {
                    setStaff([]);
                }
            } else if (activeTab === 'equipments') {
                const res = await api.get('/basics/equipments/');
                setEquipments(res.data || []);
            } else if (activeTab === 'instruments') {
                const res = await api.get('/basics/instruments/');
                setInstruments(res.data || []);
            } else if (activeTab === 'company') {
                const res = await api.get('/basics/company');
                if (res.data) {
                    setCompany(res.data);
                    setFormData(res.data);
                } else {
                    setCompany({});
                    setFormData({});
                }
            }
        } catch (error) {
            console.error("Failed to fetch data", error);
            setPartners([]);
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        let finalValue = value;

        if (name === 'registration_number') {
            finalValue = autoHyphen(value, 'bizNum').slice(0, 12); // Limit length
        } else if (name === 'phone' || name === 'mobile') {
            finalValue = autoHyphen(value, 'phone').slice(0, 13); // Limit length
        }

        setFormData(prev => ({ ...prev, [name]: finalValue }));
    };

    const handleCheckboxChange = (e) => {
        const { value, checked } = e.target;
        setFormData(prev => {
            const currentTypes = prev.partner_type || [];
            if (checked) {
                return { ...prev, partner_type: [...currentTypes, value] };
            } else {
                return { ...prev, partner_type: currentTypes.filter(type => type !== value) };
            }
        });
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

    const openCreateModal = () => {
        if (activeTab === 'partners') {
            setModalType('create');
            setFormData({ partner_type: ['CUSTOMER'] });
        } else if (activeTab === 'staff') {
            setModalType('create_staff');
            setFormData({ is_active: true });
        } else if (activeTab === 'equipments') {
            setModalType('create_equipment');
            setFormData({ is_active: true, status: 'IDLE' });
        } else if (activeTab === 'instruments') {
            setModalType('create_instrument');
            setFormData({ is_active: true, calibration_cycle_months: 12 });
        }
        setShowModal(true);
    };

    const openEditPartnerModal = (partner) => {
        setModalType('edit');
        setSelectedPartner(partner);
        // Ensure partner_type is an array
        const types = Array.isArray(partner.partner_type) ? partner.partner_type :
            (typeof partner.partner_type === 'string' ? JSON.parse(partner.partner_type) : []);
        setFormData({ ...partner, partner_type: types });
        setShowModal(true);
    };

    const openAddContactModal = (partner) => {
        setModalType('add_contact');
        setSelectedPartner(partner);
        setFormData({});
        setShowModal(true);
    };

    const openEditContactModal = (partner, contact) => {
        setModalType('edit_contact');
        setSelectedPartner(partner);
        setSelectedContact(contact);
        setFormData(contact);
        setShowModal(true);
    };

    const openEditStaffModal = (staffMember) => {
        setModalType('edit_staff');
        setSelectedStaff(staffMember);
        setFormData(staffMember);
        setShowModal(true);
    };

    const openEditEquipmentModal = (eq) => {
        setModalType('edit_equipment');
        setSelectedEquipment(eq);
        setFormData(eq);
        setShowModal(true);
    };

    const openAddEqHistoryModal = (eq) => {
        setModalType('add_eq_history');
        setSelectedEquipment(eq);
        setFormData({ history_date: new Date().toISOString().split('T')[0], history_type: 'BREAKDOWN' });
        setShowModal(true);
    };

    const openEditEqHistoryModal = (eq, history) => {
        setModalType('edit_eq_history');
        setSelectedEquipment(eq);
        setSelectedHistory(history);
        setFormData(history);
        setShowModal(true);
    };

    const openEditInstrumentModal = (inst) => {
        setModalType('edit_instrument');
        setSelectedInstrument(inst);
        setFormData(inst);
        setShowModal(true);
    };

    const openAddInstHistoryModal = (inst) => {
        setModalType('add_inst_history');
        setSelectedInstrument(inst);
        setFormData({ history_date: new Date().toISOString().split('T')[0], history_type: 'CALIBRATION' });
        setShowModal(true);
    };

    const openEditInstHistoryModal = (inst, history) => {
        setModalType('edit_inst_history');
        setSelectedInstrument(inst);
        setSelectedHistory(history);
        setFormData(history);
        setShowModal(true);
    };

    const handleDeletePartner = async (id) => {
        if (window.confirm("정말 삭제하시겠습니까? 관련 데이터가 모두 삭제될 수 있습니다.")) {
            try {
                await api.delete(`/basics/partners/${id}`);
                alert("삭제되었습니다.");
                fetchData();
            } catch (error) {
                console.error("Delete failed", error);
                alert("삭제 실패");
            }
        }
    };

    const handleDeleteContact = async (id) => {
        if (window.confirm("정말 삭제하시겠습니까?")) {
            try {
                await api.delete(`/basics/contacts/${id}`);
                alert("삭제되었습니다.");
                fetchData();
            } catch (error) {
                console.error("Delete failed", error);
                alert("삭제 실패");
            }
        }
    };

    const handleDeleteStaff = async (id) => {
        if (window.confirm("정말 삭제하시겠습니까?")) {
            try {
                await api.delete(`/basics/staff/${id}`);
                alert("삭제되었습니다.");
                fetchData();
            } catch (error) {
                console.error("Delete failed", error);
                alert("삭제 실패");
            }
        }
    };

    const handleDeleteEqHistory = async (eqId, hId) => {
        if (window.confirm("내역을 삭제하시겠습니까?")) {
            try {
                await api.delete(`/basics/equipments/${eqId}/history/${hId}`);
                alert("삭제되었습니다.");
                fetchData();
            } catch (error) {
                console.error("Delete failed", error);
                alert("삭제 실패");
            }
        }
    };

    const handleDeleteInstHistory = async (instId, hId) => {
        if (window.confirm("내역을 삭제하시겠습니까?")) {
            try {
                await api.delete(`/basics/instruments/${instId}/history/${hId}`);
                alert("삭제되었습니다.");
                fetchData();
            } catch (error) {
                console.error("Delete failed", error);
                alert("삭제 실패");
            }
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (activeTab === 'partners') {
                if (modalType === 'create') {
                    await api.post('/basics/partners/', {
                        ...formData,
                        partner_type: formData.partner_type || ['CUSTOMER']
                    });
                } else if (modalType === 'edit') {
                    await api.put(`/basics/partners/${selectedPartner.id}`, formData);
                } else if (modalType === 'add_contact') {
                    await api.post(`/basics/contacts/?partner_id=${selectedPartner.id}`, formData);
                } else if (modalType === 'edit_contact') {
                    await api.put(`/basics/contacts/${selectedContact.id}`, formData);
                }
            } else if (activeTab === 'staff') {
                if (modalType === 'create_staff') {
                    await api.post('/basics/staff/', formData);
                } else if (modalType === 'edit_staff') {
                    await api.put(`/basics/staff/${selectedStaff.id}`, formData);
                }
            } else if (activeTab === 'equipments') {
                if (modalType === 'create_equipment') {
                    // Auto-generate code if empty
                    const finalData = { ...formData };
                    if (!finalData.code) {
                        finalData.code = `EQ-${new Date().getTime().toString().slice(-6)}`;
                    }
                    await api.post('/basics/equipments/', finalData);
                } else if (modalType === 'edit_equipment') {
                    await api.put(`/basics/equipments/${selectedEquipment.id}`, formData);
                } else if (modalType === 'add_eq_history') {
                    await api.post(`/basics/equipments/${selectedEquipment.id}/history`, formData);
                } else if (modalType === 'edit_eq_history') {
                    await api.put(`/basics/equipments/${selectedEquipment.id}/history/${selectedHistory.id}`, formData);
                }
            } else if (activeTab === 'instruments') {
                if (modalType === 'create_instrument') {
                    const finalData = { ...formData };
                    if (!finalData.code) {
                        finalData.code = `MI-${new Date().getTime().toString().slice(-6)}`;
                    }
                    await api.post('/basics/instruments/', finalData);
                } else if (modalType === 'edit_instrument') {
                    await api.put(`/basics/instruments/${selectedInstrument.id}`, formData);
                } else if (modalType === 'add_inst_history') {
                    await api.post(`/basics/instruments/${selectedInstrument.id}/history`, formData);
                } else if (modalType === 'edit_inst_history') {
                    await api.put(`/basics/instruments/${selectedInstrument.id}/history/${selectedHistory.id}`, formData);
                }
            }
            alert("처리되었습니다.");
            setShowModal(false);
            setFormData({});
            fetchData();
        } catch (error) {
            console.error("Submit failed", error);
            alert("처리 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const toggleExpand = (id) => {
        setExpandedPartnerId(expandedPartnerId === id ? null : id);
    };

    const toggleEquipmentExpand = (id) => {
        setExpandedEquipmentId(expandedEquipmentId === id ? null : id);
    };

    const toggleInstrumentExpand = (id) => {
        setExpandedInstrumentId(expandedInstrumentId === id ? null : id);
    };

    // Filter Logic
    const filteredPartners = partners.filter(partner => {
        if (filterType === 'ALL') return true;
        // Check if partner_type array includes the filter type
        const types = Array.isArray(partner.partner_type) ? partner.partner_type : [];
        return types.includes(filterType);
    });

    const getPartnerTypeLabel = (type) => {
        switch (type) {
            case 'CUSTOMER': return '고객사';
            case 'SUPPLIER': return '공급사';
            case 'SUBCONTRACTOR': return '외주처';
            default: return type;
        }
    };

    return (
        <div className="space-y-6 relative">
            <div className="flex items-center justify-between">
                <div className="flex bg-gray-800 p-1 rounded-lg border border-gray-700">
                    <button
                        onClick={() => setActiveTab('partners')}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                            activeTab === 'partners'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white hover:bg-gray-700'
                        )}
                    >
                        거래처 관리
                    </button>
                    <button
                        onClick={() => setActiveTab('staff')}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                            activeTab === 'staff'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white hover:bg-gray-700'
                        )}
                    >
                        사원 관리
                    </button>
                    <button
                        onClick={() => setActiveTab('company')}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                            activeTab === 'company'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white hover:bg-gray-700'
                        )}
                    >
                        회사 정보
                    </button>
                    <button
                        onClick={() => setActiveTab('equipments')}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                            activeTab === 'equipments'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white hover:bg-gray-700'
                        )}
                    >
                        장비 관리
                    </button>
                    <button
                        onClick={() => setActiveTab('instruments')}
                        className={cn(
                            "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                            activeTab === 'instruments'
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'text-gray-400 hover:text-white hover:bg-gray-700'
                        )}
                    >
                        측정기 관리
                    </button>
                </div>
                <button
                    type="button"
                    onClick={openCreateModal}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-lg shadow-blue-900/20"
                >
                    <Plus className="w-4 h-4" />
                    <span>신규 등록</span>
                </button>
            </div>

            <Card>
                <div className="p-4 border-b border-gray-700 flex flex-col md:flex-row items-center gap-4 justify-between">
                    <div className="relative flex-1 max-w-sm w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="검색..."
                            className="w-full bg-gray-900 border border-gray-700 text-white text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {activeTab === 'partners' && (
                        <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700 overflow-x-auto">
                            {[
                                { id: 'ALL', label: '전체' },
                                { id: 'CUSTOMER', label: '고객사' },
                                { id: 'SUPPLIER', label: '공급사' },
                                { id: 'SUBCONTRACTOR', label: '외주처' }
                            ].map(type => (
                                <button
                                    key={type.id}
                                    onClick={() => setFilterType(type.id)}
                                    className={cn(
                                        "px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap",
                                        filterType === type.id
                                            ? 'bg-gray-700 text-white shadow-sm'
                                            : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                    )}
                                >
                                    {type.label}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {activeTab === 'company' ? (
                    <div className="p-8">
                        <form onSubmit={async (e) => {
                            e.preventDefault();
                            try {
                                await api.post('/basics/company', formData);
                                alert("저장되었습니다.");
                                fetchData();
                            } catch (error) {
                                console.error("Save failed", error);
                                alert("저장 실패");
                            }
                        }} className="max-w-4xl mx-auto space-y-8">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-6">
                                    <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">기본 정보</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">회사명</label>
                                            <input name="name" value={formData.name || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all" required />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">대표자명</label>
                                            <input name="owner_name" value={formData.owner_name || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">사업자등록번호</label>
                                            <input name="registration_number" value={formData.registration_number || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all" maxLength="12" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">주소</label>
                                            <input name="address" value={formData.address || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all" />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-6">
                                    <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">연락처 정보</h3>
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">전화번호</label>
                                            <input name="phone" value={formData.phone || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">팩스</label>
                                            <input name="fax" value={formData.fax || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-400">이메일</label>
                                            <input name="email" type="email" value={formData.email || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-blue-500 transition-all" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h3 className="text-lg font-semibold text-white border-b border-gray-700 pb-2">이미지 (로고/직인)</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    {/* Logo Upload */}
                                    <div className="space-y-4">
                                        <label className="text-sm font-medium text-gray-400 block">회사 로고</label>
                                        <div className="flex items-start gap-4">
                                            {formData.logo_image && (
                                                <div className="w-32 h-32 bg-white rounded-lg p-2 flex items-center justify-center border border-gray-600 relative group">
                                                    <img
                                                        crossOrigin="anonymous"
                                                        src={getImageUrl(typeof formData.logo_image === 'string' ? JSON.parse(formData.logo_image).url : formData.logo_image.url)}
                                                        alt="Logo"
                                                        className="max-w-full max-h-full object-contain"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData(p => ({ ...p, logo_image: null }))}
                                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                            <div className="flex-1">
                                                <div className="w-full bg-gray-900 border border-gray-700 border-dashed text-gray-400 text-sm rounded-lg px-4 py-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gray-500 hover:bg-gray-800 transition-all relative">
                                                    <Upload className="w-6 h-6 mb-1" />
                                                    <span>로고 이미지 업로드</span>
                                                    <span className="text-xs text-gray-500">권장: 투명 배경 PNG</span>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                        onChange={async (e) => {
                                                            const file = e.target.files[0];
                                                            if (file) {
                                                                const data = await handleFileUpload(file);
                                                                if (data) setFormData(p => ({ ...p, logo_image: data }));
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stamp Upload */}
                                    <div className="space-y-4">
                                        <label className="text-sm font-medium text-gray-400 block">회사 직인 (도장)</label>
                                        <div className="flex items-start gap-4">
                                            {formData.stamp_image && (
                                                <div className="w-32 h-32 bg-white rounded-lg p-2 flex items-center justify-center border border-gray-600 relative group">
                                                    <img
                                                        crossOrigin="anonymous"
                                                        src={getImageUrl(typeof formData.stamp_image === 'string' ? JSON.parse(formData.stamp_image).url : formData.stamp_image.url)}
                                                        alt="Stamp"
                                                        className="max-w-full max-h-full object-contain"
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => setFormData(p => ({ ...p, stamp_image: null }))}
                                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    >
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </div>
                                            )}
                                            <div className="flex-1">
                                                <div className="w-full bg-gray-900 border border-gray-700 border-dashed text-gray-400 text-sm rounded-lg px-4 py-8 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-gray-500 hover:bg-gray-800 transition-all relative">
                                                    <Upload className="w-6 h-6 mb-1" />
                                                    <span>직인 이미지 업로드</span>
                                                    <span className="text-xs text-gray-500">권장: 투명 배경 PNG, 정사각형</span>
                                                    <input
                                                        type="file"
                                                        accept="image/*"
                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                        onChange={async (e) => {
                                                            const file = e.target.files[0];
                                                            if (file) {
                                                                const data = await handleFileUpload(file);
                                                                if (data) setFormData(p => ({ ...p, stamp_image: data }));
                                                            }
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="flex justify-end pt-4 border-t border-gray-700">
                                <button
                                    type="submit"
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-medium rounded-lg transition-colors shadow-lg shadow-blue-900/20 flex items-center gap-2"
                                >
                                    <Smartphone className="w-4 h-4" /> {/* Just reuse icon or Save icon */}
                                    <span>정보 저장</span>
                                </button>
                            </div>
                        </form>
                    </div>
                ) : (

                    <div className="">
                        <table className="w-full text-left text-sm text-gray-400 border-collapse table-fixed">
                            <thead className="bg-gray-900/50 text-xs uppercase font-medium text-gray-500">
                                <tr>
                                    {activeTab === 'partners' ? (
                                        <>
                                            <th className="px-6 py-3 w-[20%]">거래처명</th>
                                            <th className="px-6 py-3 w-[15%]">유형</th>
                                            <th className="px-6 py-3 w-[15%]">대표자</th>
                                            <th className="px-6 py-3 w-[15%]">전화번호</th>
                                            <th className="px-6 py-3 w-[20%]">이메일</th>
                                            <th className="px-6 py-3 text-center w-[80px]">첨부</th>
                                        </>
                                    ) : activeTab === 'staff' ? (
                                        <>
                                            <th className="px-6 py-3">이름</th>
                                            <th className="px-6 py-3">구분</th>
                                            <th className="px-6 py-3">부서/직책</th>
                                            <th className="px-6 py-3">주업무</th>
                                            <th className="px-6 py-3">전화번호</th>
                                            <th className="px-6 py-3">상태</th>
                                        </>
                                    ) : activeTab === 'equipments' ? (
                                        <>
                                            <th className="px-6 py-3">장비명</th>
                                            <th className="px-6 py-3">코드</th>
                                            <th className="px-6 py-3">규격/사양</th>
                                            <th className="px-6 py-3">상태</th>
                                            <th className="px-6 py-3">구매일</th>
                                            <th className="px-6 py-3">위치</th>
                                        </>
                                    ) : (
                                        <>
                                            <th className="px-6 py-3">측정기명</th>
                                            <th className="px-6 py-3">코드</th>
                                            <th className="px-6 py-3">규격/사양</th>
                                            <th className="px-6 py-3">일련번호</th>
                                            <th className="px-6 py-3 text-center">교정주기(개월)</th>
                                            <th className="px-6 py-3">다음 교정일</th>
                                            <th className="px-6 py-3">상태</th>
                                        </>
                                    )}
                                    <th className="px-6 py-3 text-right">관리</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-700">
                                {loading ? (
                                    <tr><td colSpan="6" className="text-center py-8">Loading...</td></tr>
                                ) : activeTab === 'partners' ? (
                                    filteredPartners.length > 0 ? filteredPartners.map((partner) => (
                                        <React.Fragment key={partner.id}>
                                            <tr
                                                className="hover:bg-gray-700/50 transition-colors cursor-pointer group"
                                                onClick={() => toggleExpand(partner.id)}
                                            >
                                                <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                                        <Building2 className="w-4 h-4 text-blue-400" />
                                                    </div>
                                                    <span>{partner.name}</span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex gap-1 flex-wrap">
                                                        {Array.isArray(partner.partner_type) && partner.partner_type.map((type, i) => (
                                                            <span key={i} className={cn(
                                                                "px-2 py-0.5 rounded text-[10px] font-medium border whitespace-nowrap",
                                                                type === 'CUSTOMER' ? "bg-blue-500/10 text-blue-400 border-blue-500/20" :
                                                                    type === 'SUPPLIER' ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                                                                        "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                                            )}>
                                                                {getPartnerTypeLabel(type)}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">{partner.representative}</td>
                                                <td className="px-6 py-4">{partner.phone}</td>
                                                <td className="px-6 py-4">{partner.email}</td>
                                                <td className="px-6 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                                                    {(() => {
                                                        let fileList = [];
                                                        const rawFiles = partner.attachment_file;
                                                        try {
                                                            if (rawFiles) {
                                                                const parsed = typeof rawFiles === 'string' ? JSON.parse(rawFiles) : rawFiles;
                                                                fileList = Array.isArray(parsed) ? parsed : [parsed];
                                                            }
                                                        } catch {
                                                            // Fallback: treat as single file string/object if parse fails
                                                            fileList = rawFiles ? [rawFiles] : [];
                                                        }

                                                        if (fileList.length > 0) {
                                                            return (
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        console.log("Opening files:", fileList);
                                                                        setViewingFiles(fileList);
                                                                        setFileModalTitle(`${partner.name} 첨부파일`);
                                                                        setShowFileModal(true);
                                                                    }}
                                                                    className="text-blue-400 hover:text-blue-300 transition-colors p-1"
                                                                    title={`${fileList.length}개의 첨부파일`}
                                                                >
                                                                    <FileText className="w-4 h-4" />
                                                                </button>
                                                            );
                                                        }
                                                        return <span className="text-gray-600">-</span>;
                                                    })()}
                                                </td>
                                                <td className="px-6 py-4 text-right flex justify-end gap-2 pl-10" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        onClick={() => openEditPartnerModal(partner)}
                                                        className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePartner(partner.id)}
                                                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                    >
                                                        <Trash className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                            {/* Expanded Contact Information */}
                                            {expandedPartnerId === partner.id && (
                                                <tr className="bg-gray-800/50 animate-fade-in-down">
                                                    <td colSpan="6" className="p-4 pl-16">
                                                        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                                                            <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2">
                                                                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                                                    <User className="w-4 h-4 text-gray-500" />
                                                                    담당자 목록
                                                                </h4>
                                                                <button
                                                                    onClick={() => openAddContactModal(partner)}
                                                                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
                                                                >
                                                                    <UserPlus className="w-3 h-3" />
                                                                    담당자 추가
                                                                </button>
                                                            </div>
                                                            {partner.contacts && partner.contacts.length > 0 ? (
                                                                <div className="overflow-x-auto">
                                                                    <table className="w-full text-left text-sm text-gray-400">
                                                                        <thead className="bg-gray-800 text-xs uppercase font-medium text-gray-500">
                                                                            <tr>
                                                                                <th className="px-4 py-2">이름</th>
                                                                                <th className="px-4 py-2">부서/직책</th>
                                                                                <th className="px-4 py-2">전화번호</th>
                                                                                <th className="px-4 py-2">휴대전화</th>
                                                                                <th className="px-4 py-2">이메일</th>
                                                                                <th className="px-4 py-2 text-right w-20">관리</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-700">
                                                                            {partner.contacts.map((contact, idx) => (
                                                                                <tr key={idx} className="hover:bg-gray-800/50 transition-colors group/contact">
                                                                                    <td className="px-4 py-2 text-white font-medium">{contact.name}</td>
                                                                                    <td className="px-4 py-2">{contact.position}</td>
                                                                                    <td className="px-4 py-2">{contact.phone}</td>
                                                                                    <td className="px-4 py-2">{contact.mobile || '-'}</td>
                                                                                    <td className="px-4 py-2">{contact.email}</td>
                                                                                    <td className="px-4 py-2 text-right">
                                                                                        <div className="flex justify-end gap-2 opacity-50 group-hover/contact:opacity-100 transition-opacity">
                                                                                            <button onClick={() => openEditContactModal(partner, contact)} className="text-gray-400 hover:text-blue-400"><Pencil className="w-3 h-3" /></button>
                                                                                            <button onClick={() => handleDeleteContact(contact.id)} className="text-gray-400 hover:text-red-400"><Trash className="w-3 h-3" /></button>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            ) : (
                                                                <div className="text-sm text-gray-500 py-2">등록된 담당자가 없습니다.</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )) : (
                                        <tr><td colSpan="6" className="text-center py-8">데이터가 없습니다.</td></tr>
                                    )
                                ) : activeTab === 'staff' ? (
                                    staff.length > 0 ? staff.map((member) => (
                                        <tr key={member.id} className="hover:bg-gray-700/50 transition-colors">
                                            <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                                    <User className="w-4 h-4 text-purple-400" />
                                                </div>
                                                {member.name}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={cn(
                                                    "px-2 py-1 rounded-full text-xs font-medium",
                                                    member.user_type === 'ADMIN' ? "bg-purple-500/10 text-purple-400" : "bg-blue-500/10 text-blue-400"
                                                )}>
                                                    {member.user_type === 'ADMIN' ? '관리자' : '사용자'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">{member.role}</td>
                                            <td className="px-6 py-4">{member.main_duty || '-'}</td>
                                            <td className="px-6 py-4">{member.phone}</td>
                                            <td className="px-6 py-4">
                                                <span className={cn(
                                                    "px-2 py-1 rounded-full text-xs font-medium",
                                                    member.is_active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                                )}>
                                                    {member.is_active ? '재직중' : '퇴사'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                <button
                                                    onClick={() => openEditStaffModal(member)}
                                                    className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                                >
                                                    <Pencil className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteStaff(member.id)}
                                                    className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                >
                                                    <Trash className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    )) : (
                                        <tr><td colSpan="7" className="text-center py-8">등록된 사원이 없습니다.</td></tr>
                                    )
                                ) : activeTab === 'equipments' ? (
                                    equipments.length > 0 ? equipments.map((eq) => (
                                        <React.Fragment key={eq.id}>
                                            <tr className="hover:bg-gray-700/50 transition-colors cursor-pointer group" onClick={() => toggleEquipmentExpand(eq.id)}>
                                                <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                                        <Factory className="w-4 h-4 text-orange-400" />
                                                    </div>
                                                    {eq.name}
                                                </td>
                                                <td className="px-6 py-4 font-mono text-xs">{eq.code}</td>
                                                <td className="px-6 py-4">{eq.spec || '-'}</td>
                                                <td className="px-6 py-4">
                                                    <span className={cn(
                                                        "px-2 py-1 rounded-full text-xs font-medium",
                                                        eq.status === 'RUNNING' ? "bg-green-500/10 text-green-400" :
                                                            eq.status === 'DOWN' ? "bg-red-500/10 text-red-400" :
                                                                eq.status === 'REPAIR' ? "bg-orange-500/10 text-orange-400" :
                                                                    "bg-gray-500/10 text-gray-400"
                                                    )}>
                                                        {eq.status}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">{eq.purchase_date || '-'}</td>
                                                <td className="px-6 py-4 text-xs">{eq.location || '-'}</td>
                                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openEditEquipmentModal(eq); }}
                                                        className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (window.confirm("삭제하시겠습니까?")) {
                                                                await api.delete(`/basics/equipments/${eq.id}`);
                                                                fetchData();
                                                            }
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                    >
                                                        <Trash className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                            {/* Expanded Equipment History */}
                                            {expandedEquipmentId === eq.id && (
                                                <tr className="bg-gray-800/50 animate-fade-in-down">
                                                    <td colSpan="7" className="p-4 pl-16">
                                                        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                                                            <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2">
                                                                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                                                    <FileText className="w-4 h-4 text-gray-500" />
                                                                    고장/수리 이력
                                                                </h4>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); openAddEqHistoryModal(eq); }}
                                                                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
                                                                >
                                                                    <Plus className="w-3 h-3" />
                                                                    이력 추가
                                                                </button>
                                                            </div>
                                                            {eq.history && eq.history.length > 0 ? (
                                                                <div className="overflow-x-auto">
                                                                    <table className="w-full text-left text-sm text-gray-400">
                                                                        <thead className="bg-gray-800 text-xs uppercase font-medium text-gray-500">
                                                                            <tr>
                                                                                <th className="px-4 py-2">일자</th>
                                                                                <th className="px-4 py-2">구분</th>
                                                                                <th className="px-4 py-2">내역</th>
                                                                                <th className="px-4 py-2">비용/금액</th>
                                                                                <th className="px-4 py-2">작업자</th>
                                                                                <th className="px-4 py-2 text-right w-20">관리</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-700">
                                                                            {eq.history.map((h, idx) => (
                                                                                <tr key={idx} className="hover:bg-gray-800/50 transition-colors group/history">
                                                                                    <td className="px-4 py-2 text-white font-medium">{h.history_date || '-'}</td>
                                                                                    <td className="px-4 py-2">
                                                                                        {h.history_type === 'BREAKDOWN' ? '고장' :
                                                                                            h.history_type === 'REPAIR' ? '수리' :
                                                                                                h.history_type === 'MAINTENANCE' ? '정기점검' : h.history_type}
                                                                                    </td>
                                                                                    <td className="px-4 py-2">{h.description}</td>
                                                                                    <td className="px-4 py-2">{h.cost ? h.cost.toLocaleString() : '-'}</td>
                                                                                    <td className="px-4 py-2">{h.worker_name || '-'}</td>
                                                                                    <td className="px-4 py-2 text-right">
                                                                                        <div className="flex justify-end gap-2 opacity-50 group-hover/history:opacity-100 transition-opacity">
                                                                                            <button onClick={(e) => { e.stopPropagation(); openEditEqHistoryModal(eq, h); }} className="text-gray-400 hover:text-blue-400"><Pencil className="w-3 h-3" /></button>
                                                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteEqHistory(eq.id, h.id); }} className="text-gray-400 hover:text-red-400"><Trash className="w-3 h-3" /></button>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            ) : (
                                                                <div className="text-sm text-gray-500 py-2">등록된 내역이 없습니다.</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )) : (
                                        <tr><td colSpan="7" className="text-center py-8">등록된 장비가 없습니다.</td></tr>
                                    )
                                ) : (
                                    instruments.length > 0 ? instruments.map((inst) => (
                                        <React.Fragment key={inst.id}>
                                            <tr className="hover:bg-gray-700/50 transition-colors cursor-pointer group" onClick={() => toggleInstrumentExpand(inst.id)}>
                                                <td className="px-6 py-4 font-medium text-white flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center">
                                                        <FileText className="w-4 h-4 text-emerald-400" />
                                                    </div>
                                                    {inst.name}
                                                </td>
                                                <td className="px-6 py-4 font-mono text-xs">{inst.code}</td>
                                                <td className="px-6 py-4">{inst.spec || '-'}</td>
                                                <td className="px-6 py-4">{inst.serial_number || '-'}</td>
                                                <td className="px-6 py-4 text-center">{inst.calibration_cycle_months}</td>
                                                <td className="px-6 py-4">
                                                    <span className={cn(
                                                        "px-2 py-1 rounded text-xs font-medium",
                                                        !inst.next_calibration_date ? "text-gray-500" :
                                                            new Date(inst.next_calibration_date) < new Date() ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                                                                "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                                                    )}>
                                                        {inst.next_calibration_date || '미등록'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className={cn(
                                                        "px-2 py-1 rounded-full text-xs font-medium",
                                                        inst.is_active ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400"
                                                    )}>
                                                        {inst.is_active ? '사용중' : '폐기/미사용'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openEditInstrumentModal(inst); }}
                                                        className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors"
                                                    >
                                                        <Pencil className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (window.confirm("삭제하시겠습니까?")) {
                                                                await api.delete(`/basics/instruments/${inst.id}`);
                                                                fetchData();
                                                            }
                                                        }}
                                                        className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                                                    >
                                                        <Trash className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            </tr>
                                            {/* Expanded Instrument History */}
                                            {expandedInstrumentId === inst.id && (
                                                <tr className="bg-gray-800/50 animate-fade-in-down">
                                                    <td colSpan="8" className="p-4 pl-16">
                                                        <div className="bg-gray-900 rounded-lg p-4 border border-gray-700">
                                                            <div className="flex items-center justify-between mb-3 border-b border-gray-800 pb-2">
                                                                <h4 className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                                                                    <FileText className="w-4 h-4 text-gray-500" />
                                                                    교정/수리 이력
                                                                </h4>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); openAddInstHistoryModal(inst); }}
                                                                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-500/10 transition-colors"
                                                                >
                                                                    <Plus className="w-3 h-3" />
                                                                    이력 추가
                                                                </button>
                                                            </div>
                                                            {inst.history && inst.history.length > 0 ? (
                                                                <div className="overflow-x-auto">
                                                                    <table className="w-full text-left text-sm text-gray-400">
                                                                        <thead className="bg-gray-800 text-xs uppercase font-medium text-gray-500">
                                                                            <tr>
                                                                                <th className="px-4 py-2">일자</th>
                                                                                <th className="px-4 py-2">구분</th>
                                                                                <th className="px-4 py-2">내역</th>
                                                                                <th className="px-4 py-2">비용/금액</th>
                                                                                <th className="px-4 py-2">기관/담당자</th>
                                                                                <th className="px-4 py-2 text-right w-20">관리</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody className="divide-y divide-gray-700">
                                                                            {inst.history.map((h, idx) => (
                                                                                <tr key={idx} className="hover:bg-gray-800/50 transition-colors group/history">
                                                                                    <td className="px-4 py-2 text-white font-medium">{h.history_date || '-'}</td>
                                                                                    <td className="px-4 py-2">
                                                                                        {h.history_type === 'CALIBRATION' ? '교정' :
                                                                                            h.history_type === 'REPAIR' ? '수리' : '기타'}
                                                                                    </td>
                                                                                    <td className="px-4 py-2">{h.description}</td>
                                                                                    <td className="px-4 py-2">{h.cost ? h.cost.toLocaleString() : '-'}</td>
                                                                                    <td className="px-4 py-2">{h.worker_name || '-'}</td>
                                                                                    <td className="px-4 py-2 text-right">
                                                                                        <div className="flex justify-end gap-2 opacity-50 group-hover/history:opacity-100 transition-opacity">
                                                                                            <button onClick={(e) => { e.stopPropagation(); openEditInstHistoryModal(inst, h); }} className="text-gray-400 hover:text-blue-400"><Pencil className="w-3 h-3" /></button>
                                                                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteInstHistory(inst.id, h.id); }} className="text-gray-400 hover:text-red-400"><Trash className="w-3 h-3" /></button>
                                                                                        </div>
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            ) : (
                                                                <div className="text-sm text-gray-500 py-2">등록된 내역이 없습니다.</div>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    )) : (
                                        <tr><td colSpan="8" className="text-center py-8">등록된 측정기가 없습니다.</td></tr>
                                    )
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Modal Overlay */}
            {
                showModal && (
                    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                        <div className="bg-gray-800 rounded-xl border border-gray-700 w-full max-w-lg shadow-2xl overflow-hidden animation-fade-in">
                            <div className="flex items-center justify-between p-6 border-b border-gray-700 bg-gray-900/50">
                                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                    {activeTab === 'partners' ? <Building2 className="w-5 h-5 text-blue-500" /> : <User className="w-5 h-5 text-purple-500" />}
                                    {modalType === 'create' ? '신규 거래처 등록' :
                                        modalType === 'edit' ? '거래처 정보 수정' :
                                            modalType === 'add_contact' ? '담당자 추가' :
                                                modalType === 'edit_contact' ? '담당자 수정' :
                                                    modalType === 'create_staff' ? '신규 사원 등록' :
                                                        modalType === 'create_equipment' ? '신규 생산 장비 등록' :
                                                            modalType === 'edit_equipment' ? '장비 정보 수정' :
                                                                modalType === 'add_eq_history' ? '장비 이력 추가' :
                                                                    modalType === 'edit_eq_history' ? '장비 이력 수정' :
                                                                        modalType === 'create_instrument' ? '신규 측정기 등록' :
                                                                            modalType === 'edit_instrument' ? '측정기 정보 수정' :
                                                                                modalType === 'add_inst_history' ? '측정기 이력(교정/수리) 추가' :
                                                                                    modalType === 'edit_inst_history' ? '측정기 이력(교정/수리) 수정' : '사원 정보 수정'}
                                </h3>
                                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white transition-colors">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmit} className="p-6 space-y-5">
                                {(modalType === 'create' || modalType === 'edit') && (
                                    <>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">거래처명 <span className="text-red-500">*</span></label>
                                            <input name="name" value={formData.name || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-gray-600" placeholder="예: (주)한국정밀" required />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">사업자번호 <span className="text-red-500">*</span></label>
                                            <input name="registration_number" value={formData.registration_number || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-gray-600" placeholder="000-00-00000" maxLength="12" required />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">대표자 <span className="text-red-500">*</span></label>
                                                <input name="representative" value={formData.representative || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" required />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">유형 (중복 선택 가능)</label>
                                            <div className="flex gap-4 p-3 bg-gray-900 rounded-lg border border-gray-700">
                                                {['CUSTOMER', 'SUPPLIER', 'SUBCONTRACTOR'].map(type => (
                                                    <label key={type} className="flex items-center gap-2 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            value={type}
                                                            checked={(formData.partner_type || []).includes(type)}
                                                            onChange={handleCheckboxChange}
                                                            className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-800"
                                                        />
                                                        <span className="text-sm text-gray-300">{getPartnerTypeLabel(type)}</span>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">전화번호</label>
                                            <input name="phone" value={formData.phone || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="02-0000-0000" maxLength="13" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">이메일</label>
                                            <input name="email" type="email" value={formData.email || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="contact@company.com" />
                                        </div>

                                        {/* File Attachments */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">첨부파일</label>
                                            <div className="flex flex-col gap-2">
                                                <div className="relative flex-1">
                                                    <input
                                                        type="file"
                                                        multiple
                                                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                                        onChange={async (e) => {
                                                            const files = Array.from(e.target.files);
                                                            if (files.length > 0) {
                                                                let existingFiles = [];
                                                                try {
                                                                    // Use optional chaining and default to empty array
                                                                    existingFiles = formData.attachment_file ? (
                                                                        typeof formData.attachment_file === 'string'
                                                                            ? JSON.parse(formData.attachment_file)
                                                                            : formData.attachment_file
                                                                    ) : [];
                                                                    if (!Array.isArray(existingFiles)) existingFiles = [existingFiles].filter(Boolean); // handle legacy single obj/string
                                                                } catch {
                                                                    existingFiles = formData.attachment_file ? [formData.attachment_file] : [];
                                                                }

                                                                const newFiles = [];
                                                                for (const file of files) {
                                                                    const fileData = await handleFileUpload(file);
                                                                    if (fileData) newFiles.push(fileData);
                                                                }

                                                                if (newFiles.length > 0) {
                                                                    // We'll store it as an array of objects in state for now
                                                                    // When submitting, we might need to stringify it if backend expects string, 
                                                                    // but our schema defines it as JSON, so array of objects is fine for JSON column.
                                                                    // However, check how other parts use it.
                                                                    // In ProductsPage we stringified it because it was a String column.
                                                                    // Here it is a JSON column. So we can keep it as object array.
                                                                    // BUT, to be safe and consistent with the previous edits, 
                                                                    // let's verify if 'formData' update handles array correctly.
                                                                    const updatedFiles = [...existingFiles, ...newFiles];
                                                                    setFormData(prev => ({ ...prev, attachment_file: updatedFiles }));
                                                                }
                                                            }
                                                        }}
                                                    />
                                                    <div className="w-full bg-gray-900 border border-gray-700 border-dashed text-gray-400 text-sm rounded-lg px-3 py-3 flex items-center justify-center gap-2 cursor-pointer hover:border-gray-500 hover:bg-gray-800 transition-all">
                                                        <Upload className="w-4 h-4" />
                                                        <span>파일 추가 업로드 (드래그 앤 드롭 가능)</span>
                                                    </div>
                                                </div>

                                                {/* File List */}
                                                {(() => {
                                                    let fileList = [];
                                                    try {
                                                        fileList = formData.attachment_file ? (
                                                            typeof formData.attachment_file === 'string'
                                                                ? JSON.parse(formData.attachment_file)
                                                                : formData.attachment_file
                                                        ) : [];
                                                        if (!Array.isArray(fileList)) fileList = [fileList].filter(Boolean);
                                                    } catch {
                                                        fileList = [];
                                                    }

                                                    if (fileList.length > 0) {
                                                        return (
                                                            <div className="space-y-2 mt-2">
                                                                {fileList.map((fileItem, fIndex) => {
                                                                    const isString = typeof fileItem === 'string';
                                                                    const url = isString ? fileItem : fileItem.url;
                                                                    const name = isString ? decodeURIComponent(url.split('/').pop()) : fileItem.name;

                                                                    return (
                                                                        <div key={fIndex} className="flex items-center justify-between bg-gray-800 px-3 py-2 rounded-lg border border-gray-700">
                                                                            <div className="flex items-center gap-2 overflow-hidden">
                                                                                <div className="bg-gray-700 p-1 rounded">
                                                                                    <FileText className="w-4 h-4 text-blue-400" />
                                                                                </div>
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={() => {
                                                                                        // Open FileViewerModal with this file (or all files)
                                                                                        // To allow navigating all files, we pass fileList
                                                                                        // But maybe user expects to see THIS file. 
                                                                                        // FileViewerModal currently shows list.
                                                                                        // Ideally we pass all files so they can switch.
                                                                                        setViewingFiles(fileList);
                                                                                        setFileModalTitle('파일 미리보기');
                                                                                        setShowFileModal(true);
                                                                                    }}
                                                                                    className="text-gray-300 text-sm hover:underline hover:text-blue-400 truncate text-left"
                                                                                    title={`${name} - 클릭하여 미리보기`}
                                                                                >
                                                                                    {name}
                                                                                </button>
                                                                            </div>
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    const newFiles = fileList.filter((_, i) => i !== fIndex);
                                                                                    setFormData(prev => ({ ...prev, attachment_file: newFiles }));
                                                                                }}
                                                                                className="text-gray-500 hover:text-red-400 p-1 hover:bg-gray-700 rounded transition-colors"
                                                                            >
                                                                                <X className="w-4 h-4" />
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
                                    </>
                                )}

                                {(modalType === 'add_contact' || modalType === 'edit_contact') && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">이름 <span className="text-red-500">*</span></label>
                                                <input name="name" value={formData.name || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" required />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">직책/부서</label>
                                                <input name="position" value={formData.position || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="예: 팀장/영업팀" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">전화번호 (사무실)</label>
                                            <input name="phone" value={formData.phone || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="02-0000-0000" maxLength="13" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">휴대전화</label>
                                            <input name="mobile" value={formData.mobile || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="010-0000-0000" maxLength="13" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">이메일</label>
                                            <input name="email" type="email" value={formData.email || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="staff@company.com" />
                                        </div>
                                    </>
                                )}

                                {/* Staff Forms */}
                                {(modalType === 'create_staff' || modalType === 'edit_staff') && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">이름 <span className="text-red-500">*</span></label>
                                                <input name="name" value={formData.name || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" required />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">직책</label>
                                                <input name="role" value={formData.role || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="예: 대리" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">주업무</label>
                                            <input name="main_duty" value={formData.main_duty || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="예: 생산 관리, 품질 검사" />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">연락처</label>
                                            <input name="phone" value={formData.phone || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="010-0000-0000" maxLength="13" />
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="checkbox"
                                                name="is_active"
                                                checked={formData.is_active !== false}
                                                onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                                                className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-800"
                                            />
                                            <label className="text-sm font-medium text-gray-300">재직 중</label>
                                        </div>

                                        {/* 구분 (ADMIN/USER) */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">구분 <span className="text-red-500">*</span></label>
                                            <select
                                                name="user_type"
                                                value={formData.user_type || 'USER'}
                                                onChange={(e) => setFormData(prev => ({ ...prev, user_type: e.target.value }))}
                                                className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                            >
                                                <option value="USER">사용자</option>
                                                <option value="ADMIN">관리자</option>
                                            </select>
                                        </div>

                                        {/* 비밀번호 */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">로그인 비밀번호</label>
                                            <input
                                                type="text"
                                                name="password"
                                                value={formData.password || ''}
                                                onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                                                className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                                placeholder="비밀번호 입력"
                                            />
                                        </div>

                                        {/* 메뉴 접근 권한 */}
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">메뉴 접근 권한</label>
                                            <div className="grid grid-cols-2 gap-2 bg-gray-900/50 rounded-lg p-3 border border-gray-700">
                                                {[
                                                    { key: 'basics', label: '기초 정보' },
                                                    { key: 'products', label: '제품 관리' },
                                                    { key: 'sales', label: '영업 관리' },
                                                    { key: 'production', label: '생산 관리' },
                                                    { key: 'purchase', label: '자재 구매' },
                                                    { key: 'outsourcing', label: '외주 발주' },
                                                    { key: 'quality', label: '품질 관리' },
                                                    { key: 'inventory', label: '납품/재고' },
                                                    { key: 'approval', label: '전자결재' },
                                                ].map(menu => {
                                                    const perms = formData.menu_permissions || [];
                                                    const isAdmin = formData.user_type === 'ADMIN';
                                                    return (
                                                        <label key={menu.key} className={cn("flex items-center gap-2 text-sm", isAdmin ? "text-gray-500" : "text-gray-300")}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isAdmin || perms.includes(menu.key)}
                                                                disabled={isAdmin}
                                                                onChange={(e) => {
                                                                    const newPerms = e.target.checked
                                                                        ? [...perms, menu.key]
                                                                        : perms.filter(k => k !== menu.key);
                                                                    setFormData(prev => ({ ...prev, menu_permissions: newPerms }));
                                                                }}
                                                                className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-800"
                                                            />
                                                            {menu.label}
                                                        </label>
                                                    );
                                                })}
                                            </div>
                                            {formData.user_type === 'ADMIN' && (
                                                <p className="text-xs text-purple-400">※ 관리자는 모든 메뉴에 접근할 수 있습니다.</p>
                                            )}
                                        </div>

                                        {/* 도장/서명 이미지 */}
                                        <div className="space-y-2 pt-2 border-t border-gray-700">
                                            <label className="text-sm font-medium text-gray-300">결재용 도장/서명 이미지</label>
                                            <div className="flex items-center gap-4">
                                                {formData.stamp_image ? (
                                                    <div className="relative group">
                                                        <img
                                                            src={formData.stamp_image.url}
                                                            alt="Stamp"
                                                            className="w-20 h-20 object-contain bg-white rounded border border-gray-600"
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => setFormData(prev => ({ ...prev, stamp_image: null }))}
                                                            className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                                                        >
                                                            <X className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div className="relative w-20 h-20 bg-gray-900 border border-gray-700 border-dashed rounded flex items-center justify-center group hover:border-blue-500 transition-colors">
                                                        <Upload className="w-5 h-5 text-gray-500 group-hover:text-blue-500" />
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (file) {
                                                                    const fileData = await handleFileUpload(file);
                                                                    if (fileData) {
                                                                        setFormData(prev => ({ ...prev, stamp_image: fileData }));
                                                                    }
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                )}
                                                <div className="flex-1">
                                                    <p className="text-[11px] text-gray-500">배경이 투명한 PNG 이미지를 권장합니다. (최대 1MB)</p>
                                                    <p className="text-[11px] text-gray-500">전자결재 시 해당 이미지가 문서에 서명으로 삽입됩니다.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Equipment Forms */}
                                {(modalType === 'create_equipment' || modalType === 'edit_equipment') && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">장비명 <span className="text-red-500">*</span></label>
                                                <input name="name" value={formData.name || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" required />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">장비코드</label>
                                                <input name="code" value={formData.code || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="예: MACH-01" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">사양/스펙</label>
                                            <input name="spec" value={formData.spec || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="예: 50KN, Max 3000rpm" />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">상태</label>
                                                <select
                                                    name="status"
                                                    value={formData.status || 'IDLE'}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                                >
                                                    <option value="IDLE">대기 (IDLE)</option>
                                                    <option value="RUNNING">가동중 (RUNNING)</option>
                                                    <option value="DOWN">정지/고장 (DOWN)</option>
                                                </select>
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">구매일</label>
                                                <input type="date" name="purchase_date" value={formData.purchase_date || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">설치 위치</label>
                                            <input name="location" value={formData.location || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="예: 1공장 2층" />
                                        </div>
                                    </>
                                )}

                                {/* Equipment History Forms */}
                                {(modalType === 'add_eq_history' || modalType === 'edit_eq_history') && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">발생 일자</label>
                                                <input type="date" name="history_date" value={formData.history_date || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">구분 <span className="text-red-500">*</span></label>
                                                <select
                                                    name="history_type"
                                                    value={formData.history_type || 'BREAKDOWN'}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                                >
                                                    <option value="BREAKDOWN">고장 (BREAKDOWN)</option>
                                                    <option value="REPAIR">수리 (REPAIR)</option>
                                                    <option value="MAINTENANCE">정기점검 (MAINTENANCE)</option>
                                                    <option value="OTHER">기타 (OTHER)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">상세 내역 <span className="text-red-500">*</span></label>
                                            <textarea name="description" value={formData.description || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[100px]" placeholder="상세한 고장/수리 상황을 입력하세요..." required />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">작업자/담당자</label>
                                                <input name="worker_name" value={formData.worker_name || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="예: 홍길동, 또는 A/S 기사" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">비용/금액</label>
                                                <input type="number" name="cost" value={formData.cost || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="0" />
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Instrument Forms */}
                                {(modalType === 'create_instrument' || modalType === 'edit_instrument') && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">측정기명 <span className="text-red-500">*</span></label>
                                                <input name="name" value={formData.name || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" required />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">관리코드</label>
                                                <input name="code" value={formData.code || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="자동 생성 또는 직접 입력" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">사양/스펙</label>
                                                <input name="spec" value={formData.spec || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="예: 0~150mm" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">일련번호</label>
                                                <input name="serial_number" value={formData.serial_number || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="제조사 S/N" />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">교정 주기(개월)</label>
                                                <input type="number" name="calibration_cycle_months" value={formData.calibration_cycle_months || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="12" />
                                            </div>
                                            <div className="flex items-center gap-2 pt-8">
                                                <input
                                                    type="checkbox"
                                                    name="is_active"
                                                    checked={formData.is_active !== false}
                                                    onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                                                    className="w-4 h-4 rounded border-gray-600 text-blue-600 focus:ring-blue-500 bg-gray-800"
                                                />
                                                <label className="text-sm font-medium text-gray-300">사용 중 (Active)</label>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Instrument History Forms */}
                                {(modalType === 'add_inst_history' || modalType === 'edit_inst_history') && (
                                    <>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">발생 일자</label>
                                                <input type="date" name="history_date" value={formData.history_date || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">구분 <span className="text-red-500">*</span></label>
                                                <select
                                                    name="history_type"
                                                    value={formData.history_type || 'CALIBRATION'}
                                                    onChange={handleInputChange}
                                                    className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all"
                                                >
                                                    <option value="CALIBRATION">교정 (CALIBRATION)</option>
                                                    <option value="REPAIR">수리 (REPAIR)</option>
                                                    <option value="ETC">기타 (ETC)</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-sm font-medium text-gray-300">상세 내역 <span className="text-red-500">*</span></label>
                                            <textarea name="description" value={formData.description || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all min-h-[100px]" placeholder="상세한 내역을 입력하세요..." required />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">기관/담당자</label>
                                                <input name="worker_name" value={formData.worker_name || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="한국표준과학연구원 등" />
                                            </div>
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-300">비용/금액</label>
                                                <input type="number" name="cost" value={formData.cost || ''} onChange={handleInputChange} className="w-full bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all" placeholder="0" />
                                            </div>
                                        </div>
                                    </>
                                )}

                                <div className="pt-4 flex justify-end gap-3 border-t border-gray-700 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => setShowModal(false)}
                                        className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
                                    >
                                        취소
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-6 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-all shadow-lg shadow-blue-900/40"
                                    >
                                        {modalType === 'create' || modalType === 'add_contact' || modalType === 'create_staff' || modalType === 'create_equipment' ? '등록완료' : '수정완료'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )
            }

            {/* File Viewer Modal - Portaled to body */}
            <FileViewerModal
                isOpen={showFileModal}
                onClose={() => setShowFileModal(false)}
                files={viewingFiles}
                title={fileModalTitle}
            />
        </div >
    );
};

const BasicsPage = () => {
    return (
        <ErrorBoundary>
            <BasicsPageContent />
        </ErrorBoundary>
    );
};

export default BasicsPage;
