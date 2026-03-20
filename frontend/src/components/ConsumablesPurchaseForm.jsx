import React from 'react';
import { Box, Typography, Table, TableBody, TableRow, TableCell, TextField, IconButton, Button, Checkbox, FormControlLabel } from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import ApprovalGrid from './ApprovalGrid';

const ConsumablesPurchaseForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    const items = data.items || [{ product_name: '', manufacturer: '', spec: '', unit: 'EA', quantity: 1, remarks: '' }];
    
    const handleChange = (newData) => {
        if (isReadOnly || typeof onChange !== 'function') return;
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
        <Box className="a4-form-container print-safe-area" sx={{ width: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'white' }}>
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
                                value={data.request_date || new Date().toISOString().split('T')[0]} 
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

            {/* Items Section - Responsive (Table for Desktop, Cards for Mobile) */}
            <Box sx={{ display: { xs: 'none', md: 'block' } }}>
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
            </Box>

            {/* Mobile Card List (Visible only on xs) */}
            <Box sx={{ display: { xs: 'flex', md: 'none' }, flexDirection: 'column', gap: 2, mb: 2 }}>
                {items.map((item, idx) => (
                    <Box key={idx} sx={{ p: 2, border: '1px solid #ddd', borderRadius: '8px', position: 'relative', bgcolor: '#f9f9f9' }}>
                        <Typography sx={{ fontSize: '12px', fontWeight: 'bold', mb: 1, color: '#666' }}>항목 {idx + 1}</Typography>
                        {!isReadOnly && (
                            <IconButton 
                                size="small" 
                                color="error" 
                                onClick={() => removeItem(idx)}
                                sx={{ position: 'absolute', top: 8, right: 8 }}
                            >
                                <Trash2 size={16} />
                            </IconButton>
                        )}
                        <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                            <Box sx={{ gridColumn: 'span 2' }}>
                                <Typography sx={{ fontSize: '11px', color: '#999', mb: 0.5 }}>품명 (용도)</Typography>
                                <TextField 
                                    fullWidth size="small" variant="outlined" value={item.product_name} 
                                    onChange={(e) => handleItemChange(idx, 'product_name', e.target.value)} 
                                    inputProps={{ readOnly: isReadOnly, style: { fontSize: '14px', padding: '8px' } }}
                                />
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: '11px', color: '#999', mb: 0.5 }}>제조사</Typography>
                                <TextField 
                                    fullWidth size="small" variant="outlined" value={item.manufacturer || ''} 
                                    onChange={(e) => handleItemChange(idx, 'manufacturer', e.target.value)} 
                                    inputProps={{ readOnly: isReadOnly, style: { fontSize: '14px', padding: '8px' } }}
                                />
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: '11px', color: '#999', mb: 0.5 }}>규격</Typography>
                                <TextField 
                                    fullWidth size="small" variant="outlined" value={item.spec || ''} 
                                    onChange={(e) => handleItemChange(idx, 'spec', e.target.value)} 
                                    inputProps={{ readOnly: isReadOnly, style: { fontSize: '14px', padding: '8px' } }}
                                />
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: '11px', color: '#999', mb: 0.5 }}>단위</Typography>
                                <TextField 
                                    fullWidth size="small" variant="outlined" value={item.unit || 'EA'} 
                                    onChange={(e) => handleItemChange(idx, 'unit', e.target.value)} 
                                    inputProps={{ readOnly: isReadOnly, style: { fontSize: '14px', padding: '8px' } }}
                                />
                            </Box>
                            <Box>
                                <Typography sx={{ fontSize: '11px', color: '#999', mb: 0.5 }}>수량</Typography>
                                <TextField 
                                    fullWidth size="small" variant="outlined" type="number" value={item.quantity} 
                                    onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)} 
                                    inputProps={{ readOnly: isReadOnly, style: { fontSize: '14px', padding: '8px' } }}
                                />
                            </Box>
                            <Box sx={{ gridColumn: 'span 2' }}>
                                <Typography sx={{ fontSize: '11px', color: '#999', mb: 0.5 }}>비고 (청구자)</Typography>
                                <TextField 
                                    fullWidth size="small" variant="outlined" value={item.remarks || ''} 
                                    onChange={(e) => handleItemChange(idx, 'remarks', e.target.value)} 
                                    inputProps={{ readOnly: isReadOnly, style: { fontSize: '14px', padding: '8px' } }}
                                />
                            </Box>
                        </Box>
                    </Box>
                ))}
            </Box>
            
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
            <style>{`
                @media screen and (max-width: 768px) {
                    .idf-header { flex-direction: column !important; align-items: center !important; gap: 20px; }
                    .responsive-table, .responsive-table table, .responsive-table tbody, .responsive-table tr, .responsive-table td { 
                        display: block !important; width: 100% !important; border: none !important; 
                    }
                    .responsive-table tr { margin-bottom: 20px; border-bottom: 2px solid #ddd !important; padding-bottom: 10px; }
                    .responsive-table td { padding: 8px 0 !important; }
                    .responsive-table td[component="td"] { background-color: transparent !important; text-align: left !important; color: #666; font-size: 12px; font-weight: bold; }
                    input, textarea { font-size: 16px !important; border: 1px solid #eee !important; padding: 10px !important; border-radius: 4px; box-sizing: border-box; width: 100% !important; }
                    .cons-flex-table thead { display: none !important; }
                    .cons-flex-table tr { margin-bottom: 15px; border: 1px solid #eee !important; border-radius: 8px; padding: 10px !important; }
                }
            `}</style>
        </Box>
    );
};

export default ConsumablesPurchaseForm;
