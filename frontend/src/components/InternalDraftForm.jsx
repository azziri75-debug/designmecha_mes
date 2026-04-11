import React, { useState, useEffect, useRef } from 'react';
import { 
    Box, Typography, Table, TableBody, TableRow, TableCell, 
    TextField, RadioGroup, FormControlLabel, Radio, IconButton, Button 
} from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import ApprovalGrid from './ApprovalGrid';

const InternalDraftForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    // Default to Internal Draft type if not set
    const draftType = data.draft_type || 'GENERAL';
    const items = data.items || [{ name: '', spec: '', unit: '', quantity: '', unit_price: '', amount: '', remarks: '' }];

    // Parse [거래처]-제목 format when opening existing PAYMENT documents
    useEffect(() => {
        if (draftType === 'PAYMENT' && data.title && !data.partner_for_title && !data.title_body) {
            const match = data.title.match(/^\[(.+?)\]-(.*)$/);
            if (match) {
                onChange({ ...data, partner_for_title: match[1], title_body: match[2] });
            }
        }
    }, [data.title, draftType]);


    // --- Column Resizing Logic (Percentage-based to always fit container) ---
    // Percentages sum to 100 (excluding the optional delete-button column)
    const initialPcts = data.colPcts || [5, 22, 11, 7, 7, 11, 14, 23]; // sum = 100
    const [colPcts, setColPcts] = useState(initialPcts);
    // Tracks resizing in pixel space, converts delta to % on mouse move
    const resizingRef = useRef({ index: -1, startX: 0, startPct: 0, nextStartPct: 0, containerWidth: 0 });

    const handleMouseDown = (e, index, containerRef) => {
        if (isReadOnly) return;
        // Get the actual pixel width of the table container
        const container = e.target.closest('table') || document.body;
        const containerWidth = container.offsetWidth || 700;
        resizingRef.current = {
            index,
            startX: e.pageX,
            startPct: colPcts[index],
            nextStartPct: colPcts[index + 1] || 0,
            containerWidth,
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        e.preventDefault();
    };

    const handleMouseMove = (e) => {
        const { index, startX, startPct, nextStartPct, containerWidth } = resizingRef.current;
        if (index === -1) return;

        const deltaPixels = e.pageX - startX;
        const deltaPct = (deltaPixels / containerWidth) * 100;
        const minPct = 3; // minimum 3%

        if (index < colPcts.length - 1) {
            // Zero-sum: grow current, shrink next
            const newCurrent = Math.max(minPct, startPct + deltaPct);
            const actualDelta = newCurrent - startPct;
            const newNext = Math.max(minPct, nextStartPct - actualDelta);
            const finalDelta = nextStartPct - newNext;

            const newPcts = [...colPcts];
            newPcts[index] = startPct + finalDelta;
            newPcts[index + 1] = newNext;
            setColPcts(newPcts);
        }
    };

    const handleMouseUp = () => {
        resizingRef.current.index = -1;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'default';
    };

    const handleChange = (newData) => {
        if (isReadOnly || typeof onChange !== 'function') return;
        onChange({ ...data, ...newData });
    };

    const handleItemChange = (idx, field, value) => {
        const newItems = [...items];
        newItems[idx][field] = value;
        
        // Auto calculation for amount
        if (field === 'quantity' || field === 'unit_price') {
            const q = parseFloat(newItems[idx].quantity) || 0;
            const p = parseFloat(newItems[idx].unit_price) || 0;
            newItems[idx].amount = q * p;
        }
        
        handleChange({ items: newItems });
    };

    const addItem = () => {
        handleChange({ items: [...items, { name: '', spec: '', unit: '', quantity: '', unit_price: '', amount: '', remarks: '' }] });
    };

    const removeItem = (idx) => {
        handleChange({ items: items.filter((_, i) => i !== idx) });
    };

    // Calculate total amount
    const totalAmount = items.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

    // Resizer Component
    const Resizer = ({ index }) => (
        <div
            onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, index); }}
            style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: '5px',
                cursor: 'col-resize',
                zIndex: 1,
                userSelect: 'none'
            }}
            className="col-resizer idf-no-print"
        />
    );

    return (
        <Box className="a4-form-container print-safe-area" sx={{ width: '100%', height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'white' }}>
            <Box className="idf-header" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box sx={{ flex: 1, pt: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#333', mb: 1 }}>주식회사 디자인메카</Typography>
                    <Typography variant="h4" align="center" sx={{ 
                        fontWeight: 'bold', 
                        letterSpacing: { xs: '2px', md: '10px' }, 
                        mt: 2,
                        fontSize: { xs: '24px', md: '34px' }
                    }}>
                        내 부 기 안
                    </Typography>
                </Box>
                <ApprovalGrid documentData={documentData} currentUser={currentUser} docType="INTERNAL_DRAFT" />
            </Box>

            <Table size="small" className="responsive-table" sx={{ mb: 3, '& td, & th': { border: '1px solid #000', p: 1, fontSize: '13px', height: 'auto !important' } }}>
                <TableBody>
                    <TableRow>
                        <Box component="td" sx={{ width: '15%', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>문서제목</Box>
                        <td colSpan={3}>
                            {draftType === 'PAYMENT' ? (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0, width: '100%', overflow: 'hidden' }}>
                                    {/* 거래처 부분 — 고정 너비, 줄어들지 않음 */}
                                    <Box sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                                        <span style={{ fontWeight: 'bold', fontSize: '15px', whiteSpace: 'nowrap' }}>[</span>
                                        <input
                                            value={data.partner_for_title || ''}
                                            onChange={(e) => {
                                                const partner = e.target.value;
                                                const titlePart = data.title_body || '';
                                                handleChange({ partner_for_title: partner, title: partner && titlePart ? `[${partner}]-${titlePart}` : (partner ? `[${partner}]-` : titlePart) });
                                            }}
                                            readOnly={isReadOnly}
                                            style={{ border: 'none', outline: 'none', fontWeight: 'bold', fontSize: '15px', width: '120px' }}
                                            placeholder="거래처 입력"
                                        />
                                        <span style={{ fontWeight: 'bold', fontSize: '15px', whiteSpace: 'nowrap' }}>]-</span>
                                    </Box>
                                    {/* 기안제목 — 나머지 공간 차지 */}
                                    <input
                                        value={data.title_body || ''}
                                        onChange={(e) => {
                                            const titlePart = e.target.value;
                                            const partner = data.partner_for_title || '';
                                            handleChange({ title_body: titlePart, title: partner ? `[${partner}]-${titlePart}` : titlePart });
                                        }}
                                        readOnly={isReadOnly}
                                        style={{ border: 'none', flex: 1, minWidth: 0, outline: 'none', fontWeight: 'bold', fontSize: '15px' }}
                                        placeholder="기안 제목을 입력하세요"
                                    />
                                </Box>
                            ) : (
                                <input
                                    value={data.title || ''}
                                    onChange={(e) => handleChange({ title: e.target.value })}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', width: '100%', outline: 'none', fontWeight: 'bold', fontSize: '15px' }}
                                    placeholder="기안 제목을 입력하세요"
                                />
                            )}
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ width: '15%', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>기안부서</Box>
                        <td style={{ width: '35%' }}>
                            <input 
                                value={data.dept || ''} 
                                onChange={(e) => handleChange({ dept: e.target.value })}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none' }}
                                placeholder="작성 부서"
                            />
                        </td>
                        <Box component="td" sx={{ width: '15%', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>기안일자</Box>
                        <td>
                            <input 
                                type="date"
                                value={data.request_date || new Date().toISOString().split('T')[0]} 
                                onChange={(e) => handleChange({ request_date: e.target.value })}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none' }}
                            />
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>기안구분</Box>
                        <td>
                            <RadioGroup row value={draftType} onChange={(e) => handleChange({ draft_type: e.target.value })}>
                                <FormControlLabel value="GENERAL" control={<Radio size="small" />} label="일반기안" disabled={isReadOnly} />
                                <FormControlLabel value="PAYMENT" control={<Radio size="small" />} label="대금지급기안" disabled={isReadOnly} />
                            </RadioGroup>
                        </td>
                        <Box component="td" sx={{ width: '15%', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>통화단위</Box>
                        <td>
                            <RadioGroup 
                                row 
                                value={data.currency || 'KRW'} 
                                onChange={(e) => handleChange({ currency: e.target.value })}
                            >
                                <FormControlLabel value="KRW" control={<Radio size="small" />} label="KRW(₩)" disabled={isReadOnly || draftType !== 'PAYMENT'} />
                                <FormControlLabel value="USD" control={<Radio size="small" />} label="USD($)" disabled={isReadOnly || draftType !== 'PAYMENT'} />
                            </RadioGroup>
                        </td>
                    </TableRow>
                </TableBody>
            </Table>

            {draftType === 'GENERAL' ? (
                <Box sx={{ flex: 1 }}>
                    <Typography sx={{ mb: 1, fontWeight: 'bold', fontSize: '14px' }}>[기안 내용]</Typography>
                    <textarea 
                        value={data.reason || ''} 
                        onChange={(e) => handleChange({ reason: e.target.value })}
                        readOnly={isReadOnly}
                        rows={25}
                        placeholder="상세 내용을 입력하세요..."
                        style={{ border: '1px solid #eee', width: '100%', outline: 'none', padding: '15px', resize: 'none', fontSize: '14px', lineHeight: '1.6', fontFamily: 'inherit', height: 'auto', minHeight: '400px', overflow: 'visible' }}
                    />
                </Box>
            ) : (
                <Box sx={{ flex: 1 }}>
                    <Typography sx={{ mb: 1, fontWeight: 'bold', fontSize: '14px' }}>[지급 내역]</Typography>
                    {/* [Fix] Percentage-based column widths so table always fits within parent container */}
                    <Table
                        size="small"
                        className="resizable-table"
                        sx={{
                            mb: 1,
                            tableLayout: 'fixed',
                            width: '100%',
                            borderCollapse: 'collapse',
                            '& td, & th': {
                                border: '1px solid #000',
                                p: 0.8,
                                fontSize: '12px',
                                textAlign: 'center',
                                height: 'auto !important',
                                position: 'relative',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                            }
                        }}
                    >
                        <colgroup>
                            {colPcts.map((pct, i) => (
                                <col key={i} style={{ width: `${pct}%` }} />
                            ))}
                            {!isReadOnly && <col style={{ width: '32px' }} />}
                        </colgroup>
                        <thead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                <th>순번 <Resizer index={0} /></th>
                                <th>품명/항목 <Resizer index={1} /></th>
                                <th>규격 <Resizer index={2} /></th>
                                <th>단위 <Resizer index={3} /></th>
                                <th>수량 <Resizer index={4} /></th>
                                <th>단가 <Resizer index={5} /></th>
                                <th>금액 <Resizer index={6} /></th>
                                <th>비고 <Resizer index={7} /></th>
                                {!isReadOnly && <th className="idf-no-print"></th>}
                            </TableRow>
                        </thead>
                        <TableBody>
                            {items.map((item, idx) => (
                                <TableRow key={idx}>
                                    <td data-label="순번">{idx + 1}</td>
                                    <td data-label="품명/항목"><input value={item.name} onChange={(e) => handleItemChange(idx, 'name', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    <td data-label="규격"><input value={item.spec} onChange={(e) => handleItemChange(idx, 'spec', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    <td data-label="단위"><input value={item.unit} onChange={(e) => handleItemChange(idx, 'unit', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    <td data-label="수량"><input type="number" value={item.quantity} onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    <td data-label="단가"><input type="number" value={item.unit_price} onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    <td data-label="금액" style={{ textAlign: 'right', paddingRight: '8px' }}>
                                        { data.currency === 'USD' ? '$ ' : '₩ ' }{ (item.amount || 0).toLocaleString(undefined, { minimumFractionDigits: data.currency === 'USD' ? 2 : 0 }) }
                                    </td>
                                    <td data-label="비고"><input value={item.remarks} onChange={(e) => handleItemChange(idx, 'remarks', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    {!isReadOnly && (
                                        <td className="idf-no-print">
                                            <IconButton size="small" color="error" onClick={() => removeItem(idx)}><Trash2 size={14} /></IconButton>
                                        </td>
                                    )}
                                </TableRow>
                            ))}
                            <TableRow sx={{ bgcolor: '#fffde7', fontWeight: 'bold' }}>
                                <td colSpan={6} style={{ textAlign: 'center' }}>합 계</td>
                                <td style={{ textAlign: 'right', paddingRight: '8px' }}>
                                    { data.currency === 'USD' ? '$ ' : '₩ ' }{ totalAmount.toLocaleString(undefined, { minimumFractionDigits: data.currency === 'USD' ? 2 : 0 }) }
                                </td>
                                <td></td>
                                {!isReadOnly && <td className="idf-no-print"></td>}
                            </TableRow>
                        </TableBody>
                    </Table>
                    {!isReadOnly && (
                        <Box className="idf-no-print" sx={{ mb: 2 }}>
                            <Button size="small" startIcon={<Plus size={14} />} onClick={addItem}>항목 추가</Button>
                        </Box>
                    )}
                    <Typography sx={{ mt: 3, mb: 1, fontWeight: 'bold', fontSize: '14px' }}>[지급 사유]</Typography>
                    <textarea 
                        value={data.reason || ''} 
                        onChange={(e) => handleChange({ reason: e.target.value })}
                        readOnly={isReadOnly}
                        rows={10}
                        placeholder="지급 사유를 입력하세요..."
                        style={{ border: '1px solid #eee', width: '100%', outline: 'none', padding: '15px', resize: 'none', fontSize: '14px', lineHeight: '1.6', fontFamily: 'inherit', height: 'auto', minHeight: '200px', overflow: 'visible' }}
                    />
                </Box>
            )}

            <Box sx={{ flex: 1 }} />

            <Typography align="center" sx={{ mt: 'auto', pt: 6, pb: 2, fontWeight: 'bold', fontSize: '24px', letterSpacing: '5px' }}>
                (주)디자인메카
            </Typography>

            <style>{`
                @media screen {
                    .col-resizer:hover { background-color: #2196f3; width: 4px !important; }
                }
                @media print {
                    .idf-no-print { display: none !important; }
                }
            `}</style>
        </Box>
    );
};

export default InternalDraftForm;
