import React, { useState, useMemo, useEffect } from 'react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    rectSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
    GripVertical,
    Trash2,
    Plus,
    Settings2,
    Type,
    Table as TableIcon,
    StickyNote,
    Layout,
    CheckSquare,
    ChevronLeft,
    ChevronRight,
    Maximize2,
    MoveHorizontal
} from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

// --- Inline Editable Text ---
const EditableText = ({ value, onChange, className, placeholder = "입력...", isHeader = false }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(value || "");

    useEffect(() => { setText(value || ""); }, [value]);

    const handleBlur = () => {
        setIsEditing(false);
        if (text !== value) onChange(text);
    };

    if (isEditing) {
        return (
            <input
                autoFocus
                className={cn("bg-blue-50 border border-blue-300 outline-none px-1 rounded w-full", className)}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') handleBlur(); }}
            />
        );
    }

    return (
        <div
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            className={cn("cursor-text hover:bg-gray-100 rounded px-1 transition-colors min-h-[1em] min-w-[2em]", !value && "text-gray-300 italic", className)}
        >
            {value || placeholder}
        </div>
    );
};

// --- Sortable Item Wrapper ---
const SortableItem = ({ id, children, block, onRemove, onEdit, isSelected }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const widthMap = {
        '100%': 'w-full',
        '75%': 'w-3/4',
        '66%': 'w-2/3',
        '50%': 'w-1/2',
        '33%': 'w-1/3',
        '25%': 'w-1/4'
    };

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "p-1",
                widthMap[block.width || '100%'],
                isDragging && "opacity-50"
            )}
        >
            <div
                onClick={(e) => { e.stopPropagation(); onEdit(); }}
                className={cn(
                    "group relative border-2 border-transparent hover:border-blue-500/50 transition-all rounded-lg overflow-visible bg-white",
                    isSelected && "border-blue-500 shadow-lg"
                )}
            >
                {/* Controls */}
                <div className="absolute -top-3 -left-3 hidden group-hover:flex gap-1 z-50">
                    <div {...attributes} {...listeners} className="p-1.5 bg-gray-800 rounded-full border border-gray-700 cursor-grab active:cursor-grabbing text-white shadow-xl">
                        <GripVertical className="w-3 h-3" />
                    </div>
                </div>
                <div className="absolute -top-3 -right-3 hidden group-hover:flex gap-1 z-50">
                    <button
                        onClick={(e) => { e.stopPropagation(); onRemove(); }}
                        className="p-1.5 bg-red-600 rounded-full border border-red-500 text-white shadow-xl hover:bg-red-700"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>

                <div className="overflow-hidden">
                    {children}
                </div>
            </div>
        </div>
    );
};

