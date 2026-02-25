import React, { useState, useEffect, useRef } from 'react';
import {
    Plus, Trash2, GripVertical, Settings,
    Table as TableIcon, Layout, Type, FileText,
    CheckCircle2, Info
} from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '../lib/utils';
import { EditableText, StampOverlay } from './DocumentUtils';

// --- Resizable Table Component ---

const ResizableTable = ({ block, onUpdateConfig }) => {
    const config = block.config || {};
    const rows = config.rows || [[]];
    const colWidths = config.colWidths || rows[0]?.map(() => 100) || [];

    const resizing = useRef(null);

    const startResizing = (idx, e) => {
        e.preventDefault();
        resizing.current = { idx, startX: e.pageX, startWidth: colWidths[idx] };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        if (!resizing.current) return;
        const { idx, startX, startWidth } = resizing.current;
        const diff = e.pageX - startX;
        const newWidths = [...colWidths];
        newWidths[idx] = Math.max(30, startWidth + diff);
        onUpdateConfig({ colWidths: newWidths });
    };

    const handleMouseUp = () => {
        resizing.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    const updateCell = (rIdx, cIdx, val) => {
        const newRows = rows.map((r, ri) => ri === rIdx ? r.map((c, ci) => ci === cIdx ? val : c) : r);
        onUpdateConfig({ rows: newRows });
    };

    return (
        <div className="border border-black overflow-hidden bg-white mb-4">
            <table className="w-full border-collapse table-fixed">
                <tbody>
                    {rows.map((row, rIdx) => (
                        <tr key={rIdx} className="group/row">
                            {row.map((cell, cIdx) => (
                                <td
                                    key={cIdx}
                                    className="border border-black p-1 relative"
                                    style={{ width: colWidths[cIdx] }}
                                >
                                    <EditableText
                                        value={cell}
                                        onChange={(v) => updateCell(rIdx, cIdx, v)}
                                        className="text-xs"
                                        autoFit
                                        maxWidth={colWidths[cIdx]}
                                    />
                                    {rIdx === 0 && (
                                        <div
                                            className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 group-hover:bg-gray-200 z-10"
                                            onMouseDown={(e) => startResizing(cIdx, e)}
                                        />
                                    )}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

// --- Core Editor Components ---

const BlockRenderer = ({ block, onUpdateConfig }) => {
    const config = block.config || {};
    const uc = (fields) => onUpdateConfig(block.id, { ...config, ...fields });

    switch (block.type) {
        case 'header':
            return (
                <div className="text-center py-6 border-b-2 border-black mb-4" key={block.id}>
                    <EditableText
                        value={config.title}
                        onChange={(v) => uc({ title: v })}
                        className="text-3xl font-bold tracking-[1em] justify-center"
                        placeholder="문서 제목 입력"
                        isHeader
                    />
                </div>
            );
        case 'boxedHeader':
            return (
                <div className="flex justify-center p-4" key={block.id}>
                    <div className="border-2 border-black px-12 py-2 text-2xl font-bold tracking-[0.5em] indent-[0.5em] bg-yellow-400">
                        <EditableText
                            value={config.title}
                            onChange={(v) => uc({ title: v })}
                            placeholder="강조 제목"
                        />
                    </div>
                </div>
            );
        case 'infoTable':
            return (
                <div key={block.id} className="group">
                    <ResizableTable block={block} onUpdateConfig={(cfg) => onUpdateConfig(block.id, cfg)} />
                    <button
                        onClick={() => {
                            const currentRows = config.rows || [];
                            const newRow = currentRows[0]?.map(() => "") || ["", ""];
                            uc({ rows: [...currentRows, newRow] });
                        }}
                        className="text-[10px] text-blue-500 hover:underline mb-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <Plus className="w-3 h-3" /> 행 추가
                    </button>
                </div>
            );
        case 'memo':
            return (
                <div className="p-2" key={block.id}>
                    <div className="font-bold border-b border-black w-24 mb-2 flex items-center gap-2">
                        <EditableText value={config.label || "특기사항"} onChange={(v) => uc({ label: v })} />
                    </div>
                    <EditableText
                        value={config.content}
                        onChange={(v) => uc({ content: v })}
                        placeholder="내용을 입력하세요..."
                        className="w-full text-sm min-h-[80px] items-start"
                    />
                </div>
            );
        case 'approval':
            const steps = config.steps || ["담당", "대표"];
            return (
                <div className="p-2 flex justify-end relative" key={block.id}>
                    <div className="flex border border-black text-[10px] bg-white">
                        <div className="w-8 border-r border-black bg-gray-50 flex items-center justify-center font-bold writing-vertical py-2">
                            결제
                        </div>
                        {steps.map((step, i) => (
                            <div key={i} className={cn("w-16 flex flex-col", i !== steps.length - 1 && "border-r border-black")}>
                                <div className="border-b border-black bg-gray-50 py-1 text-center font-bold">
                                    <EditableText value={step} onChange={(v) => {
                                        const newSteps = [...steps];
                                        newSteps[i] = v;
                                        uc({ steps: newSteps });
                                    }} />
                                </div>
                                <div className="h-12 flex items-center justify-center font-bold text-red-500 opacity-30 select-none">
                                    (인)
                                    {i === steps.length - 1 && <StampOverlay url="/api/uploads/sample-stamp.png" className="w-16 h-16 translate-x-4 -translate-y-2" />}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        default:
            return <div className="p-4 border border-dashed border-gray-300 text-gray-400 text-xs text-center">알 수 없는 블록 타입: {block.type}</div>;
    }
};

const SortableItem = ({ id, block, children, onRemove, onSelect, isSelected }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

    const widthMap = {
        '100%': 'w-full', '75%': 'w-3/4', '66%': 'w-2/3', '50%': 'w-1/2', '33%': 'w-1/3', '25%': 'w-1/4'
    };

    const style = {
        transform: CSS.Translate.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            onClick={() => onSelect(block)}
            className={cn(
                "group relative p-1 transition-all",
                widthMap[block.width || '100%'],
                isDragging && "z-50 opacity-50",
                isSelected && "ring-2 ring-blue-500 ring-inset rounded-lg z-10"
            )}
        >
            <div className="absolute left-2 top-2 z-20 opacity-0 group-hover:opacity-100 flex items-center gap-1">
                <div {...attributes} {...listeners} className="p-1 bg-white border border-gray-200 rounded shadow-sm cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-4 h-4 text-gray-400" />
                </div>
            </div>

            <button
                onClick={(e) => { e.stopPropagation(); onRemove(block.id); }}
                className="absolute right-2 top-2 z-20 opacity-0 group-hover:opacity-100 p-1 bg-white border border-red-100 rounded shadow-sm text-red-500 hover:bg-red-50 transition-colors"
            >
                <Trash2 className="w-4 h-4" />
            </button>

            <div className="bg-white rounded border border-transparent group-hover:border-gray-200 overflow-hidden shadow-sm">
                {children}
            </div>
        </div>
    );
};

const VisualFormEditor = ({ template, onChange }) => {
    const [selectedBlock, setSelectedBlock] = useState(null);
    const blocks = template?.layout_data?.blocks || [];

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const updateBlock = (id, fields) => {
        const newBlocks = blocks.map(b => b.id === id ? { ...b, ...fields } : b);
        onChange({ ...template, layout_data: { ...template.layout_data, blocks: newBlocks } });
    };

    const updateBlockConfig = (id, config) => {
        updateBlock(id, { config });
    };

    const addBlock = (type) => {
        const id = `${type}-${Date.now()}`;
        let defaultConfig = {};
        if (type === 'infoTable') {
            defaultConfig = {
                rows: [["데이터1", "데이터2", "데이터3", "데이터4"], ["", "", "", ""]],
                colWidths: [100, 100, 100, 100]
            };
        } else if (type === 'header') {
            defaultConfig = { title: template.name };
        } else if (type === 'approval') {
            defaultConfig = { steps: ["담당", "대표"] };
        }

        const newBlock = { id, type, width: '100%', config: defaultConfig };
        onChange({ ...template, layout_data: { ...template.layout_data, blocks: [...blocks, newBlock] } });
    };

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            const oldIndex = blocks.findIndex(b => b.id === active.id);
            const newIndex = blocks.findIndex(b => b.id === over.id);
            const newBlocks = arrayMove(blocks, oldIndex, newIndex);
            onChange({ ...template, layout_data: { ...template.layout_data, blocks: newBlocks } });
        }
    };

    return (
        <div className="flex h-full bg-gray-950 rounded-xl border border-gray-800 overflow-hidden min-h-[800px]">
            {/* Sidebar: Add Blocks */}
            <div className="w-64 border-r border-gray-800 bg-gray-900 flex flex-col">
                <div className="p-4 border-b border-gray-800">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Layout className="w-4 h-4 text-blue-500" />
                        블록 라이브러리
                    </h3>
                </div>
                <div className="flex-1 overflow-auto p-4 space-y-2">
                    {[
                        { type: 'header', icon: Type, label: '문서 제목' },
                        { type: 'boxedHeader', icon: Layout, label: '강조 헤더 (노란색)' },
                        { type: 'infoTable', icon: TableIcon, label: '가변 표 (Resizable)' },
                        { type: 'memo', icon: FileText, label: '메모 영역' },
                        { type: 'approval', icon: CheckCircle2, label: '서명 및 결제 (직인 포함)' },
                    ].map(item => (
                        <button
                            key={item.type}
                            onClick={() => addBlock(item.type)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:border-blue-500 hover:text-white transition-all group"
                        >
                            <item.icon className="w-4 h-4 text-gray-500 group-hover:text-blue-400" />
                            <span className="text-xs font-medium">{item.label}</span>
                            <Plus className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100" />
                        </button>
                    ))}
                </div>
            </div>

            {/* Canvas Area */}
            <div className="flex-1 overflow-auto bg-gray-800/50 flex justify-center p-8 scrollbar-hide">
                <div className="bg-white w-[210mm] min-h-[297mm] shadow-2xl p-[10mm] relative">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={blocks.map(b => b.id)} strategy={rectSortingStrategy}>
                            <div className="flex flex-wrap content-start w-full">
                                {blocks.map(block => (
                                    <SortableItem
                                        key={block.id}
                                        id={block.id}
                                        block={block}
                                        onRemove={(id) => {
                                            const nb = blocks.filter(b => b.id !== id);
                                            onChange({ ...template, layout_data: { ...template.layout_data, blocks: nb } });
                                        }}
                                        onSelect={setSelectedBlock}
                                        isSelected={selectedBlock?.id === block.id}
                                    >
                                        <BlockRenderer block={block} onUpdateConfig={(id, cfg) => updateBlockConfig(id, cfg)} />
                                    </SortableItem>
                                ))}
                                {blocks.length === 0 && (
                                    <div className="w-full h-64 border-2 border-dashed border-gray-700 rounded-xl flex flex-col items-center justify-center text-gray-500 gap-4">
                                        <div className="p-4 bg-gray-800 rounded-full"><Plus className="w-8 h-8" /></div>
                                        <p className="text-sm font-medium">왼쪽 라이브러리에서 블록을 추가하세요</p>
                                    </div>
                                )}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
            </div>

            {/* Property Panel */}
            <div className="w-72 border-l border-gray-800 bg-gray-900 flex flex-col">
                <div className="p-4 border-b border-gray-800">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Settings className="w-4 h-4 text-blue-500" />
                        블록 속성
                    </h3>
                </div>
                <div className="flex-1 overflow-auto p-4">
                    {selectedBlock ? (
                        <div className="space-y-6">
                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">너비 조절</label>
                                <div className="grid grid-cols-3 gap-1">
                                    {['100%', '50%', '33%'].map(w => (
                                        <button
                                            key={w}
                                            onClick={() => updateBlock(selectedBlock.id, { width: w })}
                                            className={cn(
                                                "py-1 text-[10px] rounded border transition-all",
                                                selectedBlock.width === w || (!selectedBlock.width && w === '100%')
                                                    ? "bg-blue-600 border-blue-500 text-white"
                                                    : "border-gray-700 text-gray-400 hover:border-gray-500"
                                            )}
                                        >
                                            {w}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {selectedBlock.type === 'infoTable' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">표 레이아웃</label>
                                    <div className="p-3 bg-gray-950 border border-gray-800 rounded-lg space-y-3">
                                        <button
                                            onClick={() => {
                                                const currentRows = selectedBlock.config.rows || [];
                                                uc({ rows: currentRows.map(r => [...r, ""]) });
                                                const newWidths = [...(selectedBlock.config.colWidths || [])];
                                                newWidths.push(100);
                                                updateBlockConfig(selectedBlock.id, { ...selectedBlock.config, colWidths: newWidths });
                                            }}
                                            className="w-full py-1.5 text-[10px] bg-gray-800 border border-gray-700 rounded text-gray-300 hover:bg-gray-700"
                                        >
                                            열(Column) 추가
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="p-4 rounded-lg bg-blue-600/5 border border-blue-500/20">
                                <p className="text-[10px] text-blue-400 leading-relaxed flex items-start gap-2">
                                    <Info className="w-4 h-4 mt-0.5 shrink-0" />
                                    표의 우측 테두리를 드래그하여 셀 너비를 미세하게 조정할 수 있습니다. 폰트 크기는 셀 너비에 맞춰 자동 조절(Auto-fit)됩니다.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-center p-8 opacity-20">
                            <Settings className="w-12 h-12 mb-4" />
                            <p className="text-xs">편집할 블록을<br />선택하세요</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VisualFormEditor;
