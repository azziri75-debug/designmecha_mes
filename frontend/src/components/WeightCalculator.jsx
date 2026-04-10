import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Edit2, Check, Calculator } from 'lucide-react';

const DEFAULT_MATERIALS = [
    { id: 1, name: 'S45C',      density: 7.85 },
    { id: 2, name: 'SKD11',     density: 7.80 },
    { id: 3, name: 'SKD61',     density: 7.80 },
    { id: 4, name: 'SS400',     density: 7.85 },
    { id: 5, name: 'AL-7075',   density: 2.81 },
    { id: 6, name: 'Ti-6Al-4V', density: 4.43 },
];

const STORAGE_KEY = 'wc_materials';

const loadMaterials = () => {
    try {
        const s = localStorage.getItem(STORAGE_KEY);
        return s ? JSON.parse(s) : DEFAULT_MATERIALS;
    } catch { return DEFAULT_MATERIALS; }
};

const saveMaterials = (list) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
};

// ─── SVG 도면 ────────────────────────────────────────────────────────────────
const RectDiagram = ({ w = '가로', h = '세로', t = '높이' }) => (
    <svg viewBox="0 0 240 160" className="w-full max-w-xs mx-auto">
        <defs>
            <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#60a5fa"/>
            </marker>
        </defs>
        {/* 사각 투상 */}
        <rect x="40" y="30" width="120" height="80" fill="#1e3a5f" stroke="#60a5fa" strokeWidth="1.5"/>
        <polygon points="40,30 60,10 180,10 160,30" fill="#1e3a5f" stroke="#60a5fa" strokeWidth="1.5"/>
        <polygon points="160,30 180,10 180,90 160,110" fill="#1e3a5f" stroke="#60a5fa" strokeWidth="1.5"/>
        {/* 가로 치수선 */}
        <line x1="40" y1="120" x2="160" y2="120" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arr)" markerEnd="url(#arr)"/>
        <text x="100" y="135" textAnchor="middle" fill="#93c5fd" fontSize="11">{w} mm</text>
        {/* 세로 치수선 */}
        <line x1="10" y1="30" x2="10" y2="110" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arr)" markerEnd="url(#arr)"/>
        <text x="6" y="74" textAnchor="middle" fill="#93c5fd" fontSize="11" transform="rotate(-90,6,74)">{h} mm</text>
        {/* 높이 치수선 */}
        <line x1="175" y1="10" x2="195" y2="10" stroke="#60a5fa" strokeWidth="1"/>
        <line x1="185" y1="10" x2="185" y2="90" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arr)" markerEnd="url(#arr)"/>
        <line x1="175" y1="90" x2="195" y2="90" stroke="#60a5fa" strokeWidth="1"/>
        <text x="205" y="54" textAnchor="start" fill="#93c5fd" fontSize="11">{t} mm</text>
    </svg>
);

const CylDiagram = ({ d = '직경', l = '길이' }) => (
    <svg viewBox="0 0 240 160" className="w-full max-w-xs mx-auto">
        <defs>
            <marker id="arr2" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#60a5fa"/>
            </marker>
        </defs>
        {/* 원통 본체 */}
        <rect x="60" y="40" width="120" height="80" fill="#1e3a5f" stroke="#60a5fa" strokeWidth="1.5"/>
        <ellipse cx="60" cy="80" rx="20" ry="40" fill="#1e3a5f" stroke="#60a5fa" strokeWidth="1.5"/>
        <ellipse cx="180" cy="80" rx="20" ry="40" fill="#1e3a5f" stroke="#60a5fa" strokeWidth="1.5"/>
        {/* 길이 치수선 */}
        <line x1="60" y1="130" x2="180" y2="130" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arr2)" markerEnd="url(#arr2)"/>
        <text x="120" y="145" textAnchor="middle" fill="#93c5fd" fontSize="11">{l} mm</text>
        {/* 직경 치수선 */}
        <line x1="10" y1="40" x2="10" y2="120" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arr2)" markerEnd="url(#arr2)"/>
        <text x="6" y="84" textAnchor="middle" fill="#93c5fd" fontSize="11" transform="rotate(-90,6,84)">φ{d} mm</text>
    </svg>
);

