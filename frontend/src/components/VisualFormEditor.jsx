import React, { useState, useMemo } from 'react';
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
    verticalListSortingStrategy,
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
    Image as ImageIcon,
    Layout
} from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

// --- Sortable Item Wrapper ---
const SortableItem = ({ id, children, onRemove, onEdit, isSelected }) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        position: 'relative'
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "group relative border-2 border-transparent hover:border-blue-500/50 transition-all rounded-lg mb-2",
                isSelected && "border-blue-500 shadow-lg shadow-blue-500/10",
                isDragging && "opacity-50 border-blue-500 border-dashed"
            )}
            onClick={(e) => {
                e.stopPropagation();
                onEdit();
            }}
        >
            {/* Handle & Actions */}
            <div className="absolute -left-10 top-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1">
                <div {...attributes} {...listeners} className="p-1.5 bg-gray-800 rounded border border-gray-700 cursor-grab active:cursor-grabbing text-gray-400 hover:text-white">
                    <GripVertical className="w-4 h-4" />
                </div>
                <button
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    className="p-1.5 bg-gray-800 rounded border border-gray-700 text-red-400 hover:bg-red-900/20"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>

            <div className="bg-white rounded overflow-hidden">
                {children}
            </div>
        </div>
    );
};

// --- Block Renderers ---
const BlockRenderer = ({ block, config }) => {
    switch (block.type) {
        case 'header':
            return (
                <div className="p-4 border-b-2 border-black flex justify-between items-center bg-gray-50/50">
                    <div className="text-2xl font-bold underline decoration-double">{config.title || "양식 제목"}</div>
                    <div className="flex gap-2">
                        <div className="w-12 h-12 border border-dashed border-gray-300 rounded flex items-center justify-center text-[10px] text-gray-400">LOGO</div>
                        <div className="w-10 h-10 border border-dashed border-gray-300 rounded-full flex items-center justify-center text-[10px] text-gray-400">STAMP</div>
                    </div>
                </div>
            );
        case 'infoTable':
            return (
                <div className="p-4">
                    <table className="w-full border-collapse border border-black text-xs">
                        <tbody>
                            <tr>
                                <td className="border border-black bg-gray-100 p-2 font-bold w-20">필드 1</td>
                                <td className="border border-black p-2">데이터 영역</td>
                                <td className="border border-black bg-gray-100 p-2 font-bold w-20">필드 2</td>
                                <td className="border border-black p-2">데이터 영역</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            );
        case 'productList':
            return (
                <div className="p-4" key={block.id}>
                    <div className="text-xs font-bold mb-1">대상 품목 리스트</div>
                    <table className="w-full border-collapse border border-black text-xs">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="border border-black p-2">품명</th>
                                <th className="border border-black p-2">규격</th>
                                <th className="border border-black p-2">수량</th>
                                <th className="border border-black p-2">비고</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2].map(i => (
                                <tr key={i}>
                                    <td className="border border-black p-2">...</td>
                                    <td className="border border-black p-2">...</td>
                                    <td className="border border-black p-2">...</td>
                                    <td className="border border-black p-2">...</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'processTable':
            return (
                <div className="p-4" key={block.id}>
                    <div className="text-xs font-bold mb-1">상세 공정 흐름도</div>
                    <table className="w-full border-collapse border border-black text-[10px]">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="border border-black p-1">순번</th>
                                <th className="border border-black p-1">공정</th>
                                <th className="border border-black p-1">내용</th>
                                <th className="border border-black p-1">업체</th>
                                <th className="border border-black p-1">상태</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[1, 2, 3].map(i => (
                                <tr key={i}>
                                    <td className="border border-black p-1 text-center">{i}</td>
                                    <td className="border border-black p-1">...</td>
                                    <td className="border border-black p-1">...</td>
                                    <td className="border border-black p-1">...</td>
                                    <td className="border border-black p-1">...</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            );
        case 'memo':
            return (
                <div className="p-4 flex">
                    <div className="w-20 border border-black bg-gray-50 flex items-center justify-center font-bold text-xs">Memo</div>
                    <div className="flex-1 border-y border-r border-black p-4 min-h-[60px] text-xs text-gray-400 italic">내용이 표시됩니다...</div>
                </div>
            );
        default:
            return <div className="p-4 text-gray-400 italic">알 수 없는 블록 타입: {block.type}</div>;
    }
};

const VisualFormEditor = ({ template, onChange }) => {
    const [selectedBlockId, setSelectedBlockId] = useState(null);

    // Default layout if none exists
    const layout = template.layout_data?.blocks || [
        { id: 'h1', type: 'header', config: { title: template.name } },
        { id: 'i1', type: 'infoTable', config: {} },
        { id: 'p1', type: 'productList', config: {} },
        { id: 'm1', type: 'memo', config: {} }
    ];

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event) => {
        const { active, over } = event;

        if (active.id !== over.id) {
            const oldIndex = layout.findIndex(item => item.id === active.id);
            const newIndex = layout.findIndex(item => item.id === over.id);

            const newBlocks = arrayMove(layout, oldIndex, newIndex);
            onChange({ ...template, layout_data: { ...template.layout_data, blocks: newBlocks } });
        }
    };

    const addBlock = (type) => {
        const newBlock = {
            id: `${type}-${Date.now()}`,
            type,
            config: {}
        };
        const newBlocks = [...layout, newBlock];
        onChange({ ...template, layout_data: { ...template.layout_data, blocks: newBlocks } });
        setSelectedBlockId(newBlock.id);
    };

    const removeBlock = (id) => {
        const newBlocks = layout.filter(b => b.id !== id);
        onChange({ ...template, layout_data: { ...template.layout_data, blocks: newBlocks } });
        if (selectedBlockId === id) setSelectedBlockId(null);
    };

    const updateBlockConfig = (id, newConfig) => {
        const newBlocks = layout.map(b => b.id === id ? { ...b, config: { ...b.config, ...newConfig } } : b);
        onChange({ ...template, layout_data: { ...template.layout_data, blocks: newBlocks } });
    };

    const selectedBlock = useMemo(() => layout.find(b => b.id === selectedBlockId), [layout, selectedBlockId]);

    return (
        <div className="flex gap-6 h-full min-h-[600px]">
            {/* Sidebar: Add Components */}
            <div className="w-64 flex flex-col gap-4">
                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                    <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                        <Plus className="w-4 h-4 text-blue-500" />
                        구성 요소 추가
                    </h4>
                    <div className="grid grid-cols-1 gap-2">
                        <Button variant="ghost" className="justify-start gap-2 text-gray-400 hover:text-white hover:bg-gray-700" onClick={() => addBlock('header')}>
                            <Type className="w-4 h-4" /> 헤더 (제목/로고)
                        </Button>
                        <Button variant="ghost" className="justify-start gap-2 text-gray-400 hover:text-white hover:bg-gray-700" onClick={() => addBlock('infoTable')}>
                            <TableIcon className="w-4 h-4" /> 정보 테이블 (수신/참조)
                        </Button>
                        <Button variant="ghost" className="justify-start gap-2 text-gray-400 hover:text-white hover:bg-gray-700" onClick={() => addBlock('productList')}>
                            <Layout className="w-4 h-4" /> 대상 품목 리스트
                        </Button>
                        <Button variant="ghost" className="justify-start gap-2 text-gray-400 hover:text-white hover:bg-gray-700" onClick={() => addBlock('processTable')}>
                            <Settings2 className="w-4 h-4" /> 상세 공정 테이블
                        </Button>
                        <Button variant="ghost" className="justify-start gap-2 text-gray-400 hover:text-white hover:bg-gray-700" onClick={() => addBlock('memo')}>
                            <StickyNote className="w-4 h-4" /> 메모 섹션
                        </Button>
                    </div>
                </div>

                {/* Property Editor */}
                {selectedBlock && (
                    <div className="bg-gray-800/50 p-4 rounded-xl border border-blue-500/30 animate-in fade-in slide-in-from-left-2 transition-all">
                        <h4 className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                            <Settings2 className="w-4 h-4" />
                            블록 속성 설정
                        </h4>
                        <div className="space-y-4">
                            {selectedBlock.type === 'header' && (
                                <div className="space-y-2">
                                    <label className="text-xs text-gray-500">제목 텍스트</label>
                                    <input
                                        className="w-full bg-gray-900 border-gray-700 rounded p-2 text-sm text-white"
                                        value={selectedBlock.config.title || ""}
                                        onChange={(e) => updateBlockConfig(selectedBlock.id, { title: e.target.value })}
                                    />
                                </div>
                            )}
                            <div className="text-[10px] text-gray-600 italic">
                                ID: {selectedBlock.id}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Canvas Area */}
            <div className="flex-1 bg-gray-950 p-8 rounded-2xl border border-gray-800 overflow-y-auto max-h-[800px] flex justify-center custom-scrollbar">
                <div className="w-[210mm] min-h-[297mm] bg-white text-black p-[10mm] shadow-2xl origin-top">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={layout.map(b => b.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-0 relative"> {/* space-y-0 because paper doesn't have gaps usually */}
                                {layout.map(block => (
                                    <SortableItem
                                        key={block.id}
                                        id={block.id}
                                        onRemove={() => removeBlock(block.id)}
                                        onEdit={() => setSelectedBlockId(block.id)}
                                        isSelected={selectedBlockId === block.id}
                                    >
                                        <BlockRenderer block={block} config={block.config} />
                                    </SortableItem>
                                ))}
                                {layout.length === 0 && (
                                    <div className="py-20 text-center border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
                                        오른쪽에서 구성 요소를 추가하여 양식을 작성하세요.
                                    </div>
                                )}
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
            </div>
        </div>
    );
};

export default VisualFormEditor;
