import React, { useState, useEffect } from 'react';
import {
    Search, Plus, Shield, Clock, CheckCircle2, AlertCircle,
    MoreVertical, FileText, ChevronRight, MessageSquare, Trash2
} from 'lucide-react';
import Select from 'react-select';
import api from '../lib/api';
import { formatNumber, cn } from '../lib/utils';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import MultiFileUpload from '../components/MultiFileUpload';
import ResizableTable from '../components/ResizableTable';

const COMPLAINT_COLS = [
    { key: 'date',    label: '접수일',   width: 120 },
    { key: 'partner', label: '고객사',   width: 150 },
    { key: 'content', label: '불만 내용', width: 400 },
    { key: 'status',  label: '상태',     width: 100 },
    { key: 'file',    label: '파일',     width: 80 },
    { key: 'actions', label: '작업',     width: 120, noResize: true },
];

const CustomerComplaintPage = () => {
    const [complaints, setComplaints] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedMajorGroupId, setSelectedMajorGroupId] = useState('');
    const [groups, setGroups] = useState([]);
    const [tab, setTab] = useState('RECEIVED');
    // Modals & form state
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedComplaint, setSelectedComplaint] = useState(null);
    const [formData, setFormData] = useState({
        partner_id: null,
        order_id: null,
        content: '',
        action_note: '',
        status: 'RECEIVED',
        attachment_files: []
    });

    const [partners, setPartners] = useState([]);
    const [orders, setOrders] = useState([]);

    useEffect(() => {
        fetchComplaints();
        fetchInitialData();
        fetchGroups();
    }, [tab, selectedMajorGroupId]);

    const fetchGroups = async () => {
        try {
            const res = await api.get('/product/groups/');
            setGroups(res.data || []);
        } catch (error) {
            console.error("Failed to fetch groups", error);
        }
    };

    const fetchInitialData = async () => {
        try {
            const [pRes, oRes] = await Promise.all([
                api.get('/basics/partners'),
                api.get('/sales/orders?limit=1000')
            ]);
            setPartners(pRes.data);
            setOrders(oRes.data);
        } catch (error) {
            console.error("Failed to fetch initial data", error);
        }
    };

    const fetchComplaints = async () => {
        setLoading(true);
        try {
            const params = { status: tab };
            if (selectedMajorGroupId) params.major_group_id = selectedMajorGroupId;
            const res = await api.get(`/quality/`, { params });
            setComplaints(res.data);
        } catch (error) {
            console.error("Failed to fetch complaints", error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (complaint = null) => {
        if (complaint) {
            setSelectedComplaint(complaint);
            setFormData({
                partner_id: complaint.partner_id,
                order_id: complaint.order_id || null,
                content: complaint.content,
                action_note: complaint.action_note || '',
                status: complaint.status,
                attachment_files: complaint.attachment_files || []
            });
        } else {
            setSelectedComplaint(null);
            setFormData({
                partner_id: null,
                order_id: null,
                content: '',
                action_note: '',
                status: 'RECEIVED',
                attachment_files: []
            });
        }
        setIsEditModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            if (selectedComplaint) {
                await api.put(`/quality/${selectedComplaint.id}`, formData);
            } else {
                await api.post(`/quality/`, formData);
            }
            alert("저장되었습니다.");
            setIsEditModalOpen(false);
            fetchComplaints();
        } catch (error) {
            console.error("Save failed", error);
            alert("저장 중 오류가 발생했습니다.");
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm("정말 삭제하시겠습니까?")) return;
        try {
            await api.delete(`/quality/${id}`);
            fetchComplaints();
        } catch (error) {
            alert("삭제 실패");
        }
    };

    const StatusBadge = ({ status }) => {
        const styles = {
            'RECEIVED': 'bg-red-500/20 text-red-500 border-red-500/20',
            'IN_PROGRESS': 'bg-yellow-500/20 text-yellow-500 border-yellow-500/20',
            'COMPLETED': 'bg-green-500/20 text-green-500 border-green-500/20'
        };
        const labels = { 'RECEIVED': '접수', 'IN_PROGRESS': '조치중', 'COMPLETED': '조치완료' };
        return (
            <span className={cn("px-2 py-1 rounded-full text-xs font-bold border", styles[status])}>
                {labels[status]}
            </span>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                    <Shield className="w-8 h-8 text-blue-500" />
                    고객불만관리
                </h1>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-all font-bold shadow-lg shadow-blue-900/20"
                >
                    <Plus className="w-5 h-5" /> 불만 접수 등록
                </button>
            </div>

            {/* Tabs & Filter */}
            <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex bg-gray-900 p-1 rounded-lg border border-gray-700">
                    <button
                        onClick={() => setTab('RECEIVED')}
                        className={cn(
                            "px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2",
                            tab === 'RECEIVED' ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                        )}
                    >
                        <Clock className="w-4 h-4" /> 접수 내역
                    </button>
                    <button
                        onClick={() => setTab('COMPLETED')}
                        className={cn(
                            "px-6 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-2",
                            tab === 'COMPLETED' ? "bg-green-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                        )}
                    >
                        <CheckCircle2 className="w-4 h-4" /> 조치 완료
                    </button>
                </div>

                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-xs text-gray-400 font-bold">사업부:</label>
                            <select
                                className="bg-gray-700 border-none rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                                value={selectedMajorGroupId}
                                onChange={(e) => setSelectedMajorGroupId(e.target.value)}
                            >
                                <option value="">전체 사업부</option>
                                {groups.filter(g => g.type === 'MAJOR').map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="고객사명, 내용 검색..."
                                className="bg-gray-700 border-none rounded-lg pl-10 pr-4 py-2 text-sm text-white w-full md:w-64 focus:ring-2 focus:ring-blue-500 transition-all"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Content List */}
            <Card className="bg-gray-800 border-gray-700">
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                    <ResizableTable
                        columns={COMPLAINT_COLS}
                        className="w-full text-sm text-left"
                        theadClassName="bg-gray-800/80 text-gray-400 font-semibold text-xs uppercase tracking-wider border-b border-gray-700"
                        thClassName="px-6 py-3"
                        tbodyClassName="divide-y divide-gray-700"
                    >
                        {loading ? (
                                    <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-400">불러오는 중...</td></tr>
                                ) : complaints.length === 0 ? (
                                    <tr><td colSpan="6" className="px-6 py-12 text-center text-gray-400">내역이 없습니다.</td></tr>
                                ) : complaints.filter(c =>
                                    (c.partner?.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                                    (c.content || '').toLowerCase().includes(searchQuery.toLowerCase())
                                ).map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-800/40 transition-colors border-b border-gray-700 text-gray-300 group">
                                        <td className="px-6 py-4 font-medium text-gray-300">{item.receipt_date}</td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-white">{item.partner?.name}</div>
                                            <div className="text-xs text-gray-500">수주: {item.order?.order_no || '-'}</div>
                                        </td>
                                        <td className="px-6 py-4 text-gray-300">
                                            <div className="max-w-md truncate font-medium">{item.content}</div>
                                            {item.action_note && (
                                                <div className="text-xs text-blue-400 mt-1 flex items-center gap-1 italic">
                                                    <MessageSquare className="w-3 h-3" /> 조치: {item.action_note.substring(0, 30)}...
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4"><StatusBadge status={item.status} /></td>
                                        <td className="px-6 py-4">
                                            {item.attachment_files?.length > 0 ? (
                                                <span className="flex items-center gap-1 text-blue-400">
                                                    <FileText className="w-4 h-4" /> {item.attachment_files.length}
                                                </span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button
                                                    onClick={() => handleOpenModal(item)}
                                                    className="p-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-gray-400 hover:text-white transition-all"
                                                >
                                                    상세/수정
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(item.id)}
                                                    className="p-2 bg-red-900/20 hover:bg-red-900/40 rounded-lg text-red-500 transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                    </ResizableTable>
                    </div>
                </CardContent>
            </Card>

            {/* Registration / Action Modal */}
            {isEditModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[95vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-700 flex justify-between items-center sticky top-0 bg-gray-800 z-10">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <AlertCircle className="w-6 h-6 text-red-500" />
                                {selectedComplaint ? '불만 처리/상세' : '신규 불만 접수'}
                            </h2>
                            <button onClick={() => setIsEditModalOpen(false)} className="text-gray-400 hover:text-white"><Plus className="w-6 h-6 rotate-45" /></button>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-400">고객사(업체)</label>
                                    <Select
                                        required
                                        options={partners.map(p => ({ value: p.id, label: p.name }))}
                                        value={partners.filter(p => p.id === formData.partner_id).map(p => ({ value: p.id, label: p.name }))[0] || null}
                                        onChange={(selected) => setFormData({ ...formData, partner_id: selected ? selected.value : null, order_id: null })}
                                        placeholder="고객사 선택..."
                                        className="react-select-container"
                                        classNamePrefix="react-select"
                                        styles={{
                                            control: (base) => ({
                                                ...base,
                                                backgroundColor: '#374151',
                                                borderColor: 'transparent',
                                                color: 'white',
                                                borderRadius: '0.5rem',
                                                padding: '2px'
                                            }),
                                            menu: (base) => ({ ...base, backgroundColor: '#1f2937', zIndex: 100 }),
                                            option: (base, state) => ({
                                                ...base,
                                                backgroundColor: state.isFocused ? '#374151' : 'transparent',
                                                color: 'white',
                                                '&:active': { backgroundColor: '#3b82f6' }
                                            }),
                                            singleValue: (base) => ({ ...base, color: 'white' }),
                                            input: (base) => ({ ...base, color: 'white' }),
                                            placeholder: (base) => ({ ...base, color: '#9ca3af' })
                                        }}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-bold text-gray-400">관련 수주 (선택)</label>
                                    <Select
                                        isClearable
                                        options={orders
                                            .filter(o => !formData.partner_id || String(o.partner_id) === String(formData.partner_id))
                                            .map(o => {
                                                const productName = o.items?.[0]?.product?.name || '품목 정보 없음';
                                                const extraCount = o.items?.length > 1 ? ` 외 ${o.items.length - 1}건` : '';
                                                const totalQty = o.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
                                                return {
                                                    value: o.id,
                                                    label: `[${o.order_no}] ${productName}${extraCount} - ${totalQty}개 (${o.order_date})`
                                                };
                                            })
                                        }
                                        value={orders.filter(o => o.id === formData.order_id).map(o => {
                                            const productName = o.items?.[0]?.product?.name || '품목 정보 없음';
                                            const extraCount = o.items?.length > 1 ? ` 외 ${o.items.length - 1}건` : '';
                                            const totalQty = o.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;
                                            return {
                                                value: o.id,
                                                label: `[${o.order_no}] ${productName}${extraCount} - ${totalQty}개 (${o.order_date})`
                                            };
                                        })[0] || null}
                                        onChange={(selected) => setFormData({ ...formData, order_id: selected ? selected.value : null })}
                                        placeholder="수주 건 선택..."
                                        noOptionsMessage={() => (formData.partner_id ? "해당 고객사의 수주 내역이 없습니다." : "고객사를 먼저 선택하세요.")}
                                        styles={{
                                            control: (base) => ({
                                                ...base,
                                                backgroundColor: '#374151',
                                                borderColor: 'transparent',
                                                color: 'white',
                                                borderRadius: '0.5rem',
                                                padding: '2px'
                                            }),
                                            menu: (base) => ({ ...base, backgroundColor: '#1f2937', zIndex: 100 }),
                                            option: (base, state) => ({
                                                ...base,
                                                backgroundColor: state.isFocused ? '#374151' : 'transparent',
                                                color: 'white',
                                                '&:active': { backgroundColor: '#3b82f6' }
                                            }),
                                            singleValue: (base) => ({ ...base, color: 'white' }),
                                            input: (base) => ({ ...base, color: 'white' }),
                                            placeholder: (base) => ({ ...base, color: '#9ca3af' })
                                        }}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-400">불만 내용</label>
                                <textarea
                                    required
                                    rows={4}
                                    className="w-full bg-gray-700 border-none rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
                                    placeholder="발생 현상 및 내용을 상세히 적어주세요."
                                    value={formData.content}
                                    onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                                />
                            </div>

                            <div className="space-y-2 bg-blue-500/5 p-4 rounded-xl border border-blue-500/20">
                                <label className="text-sm font-bold text-blue-400 flex items-center gap-2">
                                    <MessageSquare className="w-4 h-4" /> 조치 내용 및 관리자 메모
                                </label>
                                <textarea
                                    rows={3}
                                    className="w-full bg-gray-900 border-none rounded-lg p-3 text-white focus:ring-2 focus:ring-blue-500"
                                    placeholder="취해진 조치 또는 예정된 조치를 입력하세요."
                                    value={formData.action_note}
                                    onChange={(e) => setFormData({ ...formData, action_note: e.target.value })}
                                />
                                <div className="flex items-center gap-4 mt-2">
                                    <label className="text-sm font-bold text-gray-400">처리 상태</label>
                                    <div className="flex gap-2">
                                        {['RECEIVED', 'IN_PROGRESS', 'COMPLETED'].map(s => (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() => setFormData({ ...formData, status: s })}
                                                className={cn(
                                                    "px-3 py-1.5 rounded-lg text-xs font-bold border transition-all",
                                                    formData.status === s
                                                        ? "bg-blue-600 border-blue-500 text-white"
                                                        : "bg-gray-700 border-gray-600 text-gray-400 hover:bg-gray-600"
                                                )}
                                            >
                                                {s === 'RECEIVED' ? '접수' : s === 'IN_PROGRESS' ? '조치중' : '완료'}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-sm font-bold text-gray-400">첨부 파일 (현장 사진, 소견서 등)</label>
                                <MultiFileUpload
                                    files={formData.attachment_files}
                                    onChange={(files) => setFormData({ ...formData, attachment_files: files })}
                                />
                            </div>

                            <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
                                <button
                                    type="button"
                                    onClick={() => setIsEditModalOpen(false)}
                                    className="px-6 py-2.5 bg-gray-700 text-white rounded-xl font-bold hover:bg-gray-600 transition-all"
                                >
                                    취소
                                </button>
                                <button
                                    type="submit"
                                    className="px-8 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-500 transition-all shadow-lg shadow-blue-900/20"
                                >
                                    {selectedComplaint ? '수정/조치 저장' : '접수 완료'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CustomerComplaintPage;