const RingDiagram = ({ od = '외경', id2 = '내경', t = '두께' }) => (
    <svg viewBox="0 0 240 180" className="w-full max-w-xs mx-auto">
        <defs>
            <marker id="arr3" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#60a5fa"/>
            </marker>
        </defs>
        {/* 링 (윗면 정면) */}
        <ellipse cx="120" cy="70" rx="70" ry="30" fill="none" stroke="#60a5fa" strokeWidth="1.5"/>
        <ellipse cx="120" cy="70" rx="35" ry="15" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.5"/>
        {/* 링 옆면 */}
        <line x1="50" y1="70" x2="50" y2="100" stroke="#60a5fa" strokeWidth="1.5"/>
        <line x1="190" y1="70" x2="190" y2="100" stroke="#60a5fa" strokeWidth="1.5"/>
        <line x1="85" y1="70" x2="85" y2="100" stroke="#60a5fa" strokeWidth="1" strokeDasharray="3,2"/>
        <line x1="155" y1="70" x2="155" y2="100" stroke="#60a5fa" strokeWidth="1" strokeDasharray="3,2"/>
        <ellipse cx="120" cy="100" rx="70" ry="30" fill="#1e3a5f" stroke="#60a5fa" strokeWidth="1.5"/>
        <ellipse cx="120" cy="100" rx="35" ry="15" fill="#0f172a" stroke="#60a5fa" strokeWidth="1.5"/>
        {/* 외경 치수선 */}
        <line x1="120" y1="100" x2="190" y2="100" stroke="#60a5fa" strokeWidth="1" markerEnd="url(#arr3)"/>
        <text x="158" y="116" textAnchor="middle" fill="#93c5fd" fontSize="10">R외={od}/2</text>
        {/* 내경 치수선 */}
        <line x1="120" y1="100" x2="85" y2="100" stroke="#60a5fa" strokeWidth="1" markerEnd="url(#arr3)"/>
        <text x="100" y="88" textAnchor="middle" fill="#93c5fd" fontSize="10">R내={id2}/2</text>
        {/* 두께 치수선 */}
        <line x1="205" y1="70" x2="205" y2="100" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arr3)" markerEnd="url(#arr3)"/>
        <text x="221" y="88" textAnchor="start" fill="#93c5fd" fontSize="10">{t} mm</text>
    </svg>
);

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────
const WeightCalculator = ({ onClose }) => {
    const [materials, setMaterials] = useState(loadMaterials);
    const [selMat, setSelMat] = useState(materials[0] || null);
    const [customDensity, setCustomDensity] = useState('');
    const [shape, setShape] = useState('rect');
    const [dims, setDims] = useState({ w: '', h: '', t: '', d: '', l: '', od: '', id: '', th: '' });
    const [unitPrice, setUnitPrice] = useState('');
    const [qty, setQty] = useState('1');
    const [result, setResult] = useState(null);
    const [tab, setTab] = useState('calc'); // calc | manage
    const [editMat, setEditMat] = useState(null);
    const [newMat, setNewMat] = useState({ name: '', density: '' });

    useEffect(() => { saveMaterials(materials); }, [materials]);
    useEffect(() => {
        if (selMat) setCustomDensity(selMat.density.toString());
    }, [selMat]);

    const density = parseFloat(customDensity) || 0;

    const calcWeight = () => {
        const d = (k) => parseFloat(dims[k]) || 0;
        const PI = Math.PI;
        let vol = 0;
        if (shape === 'rect') vol = d('w') * d('h') * d('t');
        if (shape === 'cyl')  vol = (PI / 4) * d('d') * d('d') * d('l');
        if (shape === 'ring') vol = (PI / 4) * (d('od') * d('od') - d('id') * d('id')) * d('th');
        const unit_kg = (vol * density) / 1_000_000;
        const q = parseInt(qty) || 1;
        const total_kg = unit_kg * q;
        const up = parseFloat(unitPrice) || 0;
        setResult({ unit_kg: unit_kg.toFixed(4), total_kg: total_kg.toFixed(3), total_price: (up * q).toLocaleString() });
    };

    const dim = (k) => (
        <input
            type="number" value={dims[k]}
            onChange={e => setDims(p => ({ ...p, [k]: e.target.value }))}
            placeholder="0"
            className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
    );

    return (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-emerald-500/20 rounded-xl flex items-center justify-center">
                            <Calculator className="w-5 h-5 text-emerald-400"/>
                        </div>
                        <div>
                            <h2 className="text-white font-bold text-base">중량 계산기</h2>
                            <p className="text-gray-500 text-xs">치수 단위: mm · 중량 단위: kg</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setTab('calc')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tab==='calc' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>계산</button>
                        <button onClick={() => setTab('manage')} className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${tab==='manage' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>재질 관리</button>
                        <button onClick={onClose} className="text-gray-500 hover:text-white ml-2"><X className="w-5 h-5"/></button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                {tab === 'calc' ? (
                    <>
                    {/* 재질 & 비중 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-gray-400 text-xs font-semibold block mb-1">재질 선택</label>
                            <select
                                value={selMat?.id ?? ''}
                                onChange={e => { const m = materials.find(x => x.id === Number(e.target.value)); setSelMat(m || null); }}
                                className="bg-gray-800 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">-- 재질 선택 --</option>
                                {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs font-semibold block mb-1">비중 (g/cm³)</label>
                            <input
                                type="number" step="0.01" value={customDensity}
                                onChange={e => { setCustomDensity(e.target.value); setSelMat(null); }}
                                placeholder="7.85"
                                className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    {/* 형상 선택 */}
                    <div>
                        <label className="text-gray-400 text-xs font-semibold block mb-2">형상 선택</label>
                        <div className="flex gap-2">
                            {[['rect','사각'], ['cyl','원통'], ['ring','링']].map(([k,l]) => (
                                <button key={k} onClick={() => setShape(k)}
                                    className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all border ${shape===k ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'}`}
                                >{l}</button>
                            ))}
                        </div>
                    </div>

                    {/* 도면 + 입력 */}
                    <div className="grid grid-cols-2 gap-4 items-center">
                        <div className="bg-gray-800/60 rounded-xl p-3">
                            {shape === 'rect' && <RectDiagram w={dims.w||'가로'} h={dims.h||'세로'} t={dims.t||'높이'}/>}
                            {shape === 'cyl'  && <CylDiagram  d={dims.d||'직경'} l={dims.l||'길이'}/>}
                            {shape === 'ring' && <RingDiagram od={dims.od||'외경'} id2={dims.id||'내경'} t={dims.th||'두께'}/>}
                        </div>
                        <div className="space-y-3">
                            {shape === 'rect' && <>
                                <div><label className="text-gray-400 text-xs mb-1 block">가로 (mm)</label>{dim('w')}</div>
                                <div><label className="text-gray-400 text-xs mb-1 block">세로 (mm)</label>{dim('h')}</div>
                                <div><label className="text-gray-400 text-xs mb-1 block">높이 (mm)</label>{dim('t')}</div>
                            </>}
                            {shape === 'cyl' && <>
                                <div><label className="text-gray-400 text-xs mb-1 block">직경 φ (mm)</label>{dim('d')}</div>
                                <div><label className="text-gray-400 text-xs mb-1 block">길이 (mm)</label>{dim('l')}</div>
                            </>}
                            {shape === 'ring' && <>
                                <div><label className="text-gray-400 text-xs mb-1 block">외경 (mm)</label>{dim('od')}</div>
                                <div><label className="text-gray-400 text-xs mb-1 block">내경 (mm)</label>{dim('id')}</div>
                                <div><label className="text-gray-400 text-xs mb-1 block">두께 (mm)</label>{dim('th')}</div>
                            </>}
                        </div>
                    </div>

                    {/* 단가 & 수량 */}
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="text-gray-400 text-xs font-semibold block mb-1">단가 (원/kg)</label>
                            <input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="0"
                                className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                        </div>
                        <div>
                            <label className="text-gray-400 text-xs font-semibold block mb-1">수량 (개)</label>
                            <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="1"
                                className="bg-gray-900 border border-gray-700 text-white rounded-lg px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"/>
                        </div>
                    </div>

                    {/* 계산 버튼 */}
                    <button onClick={calcWeight} className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm rounded-xl transition-all flex items-center justify-center gap-2">
                        <Calculator className="w-4 h-4"/> 중량 계산
                    </button>

                    {/* 결과 */}
                    {result && (
                        <div className="grid grid-cols-3 gap-3">
                            {[
                                { label: '개당 중량', value: `${result.unit_kg} kg`, color: 'text-blue-400' },
                                { label: '총 중량', value: `${result.total_kg} kg`, color: 'text-emerald-400' },
                                { label: '총 금액', value: `${result.total_price} 원`, color: 'text-amber-400' },
                            ].map(r => (
                                <div key={r.label} className="bg-gray-800 rounded-xl p-3 text-center border border-gray-700">
                                    <div className="text-gray-400 text-[11px] mb-1">{r.label}</div>
                                    <div className={`font-bold text-sm ${r.color}`}>{r.value}</div>
                                </div>
                            ))}
                        </div>
                    )}
                    </>
                ) : (
                    /* 재질 관리 탭 */
                    <div className="space-y-4">
                        <p className="text-gray-500 text-xs">재질 추가/수정/삭제 (브라우저 로컬 저장)</p>
                        <div className="space-y-2">
                            {materials.map(m => (
                                <div key={m.id} className="flex items-center gap-2 bg-gray-800 rounded-xl px-4 py-2 border border-gray-700">
                                    {editMat?.id === m.id ? (
                                        <>
                                            <input value={editMat.name} onChange={e => setEditMat(p => ({...p, name: e.target.value}))}
                                                className="bg-gray-900 border border-gray-600 text-white rounded-lg px-2 py-1 text-sm flex-1"/>
                                            <input type="number" step="0.01" value={editMat.density} onChange={e => setEditMat(p => ({...p, density: e.target.value}))}
                                                className="bg-gray-900 border border-gray-600 text-white rounded-lg px-2 py-1 text-sm w-20"/>
                                            <span className="text-gray-500 text-xs">g/cm³</span>
                                            <button onClick={() => { setMaterials(prev => prev.map(x => x.id === m.id ? {...editMat, density: parseFloat(editMat.density)} : x)); setEditMat(null); }}
                                                className="text-emerald-400 hover:text-emerald-300"><Check className="w-4 h-4"/></button>
                                            <button onClick={() => setEditMat(null)} className="text-gray-500 hover:text-white"><X className="w-4 h-4"/></button>
                                        </>
                                    ) : (
                                        <>
                                            <span className="text-white text-sm font-semibold flex-1">{m.name}</span>
                                            <span className="text-gray-400 text-xs">{m.density} g/cm³</span>
                                            <button onClick={() => setEditMat({...m})} className="text-blue-400 hover:text-blue-300 ml-2"><Edit2 className="w-3.5 h-3.5"/></button>
                                            <button onClick={() => { setMaterials(prev => prev.filter(x => x.id !== m.id)); if (selMat?.id === m.id) setSelMat(null); }}
                                                className="text-red-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5"/></button>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                        {/* 신규 재질 추가 */}
                        <div className="flex items-center gap-2 bg-gray-800/50 rounded-xl px-4 py-3 border border-dashed border-gray-600">
                            <input value={newMat.name} onChange={e => setNewMat(p => ({...p, name: e.target.value}))}
                                placeholder="재질명" className="bg-gray-900 border border-gray-700 text-white rounded-lg px-2 py-1 text-sm flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                            <input type="number" step="0.01" value={newMat.density} onChange={e => setNewMat(p => ({...p, density: e.target.value}))}
                                placeholder="비중" className="bg-gray-900 border border-gray-700 text-white rounded-lg px-2 py-1 text-sm w-20 focus:outline-none focus:ring-1 focus:ring-blue-500"/>
                            <span className="text-gray-500 text-xs whitespace-nowrap">g/cm³</span>
                            <button onClick={() => {
                                if (!newMat.name || !newMat.density) return;
                                const entry = { id: Date.now(), name: newMat.name, density: parseFloat(newMat.density) };
                                setMaterials(prev => [...prev, entry]);
                                setNewMat({ name: '', density: '' });
                            }} className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 whitespace-nowrap">
                                <Plus className="w-3 h-3"/> 추가
                            </button>
                        </div>
                    </div>
                )}
                </div>
            </div>
        </div>
    );
};

export default WeightCalculator;
