import React from 'react';
import { Box, Typography, Table, TableBody, TableRow, TableCell, RadioGroup, FormControlLabel, Radio, Select, MenuItem, FormControl } from '@mui/material';
import ApprovalGrid from './ApprovalGrid';

const EarlyLeaveForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    const handleChange = (field, value) => {
        if (isReadOnly || typeof onChange !== 'function') return;
        
        const newData = { ...data, [field]: value };
        
        // 조퇴 선택 시 종료 시간 null 처리 (Bug #3 대응)
        if (field === 'leave_type' && value === '조퇴') {
            newData.return_time = null;
        }
        
        onChange(newData);
    };

    return (
        <Box className="a4-form-container print-safe-area" sx={{ width: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box sx={{ flex: 1, pt: 4 }}>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 'bold', letterSpacing: '5px' }}>
                        조퇴 · 외출원
                    </Typography>
                </Box>
                <ApprovalGrid documentData={documentData} currentUser={currentUser} docType="EARLY_LEAVE" />
            </Box>

            <Table size="small" sx={{ mb: 3, '& td': { border: '1px solid #000', p: 1.5, fontSize: '14px' } }}>
                <TableBody>
                    <TableRow sx={{ height: '50px' }}>
                        <Box component="td" sx={{ width: '100px', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>소 속</Box>
                        <td style={{ width: '200px' }}>
                            <input 
                                value={data.dept || ''} 
                                onChange={(e) => handleChange('dept', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none' }}
                            />
                        </td>
                        <Box component="td" sx={{ width: '100px', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>사원번호</Box>
                        <td colSpan={2}>
                            <input 
                                value={data.staff_no || ''} 
                                onChange={(e) => handleChange('staff_no', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none' }}
                            />
                        </td>
                    </TableRow>
                    <TableRow sx={{ height: '50px' }}>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>직 위</Box>
                        <td>
                            <input 
                                value={data.role || (documentData?.author?.role || currentUser?.role || '')} 
                                onChange={(e) => handleChange('role', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none' }}
                            />
                        </td>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>성 명</Box>
                        <td colSpan={2} style={{ textAlign: 'center' }}>
                            {documentData?.author?.name || currentUser?.name}
                        </td>
                    </TableRow>
                    <TableRow sx={{ height: '60px' }}>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>구 분</Box>
                        <td colSpan={4}>
                            <RadioGroup 
                                row 
                                value={data.leave_type || '조퇴'} 
                                onChange={(e) => handleChange('leave_type', e.target.value)}
                            >
                                <FormControlLabel value="조퇴" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>조퇴</Typography>} disabled={isReadOnly} />
                                <FormControlLabel value="외출" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>외출</Typography>} disabled={isReadOnly} />
                            </RadioGroup>
                        </td>
                    </TableRow>
                    <TableRow sx={{ height: '60px' }}>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>시 기</Box>
                        <td colSpan={4}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <input 
                                    type="date" 
                                    value={data.date || new Date().toISOString().split('T')[0]} 
                                    onChange={(e) => handleChange('date', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                />
                                <input 
                                    type="time" 
                                    value={data.leave_time || ''} 
                                    onChange={(e) => handleChange('leave_time', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                />
                                {data.leave_type !== '조퇴' && (
                                    <>
                                        <Typography>~</Typography>
                                        <input 
                                            type="time" 
                                            value={data.return_time || ''} 
                                            onChange={(e) => handleChange('return_time', e.target.value)}
                                            readOnly={isReadOnly}
                                            style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                        />
                                    </>
                                )}
                            </Box>
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>사 유</Box>
                        <td colSpan={4} style={{ height: '200px', verticalAlign: 'top' }}>
                            <textarea 
                                value={data.leave_reason || ''} 
                                onChange={(e) => handleChange('leave_reason', e.target.value)}
                                readOnly={isReadOnly}
                                rows={8}
                                style={{ border: 'none', width: '100%', height: '100%', outline: 'none', resize: 'none', fontFamily: 'inherit', padding: '10px' }}
                            />
                        </td>
                    </TableRow>
                </TableBody>
            </Table>

            <Box sx={{ mt: 4, textAlign: 'center' }}>
                <Typography sx={{ mb: 4, fontSize: '15px' }}>
                    상기 사유와 같이 조퇴 · 외출원을 제출하오니 허가하여 주시기 바랍니다.
                </Typography>
                
                <Typography sx={{ mb: 6 }}>
                    20&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;년&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;월&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;일
                </Typography>
                
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mb: 4 }}>
                    <Typography sx={{ fontWeight: 'bold' }}>신청인 :</Typography>
                    <Typography sx={{ borderBottom: '1px solid #000', minWidth: '100px', textAlign: 'center' }}>
                        {documentData?.author?.name || currentUser?.name}
                    </Typography>
                    <Typography>(인)</Typography>
                </Box>
            </Box>

            <Typography align="center" variant="h6" sx={{ mt: 'auto', mb: 2, fontWeight: 'bold' }}>
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
                }
            `}</style>
        </Box>
    );
};

export default EarlyLeaveForm;
