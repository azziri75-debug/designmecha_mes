import React from 'react';
import { Box, Typography, Table, TableBody, TableRow, TableCell, TextField, IconButton, Button, Checkbox, FormControlLabel } from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import ApprovalGrid from './ApprovalGrid';

const ConsumablesPurchaseForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    const items = data.items || [{ product_name: '', manufacturer: '', spec: '', unit: 'EA', quantity: 1, remarks: '' }];
    
    const handleChange = (newData) => {
        if (isReadOnly) return;
        onChange({ ...data, ...newData });
    };

    const handleItemChange = (idx, field, value) => {
        const newItems = [...items];
        newItems[idx][field] = value;
        handleChange({ items: newItems });
    };

    const addItem = () => {
        handleChange({ items: [...items, { product_name: '', manufacturer: '', spec: '', unit: 'EA', quantity: 1, remarks: '' }] });
    };

    const removeItem = (idx) => {
        handleChange({ items: items.filter((_, i) => i !== idx) });
    };

    return (
        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box sx={{ flex: 1, pt: 4 }}>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 'bold', letterSpacing: '5px' }}>
                        소모품 구매 신청서
                    </Typography>
                </Box>
                <ApprovalGrid documentData={documentData} currentUser={currentUser} />
            </Box>

            <Table size="small" sx={{ mb: 2, '& td': { border: '1px solid #000', p: 1, fontSize: '13px' } }}>
                <TableBody>
                    <TableRow>
                        <Box component="td" sx={{ width: '15%', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>신청일자</Box>
                        <td style={{ width: '35%' }}>
                            <input 
                                type="date" 
                                value={data.request_date || ''} 
                                onChange={(e) => handleChange({ request_date: e.target.value })}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none' }}
                            />
                        </td>
                        <Box component="td" sx={{ width: '15%', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>신청부서</Box>
                        <td>
                            <input 
                                type="text" 
                                value={data.dept || ''} 
                                onChange={(e) => handleChange({ dept: e.target.value })}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none' }}
                            />
                        </td>
                    </TableRow>
                </TableBody>
            </Table>

            <Table size="small" sx={{ mb: 1, borderCollapse: 'collapse', '& td, & th': { border: '1px solid #000', p: 0.8, fontSize: '12px', textAlign: 'center' } }}>
                <thead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <th style={{ width: '40px' }}>순</th>
                        <th>품 명 (용 도)</th>
                        <th style={{ width: '15%' }}>제조사</th>
                        <th style={{ width: '15%' }}>규격</th>
                        <th style={{ width: '8%' }}>단위</th>
                        <th style={{ width: '8%' }}>수량</th>
                        <th>비고(청구자)</th>
                        {!isReadOnly && <th className="idf-no-print" style={{ width: '40px' }}></th>}
                    </TableRow>
                </thead>
                <TableBody>
                    {items.map((item, idx) => (
                        <TableRow key={idx}>
                            <td>{idx + 1}</td>
                            <td><input value={item.product_name} onChange={(e) => handleItemChange(idx, 'product_name', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                            <td><input value={item.manufacturer || ''} onChange={(e) => handleItemChange(idx, 'manufacturer', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                            <td><input value={item.spec || ''} onChange={(e) => handleItemChange(idx, 'spec', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                            <td><input value={item.unit || 'EA'} onChange={(e) => handleItemChange(idx, 'unit', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                            <td><input type="number" value={item.quantity} onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                            <td><input value={item.remarks || ''} onChange={(e) => handleItemChange(idx, 'remarks', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                            {!isReadOnly && (
                                <td className="idf-no-print">
                                    <IconButton size="small" color="error" onClick={() => removeItem(idx)}><Trash2 size={14} /></IconButton>
                                </td>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            
            {!isReadOnly && (
                <Box className="idf-no-print" sx={{ mb: 2 }}>
                    <Button size="small" startIcon={<Plus size={14} />} onClick={addItem}>항목 추가</Button>
                </Box>
            )}

            <Table size="small" sx={{ mb: 2, '& td': { border: '1px solid #000', p: 1, fontSize: '13px' } }}>
                <TableBody>
                    <TableRow>
                        <Box component="td" sx={{ width: '15%', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>특기사항</Box>
                        <td colSpan={3}>
                            <textarea 
                                value={data.special_notes || ''} 
                                onChange={(e) => handleChange({ special_notes: e.target.value })}
                                readOnly={isReadOnly}
                                rows={2}
                                style={{ border: 'none', width: '100%', outline: 'none', resize: 'none', fontFamily: 'inherit' }}
                            />
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>청 구 자</Box>
                        <td colSpan={3} style={{ textAlign: 'right', paddingRight: '100px' }}>
                            {documentData?.author?.name || currentUser?.name} (인)
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>예산확인</Box>
                        <td colSpan={3}>
                           <Box sx={{ display: 'flex', gap: 4 }}>
                               <FormControlLabel 
                                   control={<Checkbox size="small" checked={data.budget_type === 'NORMAL'} onChange={() => handleChange({ budget_type: 'NORMAL' })} disabled={isReadOnly} />} 
                                   label={<Typography sx={{ fontSize: '13px' }}>일반구매</Typography>} 
                               />
                               <FormControlLabel 
                                   control={<Checkbox size="small" checked={data.budget_type === 'RESEARCH'} onChange={() => handleChange({ budget_type: 'RESEARCH' })} disabled={isReadOnly} />} 
                                   label={<Typography sx={{ fontSize: '13px' }}>연구과제 구매</Typography>} 
                               />
                               <Box sx={{ display: 'flex', alignItems: 'center', flexGrow: 1 }}>
                                   <Typography sx={{ fontSize: '13px', mr: 1 }}>과제명/비고:</Typography>
                                   <input 
                                       type="text" 
                                       value={data.budget_note || ''} 
                                       onChange={(e) => handleChange({ budget_note: e.target.value })}
                                       readOnly={isReadOnly}
                                       style={{ border: 'none', borderBottom: '1px solid #ccc', flexGrow: 1, outline: 'none', fontSize: '13px' }}
                                   />
                               </Box>
                           </Box>
                        </td>
                    </TableRow>
                </TableBody>
            </Table>

            <Typography align="center" variant="subtitle1" sx={{ mt: 2, fontWeight: 'bold' }}>
                (주)디자인메카
            </Typography>
        </Box>
    );
};

export default ConsumablesPurchaseForm;
