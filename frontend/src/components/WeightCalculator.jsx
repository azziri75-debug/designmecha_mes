import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, Calculator } from 'lucide-react';

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
const saveMaterialsLS = (list) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
};

// ─── SVG 도면 ─────────────────────────────────────────────────────────────────
const RectDiagram = ({ w = '가로', h = '세로', t = '높이' }) => (
    <svg viewBox="0 0 240 160" style={{ width: '100%', maxWidth: 260 }}>
        <defs>
            <marker id="arrR" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L0,6 L6,3 z" fill="#60a5fa"/>
            </marker>
        </defs>
        <rect x="40" y="30" width="120" height="80" fill="#1e3a5f" stroke="#60a5fa" strokeWidth="1.5"/>
        <polygon points="40,30 60,10 180,10 160,30" fill="#243f6e" stroke="#60a5fa" strokeWidth="1.5"/>
        <polygon points="160,30 180,10 180,90 160,110" fill="#1a3358" stroke="#60a5fa" strokeWidth="1.5"/>
        {/* 가로 치수 */}
        <line x1="40" y1="122" x2="160" y2="122" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arrR)" markerEnd="url(#arrR)"/>
        <text x="100" y="136" textAnchor="middle" fill="#93c5fd" fontSize="11">{w} mm</text>
        {/* 세로 치수 */}
        <line x1="8" y1="30" x2="8" y2="110" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arrR)" markerEnd="url(#arrR)"/>
        <text x="4" y="74" textAnchor="middle" fill="#93c5fd" fontSize="11" transform="rotate(-90,4,74)">{h} mm</text>
        {/* 높이 치수 */}
        <line x1="174" y1="10" x2="194" y2="10" stroke="#60a5fa" strokeWidth="1"/>
        <line x1="184" y1="10" x2="184" y2="90" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arrR)" markerEnd="url(#arrR)"/>
        <line x1="174" y1="90" x2="194" y2="90" stroke="#60a5fa" strokeWidth="1"/>
        <text x="206" y="54" textAnchor="start" fill="#93c5fd" fontSize="11">{t} mm</text>
    </svg>
);

const CylDiagram = ({ d = '직경', l = '길이' }) => (
    <svg viewBox="0 0 260 170" style={{ width: '100%', maxWidth: 260 }}>
        <defs>
            <marker id="arrC" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                <path d="M0,0 L0,7 L7,3.5 z" fill="#60a5fa"/>
            </marker>
            <marker id="arrCR" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse">
                <path d="M0,0 L0,7 L7,3.5 z" fill="#60a5fa"/>
            </marker>
        </defs>
        {/* 원통 몸체 */}
        <rect x="55" y="40" width="130" height="85" fill="#1e3a5f" stroke="none"/>
        <ellipse cx="55"  cy="82" rx="22" ry="42" fill="#1e3a5f" stroke="#60a5fa" strokeWidth="1.5"/>
        <ellipse cx="185" cy="82" rx="22" ry="42" fill="#243f6e" stroke="#60a5fa" strokeWidth="1.5"/>
        <line x1="55"  y1="40"  x2="185" y2="40"  stroke="#60a5fa" strokeWidth="1.5"/>
        <line x1="55"  y1="124" x2="185" y2="124" stroke="#60a5fa" strokeWidth="1.5"/>
        {/* 길이 치수선 */}
        <line x1="55"  y1="138" x2="185" y2="138" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arrCR)" markerEnd="url(#arrC)"/>
        <text x="120" y="152" textAnchor="middle" fill="#93c5fd" fontSize="11">{l} mm</text>
        {/* 직경 치수선 */}
        <line x1="10" y1="40"  x2="10" y2="124" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arrCR)" markerEnd="url(#arrC)"/>
        <text x="6"  y="85"  textAnchor="middle" fill="#93c5fd" fontSize="11" transform="rotate(-90,6,85)">φ{d} mm</text>
    </svg>
);

