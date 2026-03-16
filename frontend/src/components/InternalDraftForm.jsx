import React, { useState, useEffect } from 'react';
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

    const handleChange = (newData) => {
        if (isReadOnly) return;
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

    return (
        <Box className="a4-form-container" sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box className="idf-header" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box sx={{ flex: 1, pt: 2 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#333', mb: 1 }}>주식회사 디자인메카</Typography>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 'bold', letterSpacing: '10px', mt: 2 }}>
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
                        <td colSpan={3}>
                            <RadioGroup row value={draftType} onChange={(e) => handleChange({ draft_type: e.target.value })}>
                                <FormControlLabel value="GENERAL" control={<Radio size="small" />} label="일반기안" disabled={isReadOnly} />
                                <FormControlLabel value="PAYMENT" control={<Radio size="small" />} label="대금지급기안" disabled={isReadOnly} />
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
                    <Table size="small" className="responsive-table flex-table" sx={{ mb: 1, borderCollapse: 'collapse', '& td, & th': { border: '1px solid #000', p: 0.8, fontSize: '12px', textAlign: 'center', height: 'auto !important' } }}>
                        <thead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                <th style={{ width: '40px' }}>순번</th>
                                <th>품명/항목</th>
                                <th style={{ width: '15%' }}>규격</th>
                                <th style={{ width: '60px' }}>단위</th>
                                <th style={{ width: '60px' }}>수량</th>
                                <th style={{ width: '100px' }}>단가</th>
                                <th style={{ width: '120px' }}>금액</th>
                                <th>비고</th>
                                {!isReadOnly && <th className="idf-no-print" style={{ width: '40px' }}></th>}
                            </TableRow>
                        </thead>
                        <TableBody>
                            {items.map((item, idx) => (
                                <TableRow key={idx}>
                                    <td>{idx + 1}</td>
                                    <td><input value={item.name} onChange={(e) => handleItemChange(idx, 'name', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    <td><input value={item.spec} onChange={(e) => handleItemChange(idx, 'spec', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    <td><input value={item.unit} onChange={(e) => handleItemChange(idx, 'unit', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    <td><input type="number" value={item.quantity} onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    <td><input type="number" value={item.unit_price} onChange={(e) => handleItemChange(idx, 'unit_price', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    <td style={{ textAlign: 'right', paddingRight: '10px' }}>{ (item.amount || 0).toLocaleString() }</td>
                                    <td><input value={item.remarks} onChange={(e) => handleItemChange(idx, 'remarks', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    {!isReadOnly && (
                                        <td className="idf-no-print">
                                            <IconButton size="small" color="error" onClick={() => removeItem(idx)}><Trash2 size={14} /></IconButton>
                                        </td>
                                    )}
                                </TableRow>
                            ))}
                            <TableRow sx={{ bgcolor: '#fffde7', fontWeight: 'bold' }}>
                                <td colSpan={6} style={{ textAlign: 'center' }}>합 계</td>
                                <td style={{ textAlign: 'right', paddingRight: '10px' }}>{ totalAmount.toLocaleString() }</td>
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
                @media (max-width: 768px) {
                    .a4-form-container { padding: 0 !important; }
                    .idf-header { flex-direction: column !important; align-items: center !important; gap: 20px; }
                    .responsive-table, .responsive-table table { border: none !important; display: block !important; }
                    .responsive-table tr { display: flex !important; flex-direction: column !important; border-bottom: 1px solid #eee !important; padding: 10px 0 !important; }
                    .responsive-table td, .responsive-table th { border: none !important; width: 100% !important; text-align: left !important; display: block !important; p: 5px 0 !important; }
                    .flex-table thead { display: none !important; }
                    .flex-table tr { border: 1px solid #ddd !important; border-radius: 8px !important; margin-bottom: 15px !important; padding: 15px !important; }
                    .flex-table td { display: flex !important; justify-content: space-between !important; align-items: center !important; padding: 5px 0 !important; }
                    .flex-table td::before { content: attr(data-label); font-weight: bold; margin-right: 10px; }
                    textarea, input { font-size: 16px !important; } /* Mobile zoom prevention */
                }
            `}</style>
        </Box>
    );
};

export default InternalDraftForm;
