import React, { useEffect, useState } from 'react';
import { Box, Typography, Table, TableBody, TableRow, TableCell, IconButton, Button } from '@mui/material';
import { Plus, Trash2 } from 'lucide-react';
import ApprovalGrid from './ApprovalGrid';

const ExpenseReportForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    const now = new Date();
    const today = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
    // Actual formatted date for underlying data should stay YYYY-MM-DD
    const rawToday = new Date().toISOString().split('T')[0];

    // Initialize items if they don't exist
    useEffect(() => {
        if (typeof onChange !== 'function') return;
        
        const updates = {};
        if (!data.items || data.items.length === 0) {
            updates.items = [{ acc_category: '', description: '', amount: '' }];
        }
        if (!data.draft_date) {
            updates.draft_date = rawToday;
        }
        if (!data.dept) {
            updates.dept = currentUser?.department || '';
        }
        if (!data.name) {
            updates.name = currentUser?.name || '';
        }

        if (Object.keys(updates).length > 0) {
            onChange({ ...data, ...updates });
        }
    }, [onChange, currentUser]);

    const handleChange = (field, value) => {
        if (isReadOnly || typeof onChange !== 'function') return;
        onChange({ ...data, [field]: value });
    };

    const handleItemChange = (index, field, value) => {
        if (isReadOnly || typeof onChange !== 'function') return;
        const newItems = [...(data.items || [])];
        newItems[index] = { ...newItems[index], [field]: value };
        
        // Calculate total
        const total = newItems.reduce((acc, curr) => acc + (parseInt(curr.amount) || 0), 0);
        onChange({ ...data, items: newItems, total_amount: total });
    };

    const addItem = () => {
        if (isReadOnly) return;
        const newItems = [...(data.items || []), { acc_category: '', description: '', amount: '' }];
        onChange({ ...data, items: newItems });
    };

    const removeItem = (index) => {
        if (isReadOnly) return;
        const newItems = (data.items || []).filter((_, i) => i !== index);
        const total = newItems.reduce((acc, curr) => acc + (parseInt(curr.amount) || 0), 0);
        onChange({ ...data, items: newItems, total_amount: total });
    };

    const formatAmount = (val) => {
        if (!val) return '';
        return parseInt(val).toLocaleString();
    };

    // Helper to render the digit-split amount grid
    const AmountGrid = ({ value }) => {
        const strVal = value?.toString() || '';
        const paddedVal = strVal.padStart(11, ' '); // 11 slots as per common analog forms
        return (
            <Box sx={{ display: 'flex', border: '1px solid #000', height: '100%', width: 'fit-content', ml: 'auto' }}>
                {paddedVal.split('').map((char, i) => (
                    <Box key={i} sx={{ 
                        width: '12px', 
                        height: '100%', 
                        borderRight: i === 10 ? 'none' : '1px solid #000',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        bgcolor: i >= 11 - strVal.length ? 'transparent' : '#fcfcfc'
                    }}>
                        {char}
                    </Box>
                ))}
            </Box>
        );
    };

    const totalAmount = data.total_amount || 0;

    return (
        <Box className="a4-form-container print-safe-area" sx={{ width: '100%', height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', p: 0, color: '#000', position: 'relative', bgcolor: 'white' }}>
            {/* Title */}
            <Typography variant="h4" align="center" sx={{ 
                fontWeight: 'bold', 
                mb: 2, 
                letterSpacing: { xs: '2px', md: '10px' },
                fontSize: { xs: '20px', md: '32px' } 
            }}>
                지 출 결 의 서
            </Typography>

            {/* Top Table Section */}
            <Box sx={{ 
                display: 'flex', 
                flexDirection: { xs: 'column', md: 'row' },
                justifyContent: 'space-between', 
                alignItems: 'flex-end',
                width: '100%',
                mb: 1.5 
            }}>
                {/* Left Info Table */}
                <Table size="small" sx={{ 
                    width: { xs: '100%', md: '340px' }, 
                    border: '2px solid #000', 
                    borderCollapse: 'collapse', 
                    '& td': { border: '1px solid #000', height: '28px', fontSize: '12px' } 
                }}>
                    <TableBody>
                        <TableRow>
                            <TableCell align="center" sx={{ bgcolor: '#f5f5f5', fontWeight: 'bold', width: '100px' }}>작 성 일</TableCell>
                            <TableCell sx={{ p: '0 8px !important' }}>
                                <input 
                                    type="date" 
                                    value={data.draft_date || rawToday} 
                                    onChange={(e) => handleChange('draft_date', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent', cursor: isReadOnly ? 'default' : 'pointer' }}
                                />
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell align="center" sx={{ bgcolor: '#f5f5f5', fontWeight: 'bold' }}>작성부서</TableCell>
                            <TableCell sx={{ p: '0 8px !important' }}>
                                <input 
                                    type="text" 
                                    value={data.dept || ''} 
                                    onChange={(e) => handleChange('dept', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent' }}
                                />
                            </TableCell>
                        </TableRow>
                        <TableRow>
                            <TableCell align="center" sx={{ bgcolor: '#f5f5f5', fontWeight: 'bold' }}>작 성 자</TableCell>
                            <TableCell sx={{ p: '0 8px !important' }}>
                                <input 
                                    type="text" 
                                    value={data.name || ''} 
                                    onChange={(e) => handleChange('name', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent' }}
                                />
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>

                {/* Right Approval Grid */}
                <Box sx={{ 
                    display: 'flex', 
                    alignItems: 'flex-start',
                    justifyContent: { xs: 'center', md: 'flex-end' } 
                }}>
                    <Box sx={{ 
                        border: '2px solid #000', 
                        borderRight: 'none',
                        width: '25px', 
                        height: '100%', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        bgcolor: '#f5f5f5',
                        fontWeight: 'bold',
                        fontSize: '11px',
                        textAlign: 'center',
                        minHeight: { xs: '60px', md: '128px' }
                    }}>
                        결<br/>재
                    </Box>
                    <ApprovalGrid documentData={documentData} currentUser={currentUser} docType="EXPENSE_REPORT" />
                </Box>
            </Box>

            {/* Middle Main Info */}
            <Table size="small" sx={{ mb: 2, border: '2px solid #000', borderCollapse: 'collapse', '& td': { border: '1px solid #000', height: '35px', fontSize: '13px' } }}>
                <TableBody>
                    <TableRow>
                        <TableCell align="center" sx={{ width: '100px', bgcolor: '#f5f5f5', fontWeight: 'bold' }}>내 역</TableCell>
                        <TableCell sx={{ p: '0 10px !important' }}>
                            <input 
                                type="text" 
                                value={data.summary || ''} 
                                onChange={(e) => handleChange('summary', e.target.value)}
                                readOnly={isReadOnly}
                                placeholder="지출 총괄 내역을 입력하세요"
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent', fontWeight: 'bold' }}
                            />
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="center" sx={{ bgcolor: '#f5f5f5', fontWeight: 'bold' }}>금 액</TableCell>
                        <TableCell sx={{ p: '0 10px !important' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                    <span style={{ marginRight: '10px' }}>￦</span>
                                    <input 
                                        type="text" 
                                        value={formatAmount(totalAmount)} 
                                        readOnly
                                        style={{ border: 'none', width: '150px', outline: 'none', background: 'transparent', fontStyle: 'italic', fontWeight: 'bold' }}
                                    />
                                    <span style={{ marginLeft: '5px' }}>원정</span>
                                </Box>
                                <Typography sx={{ fontSize: '10px', color: '#666' }}>(위 금액을 결제하여 주시기 바랍니다.)</Typography>
                            </Box>
                        </TableCell>
                    </TableRow>
                    <TableRow>
                        <TableCell align="center" sx={{ bgcolor: '#f5f5f5', fontWeight: 'bold' }}>지급기한</TableCell>
                        <TableCell sx={{ p: '0 10px !important' }}>
                            <input 
                                type="text" 
                                value={data.due_date || ''} 
                                onChange={(e) => handleChange('due_date', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent' }}
                            />
                        </TableCell>
                    </TableRow>
                </TableBody>
            </Table>

            {/* Bottom Dynamic Items Table */}
            <Table size="small" sx={{ border: '2px solid #000', borderCollapse: 'collapse', '& th': { border: '1px solid #000', bgcolor: '#f5f5f5', fontWeight: 'bold', fontSize: '12px', height: '30px' }, '& td': { border: '1px solid #000', fontSize: '11px', p: 0, height: '32px' } }}>
                <thead>
                    <tr>
                        <th style={{ width: '100px' }}>회 계</th>
                        <th style={{ minWidth: '300px' }}>적 요</th>
                        <th style={{ width: '180px' }}>금 액</th>
                        {!isReadOnly && <th style={{ width: '40px' }} className="no-print"></th>}
                    </tr>
                </thead>
                <TableBody>
                    {(data.items || []).map((item, idx) => (
                        <TableRow key={idx} className="stack-row">
                            <td data-label="회계">
                                <input 
                                    type="text" 
                                    value={item.acc_category || ''} 
                                    onChange={(e) => handleItemChange(idx, 'acc_category', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', width: '100%', height: '100%', outline: 'none', textAlign: 'center', padding: '0 5px' }}
                                />
                            </td>
                            <td data-label="적요">
                                <input 
                                    type="text" 
                                    value={item.description || ''} 
                                    onChange={(e) => handleItemChange(idx, 'description', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', width: '100%', height: '100%', outline: 'none', padding: '0 10px' }}
                                />
                            </td>
                            <td data-label="금액">
                                <Box sx={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center' }}>
                                    {!isReadOnly ? (
                                        <input 
                                            type="number" 
                                            value={item.amount || ''} 
                                            onChange={(e) => handleItemChange(idx, 'amount', e.target.value)}
                                            style={{ border: 'none', width: '100%', height: '100%', outline: 'none', textAlign: 'right', padding: '0 8px', fontSize: '12px' }}
                                        />
                                    ) : (
                                        <AmountGrid value={item.amount} />
                                    )}
                                </Box>
                            </td>
                            {!isReadOnly && (
                                <TableCell align="center" className="no-print" data-label="관리">
                                    <IconButton size="small" onClick={() => removeItem(idx)} color="error">
                                        <Trash2 size={14} />
                                    </IconButton>
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                    {/* Sum Row */}
                    <TableRow>
                        <TableCell colSpan={2} align="center" sx={{ bgcolor: '#fcfcfc', fontWeight: 'bold', letterSpacing: '20px' }}>합 계</TableCell>
                        <TableCell>
                            <AmountGrid value={totalAmount} />
                        </TableCell>
                        {!isReadOnly && <TableCell className="no-print"></TableCell>}
                    </TableRow>
                </TableBody>
            </Table>

            {!isReadOnly && (
                <Button 
                    startIcon={<Plus size={16} />} 
                    onClick={addItem} 
                    sx={{ mt: 1, color: '#666', fontSize: '11px' }}
                    className="no-print"
                >
                    내역 추가
                </Button>
            )}

            <Box sx={{ flex: 1 }} />

            {/* Bottom Signature */}
            <Box sx={{ mt: 'auto', pt: 6, pb: 2, textAlign: 'center' }}>
                <Typography sx={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '5px' }}>
                    (주)디자인메카
                </Typography>
            </Box>

            <style>{`
                input::placeholder { color: #ccc; font-weight: normal; }
                @media screen and (max-width: 768px) {
                    .stack-row { display: flex !important; flex-direction: column !important; border: 1px solid #ddd !important; border-radius: 8px !important; margin-bottom: 15px !important; padding: 10px !important; }
                    .stack-row td { display: flex !important; justify-content: space-between !important; align-items: center !important; border: none !important; width: 100% !important; padding: 5px 0 !important; }
                    .stack-row td::before { content: attr(data-label); font-weight: bold; margin-right: 10px; color: #666; font-size: 11px; }
                    thead { display: none !important; }
                }
            `}</style>
        </Box>
    );
};

export default ExpenseReportForm;
