import React, { useState } from 'react';
import { Plus, Trash, Pencil, ChevronRight, ChevronDown, Save, X, Settings, Copy } from 'lucide-react';
import api from '../lib/api';
import { cn } from '../lib/utils';

const ProcessGroupManager = ({
    groups,
    fetchGroups,
    processes,
    fetchProcesses,
    onAddProcess,
    onEditProcess,
    onDeleteProcess
}) => {
    // UI state
    const [expandedMinor, setExpandedMinor] = useState({});
    const [editingNode, setEditingNode] = useState(null);
    const [editName, setEditName] = useState("");

    // Modal state for Groups
    const [showModal, setShowModal] = useState(false);
    const [modalData, setModalData] = useState({ name: "", type: "MAJOR", parent_id: null });

    // Process Selection States
    const [selectedProcesses, setSelectedProcesses] = useState([]);
    const [copyTargetGroupId, setCopyTargetGroupId] = useState("");

    const handleCreateGroup = async (e) => {
        e.preventDefault();
        try {
            await api.post('/product/groups/', modalData);
            setShowModal(false);
            setModalData({ name: "", type: "MAJOR", parent_id: null });
            fetchGroups();
        } catch (error) {
            console.error("Create failed", error);
            alert("그룹 생성 실패");
        }
    };

    const handleDeleteGroup = async (id, e) => {
        e.stopPropagation();
        if (!window.confirm("정말 이 그룹을 삭제하시겠습니까? 하위 요소나 포함된 항목이 있으면 문제가 생길 수 있습니다.")) return;
        try {
            await api.delete(`/product/groups/${id}`);
            fetchGroups();
        } catch (error) {
            console.error("Delete failed", error);
            alert("그룹 삭제 실패: " + (error.response?.data?.detail || error.message));
        }
    };

    const startEditingGroup = (node, e) => {
        e.stopPropagation();
        setEditingNode(node.id);
        setEditName(node.name);
    };

    const saveEditingGroup = async (node, e) => {
        e.stopPropagation();
        try {
            await api.put(`/product/groups/${node.id}`, { name: editName });
            setEditingNode(null);
            fetchGroups();
        } catch (error) {
            console.error("Update failed", error);
            alert("이름 수정 실패");
        }
    };

    const openMinorCreate = (parentId, e) => {
        e.stopPropagation();
        setModalData({ name: "", type: "MINOR", parent_id: parentId });
        setShowModal(true);
    };

    const toggleMinorExpand = (id, e) => {
        e.stopPropagation();
        setExpandedMinor(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Process Selection Handlers
    const toggleProcessSelection = (processId) => {
        setSelectedProcesses(prev =>
            prev.includes(processId) ? prev.filter(id => id !== processId) : [...prev, processId]
        );
    };

    const toggleAllProcesses = (processList) => {
        const allIds = processList.map(p => p.id);
        const allSelected = allIds.length > 0 && allIds.every(id => selectedProcesses.includes(id));
        if (allSelected) {
            setSelectedProcesses(prev => prev.filter(id => !allIds.includes(id)));
        } else {
            setSelectedProcesses(prev => Array.from(new Set([...prev, ...allIds])));
        }
    };

    const handleCopyProcesses = async () => {
        if (selectedProcesses.length === 0) {
            alert("복사할 공정을 선택해주세요.");
            return;
        }
        if (!copyTargetGroupId) {
            alert("복사할 대상 그룹을 선택해주세요.");
            return;
        }

        let targetMajorGroupId = null;
        let targetMinorGroupId = null;

        if (copyTargetGroupId !== "common") {
            const targetMinorGroup = groups.find(g => g.id === parseInt(copyTargetGroupId));
            if (targetMinorGroup) {
                targetMinorGroupId = targetMinorGroup.id;
                targetMajorGroupId = targetMinorGroup.parent_id;
            } else {
                alert("유효하지 않은 대상 그룹입니다.");
                return;
            }
        }

        if (!window.confirm(`${selectedProcesses.length}개의 공정을 복사하시겠습니까?`)) return;

        try {
            const processesToCopy = processes.filter(p => selectedProcesses.includes(p.id));

            for (const p of processesToCopy) {
                const newProcess = {
                    name: p.name,
                    description: p.description,
                    course_type: p.course_type,
                    major_group_id: targetMajorGroupId,
                    group_id: targetMinorGroupId
                };
                await api.post('/product/processes/', newProcess);
            }
            alert("공정이 복사되었습니다.");
            setSelectedProcesses([]);
            if (fetchProcesses) fetchProcesses();
        } catch (error) {
            console.error(error);
            alert("복사 중 오류가 발생했습니다. (중복된 이름 등)");
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedProcesses.length === 0) return;
        if (!window.confirm(`선택한 ${selectedProcesses.length}개의 공정을 삭제하시겠습니까?`)) return;

        try {
            for (const id of selectedProcesses) {
                await api.delete(`/product/processes/${id}`);
            }
            alert("선택한 공정이 삭제되었습니다.");
            setSelectedProcesses([]);
            if (fetchProcesses) fetchProcesses();
        } catch (error) {
            console.error("Batch delete failed", error);
            alert("일부 공정 삭제 중 오류가 발생했습니다.");
        }
    };

    const majorGroups = groups.filter(g => g.type === 'MAJOR');
    const commonProcesses = processes.filter(p => !p.group_id);

    // Reuse process table rendering logic
    const renderProcessTable = (processList) => {
        const allIds = processList.map(p => p.id);
        const allSelected = allIds.length > 0 && allIds.every(id => selectedProcesses.includes(id));

        return (
            <div className="overflow-x-auto bg-gray-900 border-x border-b border-gray-700 rounded-b-md">
                <table className="w-full text-left text-sm text-gray-400">
                    <thead className="bg-gray-800 text-xs font-medium text-gray-400 uppercase">
                        <tr>
                            <th className="px-4 py-2 w-12 text-center">
                                <input
                                    type="checkbox"
                                    className="rounded border-gray-600 bg-gray-700 cursor-pointer"
                                    checked={allSelected}
                                    onChange={() => toggleAllProcesses(processList)}
                                />
                            </th>
                            <th className="px-4 py-2">공정명</th>
                            <th className="px-4 py-2 w-24 text-center">구분</th>
                            <th className="px-4 py-2">설명</th>
                            <th className="px-4 py-2 text-right w-24">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-700">
                        {processList.length === 0 ? (
                            <tr><td colSpan="5" className="text-center py-4 text-gray-500">등록된 공정이 없습니다.</td></tr>
                        ) : (
                            processList.map(proc => (
                                <tr key={proc.id} className="hover:bg-gray-750 transition-colors">
                                    <td className="px-4 py-2 text-center">
                                        <input
                                            type="checkbox"
                                            className="rounded border-gray-600 bg-gray-700 cursor-pointer"
                                            checked={selectedProcesses.includes(proc.id)}
                                            onChange={() => toggleProcessSelection(proc.id)}
                                        />
                                    </td>
                                    <td className="px-4 py-2 font-medium text-gray-200">{proc.name}</td>
                                    <td className="px-4 py-2 text-center">
                                        <span className={cn(
                                            "text-[10px] px-1.5 py-0.5 rounded border inline-block min-w-[32px]",
                                            proc.course_type === 'INTERNAL' ? "bg-blue-900/30 border-blue-800 text-blue-300" :
                                                proc.course_type === 'OUTSOURCING' ? "bg-orange-900/30 border-orange-800 text-orange-300" :
                                                    "bg-purple-900/30 border-purple-800 text-purple-300"
                                        )}>
                                            {proc.course_type === 'INTERNAL' ? '내부' : proc.course_type === 'OUTSOURCING' ? '외주' : '구매'}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-gray-500 text-xs truncate max-w-[200px]" title={proc.description}>{proc.description || '-'}</td>
                                    <td className="px-4 py-2 text-right">
                                        <div className="flex justify-end gap-2">
                                            <button onClick={() => onEditProcess(proc)} className="text-gray-500 hover:text-blue-400 transition-colors">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => onDeleteProcess(proc.id)} className="text-gray-500 hover:text-red-400 transition-colors">
                                                <Trash className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        );
    };

    return (
        <div className="flex flex-col relative h-[calc(100vh-160px)] pb-16">
            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 shadow-sm overflow-y-auto">
                <div className="flex justify-between items-center mb-6 border-b border-gray-700 pb-4">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <span className="bg-emerald-600/20 text-emerald-400 p-2 rounded-lg">
                            <Settings className="w-5 h-5" />
                        </span>
                        공정 및 그룹 관리
                    </h3>
                    <div className="flex gap-2">
                        <button
                            onClick={() => onAddProcess({ group_id: "", major_group_id: "" })}
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-sm transition-colors shadow-lg shadow-emerald-900/20"
                        >
                            <Plus className="w-4 h-4" />공통 공정 추가
                        </button>
                        <button
                            onClick={() => { setModalData({ name: "", type: "MAJOR", parent_id: null }); setShowModal(true); }}
                            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm transition-colors shadow-lg shadow-blue-900/20"
                        >
                            <Plus className="w-4 h-4" />대그룹 추가
                        </button>
                    </div>
                </div>

                {/* Common Processes */}
                <div className="mb-8">
                    <div className="bg-gray-900 border border-gray-700 rounded-t-md p-3 flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-emerald-400 flex items-center gap-2">
                            <div className="w-1.5 h-4 bg-emerald-500 rounded-full"></div>
                            공통 공정 (그룹 미지정)
                        </h4>
                        <span className="text-xs text-gray-500 font-medium">{commonProcesses.length} 공정</span>
                    </div>
                    {renderProcessTable(commonProcesses)}
                </div>

                {/* Major/Minor Groups and Processes */}
                <div className="space-y-6">
                    <h4 className="text-sm font-bold text-gray-300 mb-2 px-2 flex items-center gap-2">
                        <div className="w-1.5 h-4 bg-blue-500 rounded-full"></div>
                        그룹별 공정 목록
                    </h4>
                    {majorGroups.length === 0 ? (
                        <div className="text-center py-10 text-gray-500 bg-gray-900 rounded-lg border border-gray-800">등록된 그룹이 없습니다.</div>
                    ) : (
                        majorGroups.map(major => {
                            const minors = groups.filter(g => g.parent_id === major.id);

                            return (
                                <div key={major.id} className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden shrink-0 shadow-sm">
                                    {/* Major Group Header (always expanded implicitly) */}
                                    <div className="flex items-center justify-between p-4 bg-gray-850 border-b border-gray-800">
                                        <div className="flex items-center gap-2">
                                            {editingNode === major.id ? (
                                                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                    <input
                                                        value={editName}
                                                        onChange={e => setEditName(e.target.value)}
                                                        className="bg-gray-800 border border-gray-600 text-white px-2 py-1 rounded text-sm outline-none focus:border-blue-500"
                                                        autoFocus
                                                    />
                                                    <button onClick={(e) => saveEditingGroup(major, e)} className="text-green-400 p-1 hover:bg-gray-800 rounded"><Save className="w-4 h-4" /></button>
                                                    <button onClick={(e) => { e.stopPropagation(); setEditingNode(null); }} className="text-gray-400 p-1 hover:bg-gray-800 rounded"><X className="w-4 h-4" /></button>
                                                </div>
                                            ) : (
                                                <span className="text-gray-100 font-bold text-lg">{major.name}</span>
                                            )}
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={(e) => openMinorCreate(major.id, e)}
                                                className="px-2 py-1 text-xs text-blue-400 hover:bg-blue-400/10 rounded flex items-center gap-1 transition-colors border border-blue-400/30"
                                            >
                                                <Plus className="w-3 h-3" /> 소그룹 추가
                                            </button>
                                            <button onClick={(e) => startEditingGroup(major, e)} className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={(e) => handleDeleteGroup(major.id, e)} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors">
                                                <Trash className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* Minor Groups List */}
                                    <div className="p-3 space-y-4 bg-gray-800/20">
                                        {minors.length === 0 ? (
                                            <p className="text-sm text-gray-500 p-2 text-center">등록된 소그룹이 없습니다.</p>
                                        ) : (
                                            minors.map(minor => {
                                                const minorProcesses = processes.filter(p => p.group_id === minor.id);
                                                const isMinorExpanded = expandedMinor[minor.id];

                                                return (
                                                    <div key={minor.id} className="bg-gray-800 border border-gray-700 rounded-md overflow-hidden shadow-sm">
                                                        <div
                                                            className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-750 transition-colors"
                                                            onClick={(e) => toggleMinorExpand(minor.id, e)}
                                                        >
                                                            <div className="flex items-center gap-3">
                                                                <button className="text-gray-400 hover:text-white transition-colors">
                                                                    {isMinorExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
                                                                </button>
                                                                {editingNode === minor.id ? (
                                                                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                                                                        <input
                                                                            value={editName}
                                                                            onChange={e => setEditName(e.target.value)}
                                                                            className="bg-gray-900 border border-gray-600 text-white px-2 py-1 rounded text-sm outline-none focus:border-blue-500"
                                                                            autoFocus
                                                                        />
                                                                        <button onClick={(e) => saveEditingGroup(minor, e)} className="text-green-400 p-1 hover:bg-gray-900 rounded"><Save className="w-4 h-4" /></button>
                                                                        <button onClick={(e) => { e.stopPropagation(); setEditingNode(null); }} className="text-gray-400 p-1 hover:bg-gray-900 rounded"><X className="w-4 h-4" /></button>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-gray-200 font-semibold">{minor.name}</span>
                                                                )}
                                                                <span className="text-[10px] text-emerald-400 bg-emerald-900/30 px-2 py-0.5 rounded-full border border-emerald-800/50">{minorProcesses.length} 공정</span>
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setExpandedMinor(prev => ({ ...prev, [minor.id]: true }));
                                                                        onAddProcess({ major_group_id: major.id, group_id: minor.id });
                                                                    }}
                                                                    className="px-2 py-1 text-xs text-emerald-400 hover:bg-emerald-400/20 rounded flex items-center gap-1 transition-colors border border-emerald-400/30"
                                                                >
                                                                    <Plus className="w-3 h-3" /> 공정 추가
                                                                </button>
                                                                <button onClick={(e) => startEditingGroup(minor, e)} className="p-1 text-gray-400 hover:text-white hover:bg-gray-700 rounded transition-colors">
                                                                    <Pencil className="w-3.5 h-3.5" />
                                                                </button>
                                                                <button onClick={(e) => handleDeleteGroup(minor.id, e)} className="p-1 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded transition-colors">
                                                                    <Trash className="w-3.5 h-3.5" />
                                                                </button>
                                                            </div>
                                                        </div>

                                                        {/* Process List for this Minor Group */}
                                                        {isMinorExpanded && (
                                                            <div className="bg-gray-900">
                                                                {renderProcessTable(minorProcesses)}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>

            {/* Sticky Action Footer for Selected Processes */}
            {selectedProcesses.length > 0 && (
                <div className="absolute bottom-4 left-4 right-4 bg-gray-800 border border-blue-500 text-white rounded-xl shadow-2xl p-4 flex items-center justify-between animation-fade-in z-50">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-600 rounded-lg p-2 flex items-center justify-center">
                            <Copy className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="font-bold text-lg">{selectedProcesses.length}개 공정 선택됨</p>
                            <p className="text-xs text-blue-200">선택한 공정들을 다른 목록으로 일괄 병합/복사합니다.</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <select
                            value={copyTargetGroupId}
                            onChange={e => setCopyTargetGroupId(e.target.value)}
                            className="bg-gray-900 border border-gray-600 text-white px-4 py-2 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500 shadow-sm min-w-[200px]"
                        >
                            <option value="">복사 대상 그룹 선택...</option>
                            <option value="common">공통 공정 (그룹 미지정)</option>
                            {majorGroups.map(major => (
                                <optgroup key={major.id} label={major.name} className="bg-gray-800 text-white">
                                    {groups.filter(g => g.parent_id === major.id).map(minor => (
                                        <option key={minor.id} value={minor.id}>↳ {minor.name}</option>
                                    ))}
                                </optgroup>
                            ))}
                        </select>
                        <button
                            onClick={handleCopyProcesses}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-lg shadow-blue-900/40 transition-colors"
                        >
                            복사하기
                        </button>
                        <div className="w-[1px] h-6 bg-gray-750 mx-1"></div>
                        <button
                            onClick={handleDeleteSelected}
                            className="bg-red-600 hover:bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg shadow-red-900/40 transition-colors flex items-center gap-2"
                        >
                            <Trash className="w-4 h-4" /> 선택 삭제
                        </button>
                        <button
                            onClick={() => setSelectedProcesses([])}
                            className="text-gray-400 hover:text-white px-2 py-2 transition-colors ml-2"
                            title="선택 해제"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Group Modal */}
            {showModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animation-fade-in">
                        <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <Settings className="w-4 h-4 text-blue-500" />
                                {modalData.type === 'MAJOR' ? '대그룹 추가' : '소그룹 추가'}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-white p-1 rounded-lg hover:bg-gray-800 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleCreateGroup} className="p-5 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-1.5">그룹명 <span className="text-red-500">*</span></label>
                                <input
                                    type="text"
                                    required
                                    value={modalData.name}
                                    onChange={e => setModalData({ ...modalData, name: e.target.value })}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all placeholder:text-gray-600"
                                    placeholder="그룹 이름을 입력하세요"
                                />
                            </div>
                            <div className="pt-2 flex gap-2 justify-end">
                                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">취소</button>
                                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-lg shadow-blue-900/20 transition-all">추가하기</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProcessGroupManager;