const RingDiagram = ({ od = '외경', id2 = '내경', t = '두께' }) => (
    <svg viewBox="0 0 280 200" style={{ width: '100%', maxWidth: 280 }}>
        <defs>
            <marker id="arrG" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto">
                <path d="M0,0 L0,7 L7,3.5 z" fill="#60a5fa"/>
            </marker>
            <marker id="arrGR" markerWidth="7" markerHeight="7" refX="3.5" refY="3.5" orient="auto-start-reverse">
                <path d="M0,0 L0,7 L7,3.5 z" fill="#60a5fa"/>
            </marker>
        </defs>

        {/* ── 링 3D 뷰 ── */}
        {/* 하단 외곽 타원 (보이는 바닥면) */}
        <ellipse cx="115" cy="118" rx="80" ry="28" fill="#1e3a5f" stroke="#60a5fa" strokeWidth="1.5"/>
        {/* 하단 내경 구멍 */}
        <ellipse cx="115" cy="118" rx="38" ry="13" fill="#0d1b2a" stroke="#60a5fa" strokeWidth="1.5"/>

        {/* 좌우 옆면 수직선 */}
        <line x1="35"  y1="90"  x2="35"  y2="118" stroke="#60a5fa" strokeWidth="1.5"/>
        <line x1="195" y1="90"  x2="195" y2="118" stroke="#60a5fa" strokeWidth="1.5"/>
        {/* 내경 내벽 수직선 (점선) */}
        <line x1="77"  y1="105" x2="77"  y2="118" stroke="#60a5fa" strokeWidth="1" strokeDasharray="3,2"/>
        <line x1="153" y1="105" x2="153" y2="118" stroke="#60a5fa" strokeWidth="1" strokeDasharray="3,2"/>

        {/* 상단 외곽 타원 */}
        <ellipse cx="115" cy="90"  rx="80" ry="28" fill="#243f6e" stroke="#60a5fa" strokeWidth="1.5"/>
        {/* 상단 내경 구멍 */}
        <ellipse cx="115" cy="90"  rx="38" ry="13" fill="#0d1b2a" stroke="#60a5fa" strokeWidth="1.5"/>

        {/* ── 치수선 ── */}
        {/* 외경: 중심 → 외곽 우측 (상단 타원면) */}
        <line x1="115" y1="90" x2="195" y2="90" stroke="#facc15" strokeWidth="1" markerEnd="url(#arrG)"/>
        <text x="158" y="84" textAnchor="middle" fill="#facc15" fontSize="10" fontWeight="bold">φ{od}</text>

        {/* 내경: 중심 → 내경 우측 (상단 타원면) */}
        <line x1="115" y1="90" x2="153" y2="90" stroke="#fb923c" strokeWidth="1" markerEnd="url(#arrG)"/>
        <text x="137" y="106" textAnchor="middle" fill="#fb923c" fontSize="10" fontWeight="bold">φ{id2}</text>

        {/* 두께: 우측 세로 치수선 */}
        <line x1="206" y1="90"  x2="220" y2="90"  stroke="#60a5fa" strokeWidth="1"/>
        <line x1="213" y1="90"  x2="213" y2="118" stroke="#60a5fa" strokeWidth="1" markerStart="url(#arrGR)" markerEnd="url(#arrG)"/>
        <line x1="206" y1="118" x2="220" y2="118" stroke="#60a5fa" strokeWidth="1"/>
        <text x="228" y="107" textAnchor="start" fill="#93c5fd" fontSize="10">{t}<tspan fontSize="9"> mm</tspan></text>

        {/* 범례 */}
        <rect x="4" y="168" width="270" height="28" rx="4" fill="rgba(30,58,95,0.5)" stroke="#1e3a5f" strokeWidth="1"/>
        <circle cx="14" cy="182" r="4" fill="none" stroke="#facc15" strokeWidth="1.5"/>
        <text x="22" y="186" fill="#facc15" fontSize="9">외경(OD)</text>
        <circle cx="75" cy="182" r="4" fill="none" stroke="#fb923c" strokeWidth="1.5"/>
        <text x="83" y="186" fill="#fb923c" fontSize="9">내경(ID)</text>
        <line x1="138" y1="182" x2="148" y2="182" stroke="#60a5fa" strokeWidth="1.5"/>
        <text x="152" y="186" fill="#93c5fd" fontSize="9">두께(T)</text>
    </svg>
);

