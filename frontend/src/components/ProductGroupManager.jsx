import React, { useState, useEffect } from 'react';
import { Plus, Trash, Pencil, ChevronRight, ChevronDown, Save, X } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

const ProductGroupManager = () => {
    const [groups, setGroups] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState({});
    const [editingNode, setEditingNode] = useState(null);
    const [editName, setEditName] = useState("");

    // Create Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalData, setModalData] = useState({ name: "", type: "MAJOR", parent_id: null });

    useEffect(() => {
        fetchGroups();
    }, []);

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const res = await api.get('/products/groups/');
            setGroups(res.data || []);
        } catch (error) {
            console.error("Failed to load groups", error);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        try {
            await api.post('/products/groups/', modalData);
            setShowModal(false);
            setModalData({ name: "", type: "MAJOR", parent_id: null });
            fetchGroups();
        } catch (error) {
            console.error("Create failed", error);
            alert("그룹 생성 실패");
        }
    };

    const handleDelete = async (id, e) => {
        e.stopPropagation();
        if (!confirm("정말 이 그룹을 삭제하시겠습니까? 하위 요소나 포함된 항목이 있으면 문제가 생길 수 있습니다.")) return;
        try {
            await api.delete(`/products/groups/${id}`);
            fetchGroups();
        } catch (error) {
            console.error("Delete failed", error);
            alert("그룹 삭제 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const startEditing = (node, e) => {
        e.stopPropagation();
        setEditingNode(node.id);
        setEditName(node.name);
    };

    const saveEditing = async (node, e) => {
        e.stopPropagation();
        try {
            await api.put(`/products/groups/${node.id}`, { name: editName });
            setEditingNode(null);
            fetchGroups();
        } catch (error) {
            console.error("Update failed", error);
            alert("이름 수정 실패");
        }
    };

    const openMinorCreate = (parentId, e) => {
        e.stopPropagation();
        setExpanded(prev => ({ ...prev, [parentId]: true }));
        setModalData({ name: "", type: "MINOR", parent_id: parentId });
        setShowModal(true);
    };

    const toggleExpand = (id, e) => {
        e.stopPropagation();
        setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const majorGroups = groups.filter(g => g.type === 'MAJOR');

    return (
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
            <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <span className="bg-blue-600/20 text-blue-400 p-2 rounded-lg">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" /></svg>
                    </span>
                    제품 그룹 관리
                </h3>
                <button
                    onClick={() => { setModalData({ name: "", type: "MAJOR", parent_id: null }); setShowModal(true); }}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                >
                    <Plus className="w-4 h-4" />대그룹 추가
                </button>
            </div>

            {loading ? (
                <div className="text-center py-10 text-gray-400">Loading...</div>
            ) : majorGroups.length === 0 ? (
                <div className="text-center py-10 text-gray-500">등록된 대그룹이 없습니다.</div>
            ) : (
                <div className="space-y-4">
                    {majorGroups.map(major => {
                        const minors = groups.filter(g => g.parent_id === major.id);
                        const isExpanded = expanded[major.id];

                        return (
                            <div key={major.id} className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden">
                                <div
                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-800 transition-colors"
                                    onClick={(e) => toggleExpand(major.id, e)}
                                >
                                    <div className="flex items-center gap-3">
                                        <button className="text-gray-400 hover:text-white">
                                            {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                        </button>
                                        {editingNode === major.id ? (
                                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                <input
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                    className="bg-gray-800 border border-gray-600 text-white px-2 py-1 rounded text-sm outline-none focus:border-blue-500"
                                                    autoFocus
                                                />
                                                <button onClick={(e) => saveEditing(major, e)} className="text-green-400 p-1 hover:bg-gray-800 rounded"><Save className="w-4 h-4" /></button>
                                                <button onClick={(e) => { e.stopPropagation(); setEditingNode(null); }} className="text-gray-400 p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4" /></button>
                                            </div>
                                        ) : (
                                            <span className="text-gray-100 font-medium">{major.name}</span>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => openMinorCreate(major.id, e)}
                                            className="px-2 py-1 text-xs text-blue-400 hover:bg-blue-400/10 rounded flex items-center gap-1"
                                        >
                                            <Plus className="w-3 h-3" /> 소그룹 추가
                                        </button>
                                        <button onClick={(e) => startEditing(major, e)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
                                            <Pencil className="w-4 h-4" />
                                        </button>
                                        <button onClick={(e) => handleDelete(major.id, e)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded">
                                            <Trash className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="border-t border-gray-800 bg-gray-800/50 p-4 pl-12 space-y-2">
                                        {minors.length === 0 ? (
                                            <p className="text-sm text-gray-500 py-2">등록된 소그룹이 없습니다.</p>
                                        ) : (
                                            minors.map(minor => (
                                                <div key={minor.id} className="flex items-center justify-between p-3 bg-gray-900 border border-gray-700 rounded-md">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                                        {editingNode === minor.id ? (
                                                            <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                                <input
                                                                    value={editName}
                                                                    onChange={e => setEditName(e.target.value)}
                                                                    className="bg-gray-800 border border-gray-600 text-white px-2 py-1 rounded text-sm outline-none focus:border-blue-500"
                                                                    autoFocus
                                                                />
                                                                <button onClick={(e) => saveEditing(minor, e)} className="text-green-400 p-1 hover:bg-gray-800 rounded"><Save className="w-4 h-4" /></button>
                                                                <button onClick={(e) => { e.stopPropagation(); setEditingNode(null); }} className="text-gray-400 p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4" /></button>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-300 text-sm">{minor.name}</span>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity" style={{ opacity: 1 }}>
                                                        <button onClick={(e) => startEditing(minor, e)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded">
                                                            <Pencil className="w-3.5 h-3.5" />
                                                        </button>
                                                        <button onClick={(e) => handleDelete(minor.id, e)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded">
                                                            <Trash className="w-3.5 h-3.5" />
                                                        </button>
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-white">
                                {modalData.type === 'MAJOR' ? '대그룹 추가' : '소그룹 추가'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleCreate} className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1">그룹명 <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={modalData.name}
                                    onChange={e => setModalData({ ...modalData, name: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500"
                                    placeholder="그룹 이름을 입력하세요"
                                />
                            </div>
                            <div className="pt-4 flex gap-2 justify-end border-t border-gray-800">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white">취소</button>
                                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg">추가하기</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProductGroupManager;