// --- Block Renderers ---
const BlockRenderer = ({ block, onUpdateConfig }) => {
    const config = block.config || {};
    const uc = (newVal) => onUpdateConfig(block.id, newVal);

    switch (block.type) {
        case 'header':
            return (
                <div className="p-4 border-b-2 border-black flex flex-col items-center gap-2" key={block.id}>
                    <EditableText
                        value={config.title}
                        onChange={(v) => uc({ title: v })}
                        className="text-3xl font-bold tracking-[0.5em] text-center"
                        placeholder="문서 제목 입력"
                    />
                    <EditableText
                        value={config.subtitle}
                        onChange={(v) => uc({ subtitle: v })}
                        className="text-sm text-gray-500"
                        placeholder="부제목 혹은 설명"
                    />
                </div>
            );
        case 'approval':
            const steps = config.steps || ["담당", "대표"];
            return (
                <div className="p-2 flex justify-end" key={block.id}>
                    <div className="flex border border-black text-[10px]">
                        <div className="w-6 border-r border-black bg-gray-50 flex items-center justify-center font-bold writing-vertical py-2">결제</div>
                        {steps.map((step, i) => (
                            <div key={i} className={cn("w-14 flex flex-col", i !== steps.length - 1 && "border-r border-black")}>
                                <div className="border-b border-black bg-gray-50 py-1 text-center font-bold">{step}</div>
                                <div className="h-10"></div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        case 'infoTable':
            const rows = config.rows || [{ label1: "성명", value1: "", label2: "연락처", value2: "" }];
            return (
                <div className="p-2" key={block.id}>
                    <table className="w-full border-collapse border border-black text-xs">
                        <tbody>
                            {rows.map((row, idx) => (
                                <tr key={idx}>
                                    <td className="border border-black bg-gray-50 p-2 font-bold w-24">
                                        <EditableText value={row.label1} onChange={(v) => {
                                            const newRows = [...rows];
                                            newRows[idx].label1 = v;
                                            uc({ rows: newRows });
                                        }} />
                                    </td>
                                    <td className="border border-black p-2 italic text-gray-300">[데이터 영역]</td>
                                    <td className="border border-black bg-gray-50 p-2 font-bold w-24">
                                        <EditableText value={row.label2} onChange={(v) => {
                                            const newRows = [...rows];
                                            newRows[idx].label2 = v;
                                            uc({ rows: newRows });
                                        }} />
                                    </td>
                                    <td className="border border-black p-2 italic text-gray-300">[데이터 영역]</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'boxedHeader':
            return (
                <div className="p-4 flex justify-center" key={block.id}>
                    <div className="border-2 border-black px-12 py-2">
                        <EditableText
                            value={config.title}
                            onChange={(v) => uc({ title: v })}
                            className="text-2xl font-bold tracking-[1em] indent-[1em]"
                            placeholder="문서 제목"
                        />
                    </div>
                </div>
            );
        case 'supplierTable':
            return (
                <div className="p-2 flex justify-end" key={block.id}>
                    <div className="w-full max-w-[100mm] border-2 border-black flex text-[10px]">
                        <div className="w-8 border-r-2 border-black bg-gray-50 flex items-center justify-center font-bold writing-vertical py-4">공급자</div>
                        <div className="flex-1 divide-y divide-black">
                            <div className="flex divide-x divide-black h-8 items-center">
                                <div className="w-16 bg-gray-50 h-full flex items-center justify-center font-bold">등록번호</div>
                                <div className="flex-1 px-2 italic text-gray-300">...</div>
                            </div>
                            <div className="flex divide-x divide-black h-8 items-center">
                                <div className="w-16 bg-gray-50 h-full flex items-center justify-center font-bold">상호</div>
                                <div className="flex-1 px-2 italic text-gray-300">...</div>
                                <div className="w-10 bg-gray-50 h-full flex items-center justify-center font-bold">대표</div>
                                <div className="w-20 px-2 italic text-gray-300">...</div>
                            </div>
                            <div className="h-8 flex items-center px-1">
                                <span className="w-16 font-bold text-center">주소</span>
                                <span className="px-2 italic text-gray-300">...</span>
                            </div>
                        </div>
                    </div>
                </div>
            );
        case 'productList':
            return (
                <div className="p-2" key={block.id}>
                    <EditableText
                        value={config.header}
                        onChange={(v) => uc({ header: v })}
                        className="text-xs font-bold mb-1"
                        placeholder="품목 리스트 제목"
                    />
                    <table className="w-full border-collapse border border-black text-xs">
                        <thead>
                            <tr className="bg-gray-50 font-bold">
                                <th className="border border-black p-2 w-12 text-center">순번</th>
                                <th className="border border-black p-2">품명</th>
                                <th className="border border-black p-2 w-24">규격</th>
                                <th className="border border-black p-2 w-16">수량</th>
                                <th className="border border-black p-2">비고</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2].map(i => (
                                <tr key={i} className="h-8">
                                    <td className="border border-black text-center">{i}</td>
                                    <td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td><td className="border border-black"></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'drawing':
            return (
                <div className="p-2 h-full min-h-[150px]" key={block.id}>
                    <div className="border border-dashed border-gray-400 h-full flex flex-col items-center justify-center bg-gray-50 text-gray-400 italic rounded">
                        <Layout className="w-8 h-8 opacity-20 mb-2" />
                        도면 영역
                    </div>
                </div>
            );
        case 'memo':
            return (
                <div className="p-2" key={block.id}>
                    <div className="flex border border-black min-h-[100px]">
                        <div className="w-16 bg-gray-50 border-r border-black flex items-center justify-center font-bold text-xs">비고</div>
                        <div className="flex-1 p-2 text-xs italic text-gray-300 leading-relaxed">
                            <EditableText
                                value={config.content}
                                onChange={(v) => uc({ content: v })}
                                placeholder="기본 문구 혹은 메모..."
                            />
                        </div>
                    </div>
                </div>
            );
        default:
            return <div className="p-4 border border-dashed border-gray-300 rounded text-gray-400 italic">Block: {block.type}</div>;
    }
};

// --- Main Editor ---
const VisualFormEditor = ({ template, onChange }) => {
    const [selectedBlockId, setSelectedBlockId] = useState(null);

    const blocks = template.layout_data?.blocks || [
        { id: 'h1', type: 'header', width: '100%', config: { title: "견 적 서" } },
        { id: 's1', type: 'supplierTable', width: '100%', config: {} },
        { id: 'p1', type: 'productList', width: '100%', config: { header: "대상 품목 리스트" } },
        { id: 'm1', type: 'memo', width: '100%', config: {} }
    ];

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;
        if (active && over && active.id !== over.id) {
            const oldIndex = blocks.findIndex(item => item.id === active.id);
            const newIndex = blocks.findIndex(item => item.id === over.id);
            const newBlocks = arrayMove(blocks, oldIndex, newIndex);
            onChange({ ...template, layout_data: { ...template.layout_data, blocks: newBlocks } });
        }
    };

    const addBlock = (type) => {
        const newBlock = {
            id: `${type}-${Date.now()}`,
            type,
            width: '100%',
            config: type === 'infoTable' ? { rows: [{ label1: "성명", label2: "연락처" }] } : {}
        };
        const newBlocks = [...blocks, newBlock];
        onChange({ ...template, layout_data: { ...template.layout_data, blocks: newBlocks } });
        setSelectedBlockId(newBlock.id);
    };

    const removeBlock = (id) => {
        const newBlocks = blocks.filter(b => b.id !== id);
        onChange({ ...template, layout_data: { ...template.layout_data, blocks: newBlocks } });
        if (selectedBlockId === id) setSelectedBlockId(null);
    };

    const updateBlock = (id, fields) => {
        const newBlocks = blocks.map(b => b.id === id ? { ...b, ...fields } : b);
        onChange({ ...template, layout_data: { ...template.layout_data, blocks: newBlocks } });
    };

    const updateBlockConfig = (id, newConfig) => {
        const newBlocks = blocks.map(b => b.id === id ? { ...b, config: { ...b.config, ...newConfig } } : b);
        onChange({ ...template, layout_data: { ...template.layout_data, blocks: newBlocks } });
    };

    const selectedBlock = useMemo(() => blocks.find(b => b.id === selectedBlockId), [blocks, selectedBlockId]);

    return (
        <div className="flex gap-6 h-full min-h-[700px]">
            {/* Sidebar Left: Toolbox */}
            <div className="w-64 flex flex-col gap-4 shrink-0">
                <div className="bg-gray-800/80 p-4 rounded-xl border border-gray-700 shadow-xl">
                    <h4 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
                        <Plus className="w-4 h-4 text-blue-400" /> 구성 요소 추가
                    </h4>
                    <div className="grid grid-cols-1 gap-1.5 overflow-y-auto max-h-[400px] pr-1 custom-scrollbar">
                        {[
                            { type: 'header', icon: Type, label: '문서 헤더' },
                            { type: 'boxedHeader', icon: Type, label: '박스 헤더' },
                            { type: 'approval', icon: CheckSquare, label: '결제칸' },
                            { type: 'infoTable', icon: TableIcon, label: '기본 정보' },
                            { type: 'supplierTable', icon: TableIcon, label: '공급자 정보' },
                            { type: 'productList', icon: Layout, label: '품목 리스트' },
                            { type: 'drawing', icon: Layout, label: '도면 영역' },
                            { type: 'memo', icon: StickyNote, label: '메모/특기사항' },
                        ].map((btn) => (
                            <Button
                                key={btn.type}
                                variant="ghost"
                                size="sm"
                                className="justify-start gap-2 text-gray-400 hover:text-white hover:bg-gray-700/50"
                                onClick={() => addBlock(btn.type)}
                            >
                                <btn.icon className="w-4 h-4" /> {btn.label}
                            </Button>
                        ))}
                    </div>
                </div>

                {/* Sidebar Left: Property Panel */}
                {selectedBlock && (
                    <div className="bg-gray-800/80 p-4 rounded-xl border border-blue-500/30 shadow-xl animate-in slide-in-from-left-4 duration-200">
                        <h4 className="text-sm font-bold text-blue-400 mb-4 flex items-center gap-2 uppercase tracking-widest text-[10px]">
                            <Settings2 className="w-4 h-4" /> Layout Settings
                        </h4>
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[10px] text-gray-400 font-bold flex items-center gap-1">
                                    <MoveHorizontal className="w-3 h-3" /> BLOCK WIDTH
                                </label>
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

                            {selectedBlock.type === 'approval' && (
                                <div className="space-y-1.5 pt-2 border-t border-gray-700">
                                    <label className="text-[10px] text-gray-400 font-bold">결제 단계 (콤마 구분)</label>
                                    <input
                                        className="w-full bg-gray-900 border border-gray-700 rounded p-2 text-xs text-white"
                                        value={(selectedBlock.config.steps || []).join(', ')}
                                        onChange={(e) => updateBlockConfig(selectedBlock.id, { steps: e.target.value.split(',').map(s => s.trim()) })}
                                    />
                                </div>
                            )}

                            {selectedBlock.type === 'infoTable' && (
                                <div className="pt-2 border-t border-gray-700 space-y-2">
                                    <Button size="xs" variant="outline" className="w-full text-[10px] h-7 gap-1" onClick={() => {
                                        const rows = selectedBlock.config.rows || [];
                                        updateBlockConfig(selectedBlock.id, { rows: [...rows, { label1: "신규 필드", label2: "" }] });
                                    }}>
                                        <Plus className="w-3 h-3" /> 행 추가
                                    </Button>
                                </div>
                            )}

                            <div className="text-[10px] text-gray-600 font-mono mt-4 pt-4 border-t border-gray-700">
                                {selectedBlock.type.toUpperCase()} : {selectedBlock.id.slice(-4)}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Preview Canvas */}
            <div className="flex-1 bg-gray-950 p-6 rounded-2xl border border-gray-800 shadow-inner flex justify-center overflow-auto custom-scrollbar">
                <div className="w-[210mm] min-h-[297mm] bg-white text-black p-[5mm] shadow-2xl origin-top flex flex-col">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={blocks.map(b => b.id)} strategy={rectSortingStrategy}>
                            <div className="flex flex-wrap content-start w-full">
                                {blocks.map(block => (
                                    <SortableItem
                                        key={block.id}
                                        id={block.id}
                                        block={block}
                                        onRemove={() => removeBlock(block.id)}
                                        onEdit={() => setSelectedBlockId(block.id)}
                                        isSelected={selectedBlockId === block.id}
                                    >
                                        <BlockRenderer block={block} onUpdateConfig={updateBlockConfig} />
                                    </SortableItem>
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
            </div>
        </div>
    );
};

export default VisualFormEditor;