// ─── 계산기 본체 (standalone) ─────────────────────────────────────────────────
const WeightCalculatorContent = () => {
    const [materials, setMaterials] = useState(loadMaterials);
    const [selMat, setSelMat] = useState(() => loadMaterials()[0] || null);
    const [customDensity, setCustomDensity] = useState('');
    const [shape, setShape] = useState('rect');
    const [dims, setDims] = useState({ w: '', h: '', t: '', d: '', l: '', od: '', id: '', th: '' });
    const [unitPrice, setUnitPrice] = useState('');
    const [qty, setQty] = useState('1');
    const [result, setResult] = useState(null);
    const [tab, setTab] = useState('calc');
    const [editMat, setEditMat] = useState(null);
    const [newMat, setNewMat] = useState({ name: '', density: '' });

    useEffect(() => { saveMaterialsLS(materials); }, [materials]);
    useEffect(() => {
        if (selMat) setCustomDensity(String(selMat.density));
    }, [selMat]);

    const density = parseFloat(customDensity) || 0;

    const calcWeight = () => {
        const dv = (k) => parseFloat(dims[k]) || 0;
        let vol = 0;
        if (shape === 'rect') vol = dv('w') * dv('h') * dv('t');
        if (shape === 'cyl')  vol = (Math.PI / 4) * dv('d') * dv('d') * dv('l');
        if (shape === 'ring') vol = (Math.PI / 4) * (dv('od') * dv('od') - dv('id') * dv('id')) * dv('th');
        const unit_kg = (vol * density) / 1_000_000;
        const q = parseInt(qty) || 1;
        const total_kg = unit_kg * q;
        const up = parseFloat(unitPrice) || 0;
        setResult({
            unit_kg:     unit_kg.toFixed(5),
            total_kg:    total_kg.toFixed(4),
            total_price: (up * total_kg).toLocaleString(undefined, { maximumFractionDigits: 0 }),
        });
    };

    const inp = (label, k) => (
        <div>
            <label style={{ display:'block', color:'#9ca3af', fontSize:11, marginBottom:4 }}>{label} (mm)</label>
            <input
                type="number" value={dims[k]}
                onChange={e => setDims(p => ({ ...p, [k]: e.target.value }))}
                placeholder="0"
                style={inputStyle}
            />
        </div>
    );

    /* ── render ── */
    return (
        <div style={{ display:'flex', flexDirection:'column', height:'100vh', background:'#111827', color:'#f9fafb', fontFamily:'Inter,ui-sans-serif,system-ui,sans-serif', overflow:'hidden' }}>
            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderBottom:'1px solid #1f2937', background:'#0f172a', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ width:34, height:34, borderRadius:10, background:'rgba(16,185,129,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Calculator size={18} color="#10b981"/>
                    </div>
                    <div>
                        <div style={{ fontWeight:700, fontSize:14, color:'#fff' }}>중량 계산기</div>
                        <div style={{ fontSize:11, color:'#6b7280' }}>치수: mm · 중량: kg</div>
                    </div>
                </div>
                <div style={{ display:'flex', gap:6 }}>
                    <TabBtn label="계산" active={tab==='calc'} onClick={() => setTab('calc')}/>
                    <TabBtn label="재질 관리" active={tab==='manage'} onClick={() => setTab('manage')}/>
                </div>
            </div>

            {/* Body */}
            <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
            {tab === 'calc' ? (
                <>
                {/* 재질 & 비중 */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <div>
                        <label style={labelStyle}>재질 선택</label>
                        <select
                            value={selMat?.id ?? ''}
                            onChange={e => { const m = materials.find(x => x.id === Number(e.target.value)); setSelMat(m||null); }}
                            style={selectStyle}
                        >
                            <option value="">-- 재질 선택 --</option>
                            {materials.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={labelStyle}>비중 (g/cm³)</label>
                        <input type="number" step="0.01" value={customDensity}
                            onChange={e => { setCustomDensity(e.target.value); setSelMat(null); }}
                            placeholder="7.85" style={inputStyle}/>
                    </div>
                </div>

                {/* 형상 선택 */}
                <div>
                    <label style={labelStyle}>형상 선택</label>
                    <div style={{ display:'flex', gap:8 }}>
                        {[['rect','📦 사각'], ['cyl','🔵 원통'], ['ring','⭕ 링']].map(([k, l]) => (
                            <button key={k} onClick={() => setShape(k)} style={{
                                flex:1, padding:'8px 0', borderRadius:10, border: shape===k ? '1px solid #2563eb' : '1px solid #374151',
                                background: shape===k ? '#1d4ed8' : '#1f2937', color: shape===k ? '#fff' : '#9ca3af',
                                fontWeight:700, fontSize:13, cursor:'pointer', transition:'all .15s'
                            }}>{l}</button>
                        ))}
                    </div>
                </div>

                {/* 도면 + 입력 */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, alignItems:'center' }}>
                    <div style={{ background:'#1f2937', borderRadius:12, padding:12, display:'flex', justifyContent:'center' }}>
                        {shape==='rect' && <RectDiagram w={dims.w||'가로'} h={dims.h||'세로'} t={dims.t||'높이'}/>}
                        {shape==='cyl'  && <CylDiagram  d={dims.d||'직경'} l={dims.l||'길이'}/>}
                        {shape==='ring' && <RingDiagram od={dims.od||'외경'} id2={dims.id||'내경'} t={dims.th||'두께'}/>}
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {shape==='rect' && <>{inp('가로','w')}{inp('세로','h')}{inp('높이','t')}</>}
                        {shape==='cyl'  && <>{inp('직경 φ','d')}{inp('길이','l')}</>}
                        {shape==='ring' && <>{inp('외경','od')}{inp('내경','id')}{inp('두께','th')}</>}
                    </div>
                </div>

                {/* 단가 / 수량 */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <div>
                        <label style={labelStyle}>단가 (원/kg)</label>
                        <input type="number" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="0" style={inputStyle}/>
                    </div>
                    <div>
                        <label style={labelStyle}>수량 (개)</label>
                        <input type="number" value={qty} onChange={e => setQty(e.target.value)} placeholder="1" style={inputStyle}/>
                    </div>
                </div>

                {/* 계산 버튼 */}
                <button onClick={calcWeight} style={{
                    width:'100%', padding:'11px 0', background:'#059669', border:'none', borderRadius:12,
                    color:'#fff', fontWeight:700, fontSize:14, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8
                }}>
                    <Calculator size={16}/> 중량 계산
                </button>

                {/* 결과 */}
                {result && (
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
                        {[
                            { label:'개당 중량', val:`${result.unit_kg} kg`,  color:'#60a5fa' },
                            { label:'총 중량',   val:`${result.total_kg} kg`, color:'#34d399' },
                            { label:'재료비 합계', val:`${result.total_price} 원`, color:'#fbbf24' },
                        ].map(r => (
                            <div key={r.label} style={{ background:'#1f2937', borderRadius:12, padding:'12px 8px', textAlign:'center', border:'1px solid #374151' }}>
                                <div style={{ color:'#6b7280', fontSize:10, marginBottom:4 }}>{r.label}</div>
                                <div style={{ color:r.color, fontWeight:700, fontSize:13 }}>{r.val}</div>
                            </div>
                        ))}
                    </div>
                )}
                </>
            ) : (
                /* 재질 관리 탭 */
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    <p style={{ color:'#6b7280', fontSize:11 }}>재질 추가/수정/삭제 – 브라우저 로컬 저장</p>
                    {materials.map(m => (
                        <div key={m.id} style={{ display:'flex', alignItems:'center', gap:8, background:'#1f2937', borderRadius:12, padding:'8px 12px', border:'1px solid #374151' }}>
                            {editMat?.id === m.id ? (
                                <>
                                    <input value={editMat.name} onChange={e => setEditMat(p => ({...p, name:e.target.value}))} style={{...inputStyle, flex:1, padding:'4px 8px'}}/>
                                    <input type="number" step="0.01" value={editMat.density} onChange={e => setEditMat(p => ({...p, density:e.target.value}))} style={{...inputStyle, width:70, padding:'4px 8px'}}/>
                                    <span style={{color:'#6b7280',fontSize:11}}>g/cm³</span>
                                    <button onClick={() => { setMaterials(prev => prev.map(x => x.id===m.id ? {...editMat, density:parseFloat(editMat.density)} : x)); setEditMat(null); }} style={iconBtn('#34d399')}><Check size={14}/></button>
                                    <button onClick={() => setEditMat(null)} style={iconBtn('#6b7280')}><X size={14}/></button>
                                </>
                            ) : (
                                <>
                                    <span style={{flex:1, color:'#fff', fontWeight:600, fontSize:13}}>{m.name}</span>
                                    <span style={{color:'#9ca3af', fontSize:12}}>{m.density} g/cm³</span>
                                    <button onClick={() => setEditMat({...m})} style={iconBtn('#60a5fa')}><Edit2 size={13}/></button>
                                    <button onClick={() => { setMaterials(prev => prev.filter(x => x.id!==m.id)); if(selMat?.id===m.id) setSelMat(null); }} style={iconBtn('#ef4444')}><Trash2 size={13}/></button>
                                </>
                            )}
                        </div>
                    ))}
                    {/* 신규 추가 */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(55,65,81,0.4)', borderRadius:12, padding:'10px 12px', border:'1px dashed #4b5563' }}>
                        <input value={newMat.name} onChange={e => setNewMat(p=>({...p,name:e.target.value}))} placeholder="재질명" style={{...inputStyle, flex:1, padding:'5px 8px'}}/>
                        <input type="number" step="0.01" value={newMat.density} onChange={e => setNewMat(p=>({...p,density:e.target.value}))} placeholder="비중" style={{...inputStyle, width:70, padding:'5px 8px'}}/>
                        <span style={{color:'#6b7280',fontSize:11,whiteSpace:'nowrap'}}>g/cm³</span>
                        <button onClick={() => {
                            if (!newMat.name || !newMat.density) return;
                            setMaterials(prev => [...prev, { id:Date.now(), name:newMat.name, density:parseFloat(newMat.density) }]);
                            setNewMat({name:'',density:''});
                        }} style={{ background:'#1d4ed8', border:'none', borderRadius:8, color:'#fff', fontWeight:700, fontSize:12, padding:'6px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, whiteSpace:'nowrap' }}>
                            <Plus size={12}/> 추가
                        </button>
                    </div>
                </div>
            )}
            </div>
        </div>
    );
};

// ─── 공통 스타일 ───────────────────────────────────────────────────────────────
const labelStyle  = { display:'block', color:'#9ca3af', fontSize:11, fontWeight:600, marginBottom:4 };
const inputStyle  = { width:'100%', background:'#111827', border:'1px solid #374151', borderRadius:8, color:'#fff', fontSize:13, padding:'8px 10px', outline:'none', boxSizing:'border-box' };
const selectStyle = { width:'100%', background:'#1f2937', border:'1px solid #374151', borderRadius:8, color:'#fff', fontSize:13, padding:'8px 10px', outline:'none' };
const iconBtn     = (color) => ({ background:'transparent', border:'none', color, cursor:'pointer', padding:'2px', display:'flex', alignItems:'center' });

const TabBtn = ({ label, active, onClick }) => (
    <button onClick={onClick} style={{
        padding:'5px 12px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontWeight:700,
        background: active ? '#1d4ed8' : 'transparent', color: active ? '#fff' : '#6b7280', transition:'all .15s'
    }}>{label}</button>
);

export default WeightCalculatorContent;
