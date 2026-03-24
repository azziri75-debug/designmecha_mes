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

    // --- Column Resizing Logic ---
    const initialWidths = [40, 200, 100, 60, 60, 100, 120, 200];
    const [colWidths, setColWidths] = useState(data.colWidths || initialWidths);
    const resizingRef = useRef({ index: -1, startX: 0, startWidth: 0 });

    const handleMouseDown = (e, index) => {
        if (isReadOnly) return;
        resizingRef.current = {
            index,
            startX: e.pageX,
            startWidth: colWidths[index]
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
    };

    const handleMouseMove = (e) => {
        const { index, startX, startWidth } = resizingRef.current;
        if (index === -1) return;

        const delta = e.pageX - startX;
        const newWidths = [...colWidths];
        const minWidth = 30;
        
        // [Fix] Zero-sum resizing to keep total width at 100%
        // Only adjust if it's not the last column (or if we want to allow the last one to grow/shrink against the previous)
        if (index < newWidths.length - 1) {
            const nextStartWidth = colWidths[index + 1];
            
            // Calculate new current width
            const currentNewWidth = Math.max(minWidth, startWidth + delta);
            const actualDelta = currentNewWidth - startWidth;
            
            // Calculate corresponding next width (stolen from/given to the next column)
            const nextNewWidth = Math.max(minWidth, nextStartWidth - actualDelta);
            
            // Final adjustments based on minWidth constraints
            const finalDelta = nextStartWidth - nextNewWidth;
            
            newWidths[index] = startWidth + finalDelta;
            newWidths[index + 1] = nextNewWidth;
        } else {
            // If it's the last column, we can either block it or steal from the previous one.
            // But usually, adjusting the border between index and index+1 is the standard.
            // For the last column's right border, we don't have a next one, so we just let it resize (might cause overflow)
            // or we steal from the previous one. Let's steal from index - 1 for the last column's right edge.
            const prevStartWidth = colWidths[index - 1];
            const currentNewWidth = Math.max(minWidth, startWidth + delta);
            const actualDelta = currentNewWidth - startWidth;
            const prevNewWidth = Math.max(minWidth, prevStartWidth - actualDelta);
            const finalDelta = prevStartWidth - prevNewWidth;

            newWidths[index] = startWidth + finalDelta;
            newWidths[index - 1] = prevNewWidth;
        }
        
        setColWidths(newWidths);
    };

    const handleMouseUp = () => {
        const { index } = resizingRef.current;
        if (index !== -1) {
            // Save to parent data if needed, but keeping it local for smoothness is better unless we want persistence
            // handleChange({ colWidths }); // Uncomment if persistence is required
        }
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
        <Box className="a4-form-container print-safe-area" sx={{ width: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'white' }}>
            <Box className="idf-header" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box sx={{ flex: 1, pt: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#333', mb: 1 }}>주식회사 디자인메카</Typography>
                    <Typography variant="h4" align="center" sx={{ 
                        fontWeight: 'bold', 
                        letterSpacing: { xs: '2px', md: '10px' }, 
                        mt: 2,
                        fontSize: { xs: '24px', md: '34px' } // Prominent Title
                    }}>
                        내 부 기 안
                    </Typography>
                </Box>
                <ApprovalGrid documentData={documentData} currentUser={currentUser} />
            </Box>

            <Table size="small" className="responsive-table" sx={{ mb: 3, '& td, & th': { border: '1px solid #000', p: 1, fontSize: '13px', height: 'auto !important' } }}>
                <TableBody>
                    <TableRow>
                        <Box component="td" sx={{ width: '15%', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>문서제목</Box>
                        <td colSpan={3}>
                            <input 
                                value={data.title || ''} 
                                onChange={(e) => handleChange({ title: e.target.value })}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none', fontWeight: 'bold', fontSize: '15px' }}
                                placeholder="기안 제목을 입력하세요"
                            />
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
                    <Table size="small" className="resizable-table" sx={{ mb: 1, tableLayout: 'fixed', width: '100%', borderCollapse: 'collapse', '& td, & th': { border: '1px solid #000', p: 0.8, fontSize: '12px', textAlign: 'center', height: 'auto !important', position: 'relative', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }}>
                        <colgroup>
                            {colWidths.map((w, i) => (
                                <col key={i} style={{ width: `${w}px` }} />
                            ))}
                            {!isReadOnly && <col style={{ width: '40px' }} />}
                        </colgroup>
                        <thead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                <th style={{ width: colWidths[0] }}>순번 <Resizer index={0} /></th>
                                <th style={{ width: colWidths[1] }}>품명/항목 <Resizer index={1} /></th>
                                <th style={{ width: colWidths[2] }}>규격 <Resizer index={2} /></th>
                                <th style={{ width: colWidths[3] }}>단위 <Resizer index={3} /></th>
                                <th style={{ width: colWidths[4] }}>수량 <Resizer index={4} /></th>
                                <th style={{ width: colWidths[5] }}>단가 <Resizer index={5} /></th>
                                <th style={{ width: colWidths[6] }}>금액 <Resizer index={6} /></th>
                                <th style={{ width: colWidths[7] }}>비고 <Resizer index={7} /></th>
                                {!isReadOnly && <th className="idf-no-print" style={{ width: '40px' }}></th>}
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
                                    <td data-label="금액" style={{ textAlign: 'right', paddingRight: '10px' }}>
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
                                <td style={{ textAlign: 'right', paddingRight: '10px' }}>
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

            <Typography align="center" sx={{ mt: 'auto', pt: 6, fontWeight: 'bold', fontSize: '24px', letterSpacing: '5px' }}>
                (주)디자인메카
            </Typography>

            <style>{`
                @media screen and (max-width: 768px) {
                    .a4-form-container { padding: 0 !important; }
                    .idf-header { flex-direction: column !important; align-items: center !important; gap: 20px; }
                    .responsive-table, .responsive-table table { border: none !important; display: block !important; }
                    .responsive-table tr { display: flex !important; flex-direction: column !important; border-bottom: 1px solid #eee !important; padding: 10px 0 !important; }
                    .responsive-table td, .responsive-table th { border: none !important; width: 100% !important; text-align: left !important; display: block !important; padding: 5px 0 !important; }
                    .flex-table thead { display: none !important; }
                    .flex-table tr { border: 1px solid #ddd !important; border-radius: 8px !important; margin-bottom: 15px !important; padding: 15px !important; }
                    .flex-table td { display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 5px 0 !important; }
                    .flex-table td::before { content: attr(data-label); font-weight: bold; margin-right: 10px; }
                    textarea, input { font-size: 16px !important; } 
                    .col-resizer:hover { background-color: #2196f3; width: 4px !important; }
                }
                @media screen {
                    .col-resizer:hover { background-color: #2196f3; width: 4px !important; }
                }
            `}</style>
        </Box>
    );
};

export default InternalDraftForm;
