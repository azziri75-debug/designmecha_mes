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
    Layout,
    CheckSquare
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
                <div className="p-4 border-b-2 border-black flex justify-center items-center bg-gray-50/50" key={block.id}>
                    <div className="text-2xl font-bold underline decoration-double tracking-[0.5em]">{config.title || "양식 제목"}</div>
                </div>
            );
        case 'approval':
            const steps = config.steps || ["담당", "대표이사"];
            return (
                <div className="p-4 flex justify-end" key={block.id}>
                    <div className="flex border border-black text-[10px]">
                        <div className="w-6 border-r border-black bg-gray-100 flex items-center justify-center font-bold writing-vertical py-2">결제</div>
                        {steps.map((step, i) => (
                            <div key={i} className={cn("w-16 flex flex-col", i !== steps.length - 1 && "border-r border-black")}>
                                <div className="border-b border-black bg-gray-100 p-1 text-center font-bold h-6 flex items-center justify-center">{step}</div>
                                <div className="h-12"></div>
                            </div>
                        ))}
                    </div>
                </div>
            );
        case 'infoTable':
            return (
                <div className="p-4" key={block.id}>
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
        case 'boxedHeader':
            return (
                <div className="p-4 flex justify-center" key={block.id}>
                    <div className="border-2 border-black px-12 py-2 text-2xl font-bold tracking-[1em] indent-[1em]">
                        {config.title || "문서 제목"}
                    </div>
                </div>
            );
        case 'supplierTable':
            return (
                <div className="p-4 flex justify-end" key={block.id}>
                    <div className="w-[85mm] border-2 border-black p-2 flex text-[10px]">
                        <div className="w-8 border-r border-black flex items-center justify-center font-bold writing-vertical py-2 bg-gray-100 italic">공급자</div>
                        <div className="flex-1 space-y-1 pl-1 italic text-gray-400">
                            <div>등록번호: ...</div>
                            <div>상호: ...</div>
                            <div>주소: ...</div>
                            <div>업태/종목: ...</div>
                        </div>
                    </div>
                </div>
            );
        case 'sumBox':
            return (
                <div className="p-4" key={block.id}>
                    <div className="border-y-2 border-black py-2 flex items-center justify-between font-bold">
                        <span className="text-lg">합계금액 (부가가치세 별도)</span>
                        <span className="text-xl italic text-gray-400 font-mono">￦ 0,000,000</span>
                    </div>
                </div>
            );
        case 'drawing':
            return (
                <div className="p-4 flex flex-col gap-2 border border-dashed border-gray-600 rounded bg-gray-900/20" key={block.id}>
                    <div className="text-xs font-bold text-gray-500 uppercase">도면 영역</div>
                    <div className="h-48 flex items-center justify-center text-gray-400 italic">
                        [ 도면 이미지가 표시되는 영역입니다 ]
                    </div>
                </div>
            );
        case 'memo':
            return (
                <div className="p-4 flex" key={block.id}>
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
            config: type === 'approval' ? { steps: ["담당", "대표이사"] } : {}
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
            <div className="w-64 flex flex-col gap-4">
                <div className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                    <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                        <Plus className="w-4 h-4 text-blue-500" /> 구성 요소 추가
                    </h4>
                    <div className="grid grid-cols-1 gap-1">
                        <Button variant="ghost" size="sm" className="justify-start gap-2 text-gray-400 hover:text-white" onClick={() => addBlock('boxedHeader')}>
                            <Type className="w-4 h-4" /> 박스 헤더 (발주서용)
                        </Button>
                        <Button variant="ghost" size="sm" className="justify-start gap-2 text-gray-400 hover:text-white" onClick={() => addBlock('approval')}>
                            <CheckSquare className="w-4 h-4" /> 결제칸 (담당/대표)
                        </Button>
                        <Button variant="ghost" size="sm" className="justify-start gap-2 text-gray-400 hover:text-white" onClick={() => addBlock('infoTable')}>
                            <TableIcon className="w-4 h-4" /> 기본 정보 테이블
                        </Button>
                        <Button variant="ghost" size="sm" className="justify-start gap-2 text-gray-400 hover:text-white" onClick={() => addBlock('supplierTable')}>
                            <TableIcon className="w-4 h-4" /> 공급자 정보 테이블
                        </Button>
                        <Button variant="ghost" size="sm" className="justify-start gap-2 text-gray-400 hover:text-white" onClick={() => addBlock('sumBox')}>
                            <Type className="w-4 h-4" /> 합계 금액 박스
                        </Button>
                        <Button variant="ghost" size="sm" className="justify-start gap-2 text-gray-400 hover:text-white" onClick={() => addBlock('productList')}>
                            <Layout className="w-4 h-4" /> 품목 리스트
                        </Button>
                        <Button variant="ghost" size="sm" className="justify-start gap-2 text-gray-400 hover:text-white" onClick={() => addBlock('drawing')}>
                            <Layout className="w-4 h-4" /> 도면 영역
                        </Button>
                        <Button variant="ghost" size="sm" className="justify-start gap-2 text-gray-400 hover:text-white" onClick={() => addBlock('processTable')}>
                            <Settings2 className="w-4 h-4" /> 상세 공정 테이블
                        </Button>
                        <Button variant="ghost" size="sm" className="justify-start gap-2 text-gray-400 hover:text-white" onClick={() => addBlock('memo')}><StickyNote className="w-4 h-4" /> 메모 섹션</Button>
                    </div>
                </div>

                {selectedBlock && (
                    <div className="bg-gray-800/50 p-4 rounded-xl border border-blue-500/30">
                        <h4 className="text-sm font-bold text-blue-400 mb-3 flex items-center gap-2">
                            <Settings2 className="w-4 h-4" /> 블록 속성 설정
                        </h4>
                        <div className="space-y-4">
                            {selectedBlock.type === 'header' && (
                                <div className="space-y-1">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold">제목 텍스트</label>
                                    <input
                                        className="w-full bg-gray-900 border-gray-700 rounded p-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                                        value={selectedBlock.config.title || ""}
                                        onChange={(e) => updateBlockConfig(selectedBlock.id, { title: e.target.value })}
                                        placeholder="견 적 서 / 생산지시서 등"
                                    />
                                </div>
                            )}
                            {selectedBlock.type === 'approval' && (
                                <div className="space-y-2">
                                    <label className="text-[10px] text-gray-500 uppercase font-bold">결제 단계 (콤마로 구분)</label>
                                    <input
                                        className="w-full bg-gray-900 border-gray-700 rounded p-2 text-sm text-white focus:ring-1 focus:ring-blue-500 outline-none"
                                        value={(selectedBlock.config.steps || []).join(', ')}
                                        onChange={(e) => updateBlockConfig(selectedBlock.id, { steps: e.target.value.split(',').map(s => s.trim()) })}
                                        placeholder="담당, 팀장, 대표이사"
                                    />
                                </div>
                            )}
                            <div className="text-[10px] text-gray-600 border-t border-gray-700 pt-2">TYPE: {selectedBlock.type.toUpperCase()} / ID: {selectedBlock.id}</div>
                        </div>
                    </div>
                )}
            </div>

            <div className="flex-1 bg-gray-950 p-8 rounded-2xl border border-gray-800 overflow-y-auto max-h-[800px] flex justify-center custom-scrollbar">
                <div className="w-[210mm] min-h-[297mm] bg-white text-black p-[10mm] shadow-2xl origin-top">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={layout.map(b => b.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-0 relative">
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
                            </div>
                        </SortableContext>
                    </DndContext>
                </div>
            </div>
        </div>
    );
};

export default VisualFormEditor;
