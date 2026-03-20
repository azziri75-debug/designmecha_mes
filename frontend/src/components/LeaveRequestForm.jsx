import React from 'react';
import { Box, Typography, Table, TableBody, TableRow, TableCell, RadioGroup, FormControlLabel, Radio, Checkbox, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import ApprovalGrid from './ApprovalGrid';

const LeaveRequestForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    const handleChange = (field, value) => {
        if (isReadOnly || typeof onChange !== 'function') return;
        
        const newData = { ...data, [field]: value };

        // 반차 선택 시 시간 자동 계산 (Bug #1 대응)
        if (field === 'half_day_type') {
            if (value === '오전') {
                newData.half_day_start = '09:00';
                newData.half_day_end = '13:00';
            } else if (value === '오후') {
                newData.half_day_start = '14:00';
                newData.half_day_end = '18:00';
            }
        }

        // 휴가구분 변경 시 초기화 로직
        if (field === 'vacation_type' && value !== '반차') {
            delete newData.half_day_type;
            delete newData.half_day_start;
            delete newData.half_day_end;
        }

        onChange(newData);
    };

    return (
        <Box className="a4-form-container print-safe-area" sx={{ width: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box sx={{ flex: 1, pt: 4 }}>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 'bold', letterSpacing: '15px' }}>
                        휴 가 원
                    </Typography>
                </Box>
                <ApprovalGrid documentData={documentData} currentUser={currentUser} />
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
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>휴가구분</Box>
                        <td colSpan={4}>
                            <FormControl fullWidth size="small" variant="outlined" sx={{ maxWidth: 300 }}>
                                <Select
                                    value={data.vacation_type || '연차'}
                                    onChange={(e) => handleChange('vacation_type', e.target.value)}
                                    disabled={isReadOnly}
                                    displayEmpty
                                    MenuProps={{ 
                                        disableScrollLock: true, 
                                        style: { zIndex: 9999 } // 모바일 터치/스크롤 버그 방지 강화 (Bug #2 대응)
                                    }} 
                                    sx={{ fontSize: '13px', bgcolor: 'white' }}
                                >
                                    <MenuItem value="연차">연차</MenuItem>
                                    <MenuItem value="반차">반차</MenuItem>
                                    <MenuItem value="경조휴가">경조휴가</MenuItem>
                                    <MenuItem value="병가">병가</MenuItem>
                                    <MenuItem value="기타">기타</MenuItem>
                                </Select>
                            </FormControl>
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>휴가기간</Box>
                        <td colSpan={4}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <input 
                                    type="date" 
                                    value={data.start_date || new Date().toISOString().split('T')[0]} 
                                    onChange={(e) => handleChange('start_date', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                />
                                <Typography>~</Typography>
                                <input 
                                    type="date" 
                                    value={data.end_date || ''} 
                                    onChange={(e) => handleChange('end_date', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                />
                                <Typography sx={{ ml: 2 }}>(&nbsp;&nbsp;&nbsp;&nbsp;)일간</Typography>
                            </Box>
                            {data.vacation_type === '반차' && (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, mt: 1, p: 1, border: '1px dashed #ccc', borderRadius: 1, bgcolor: '#fffde7' }}>
                                    <Typography sx={{ fontSize: '13px', fontWeight: 'bold', color: '#f57f17' }}>반차 구분 :</Typography>
                                    <RadioGroup 
                                        row 
                                        value={data.half_day_type || ''} 
                                        onChange={(e) => handleChange('half_day_type', e.target.value)}
                                    >
                                        <FormControlLabel 
                                            value="오전" 
                                            control={<Radio size="small" disabled={isReadOnly} />} 
                                            label={<Typography sx={{ fontSize: '13px' }}>오전 반차 (09:00~13:00)</Typography>} 
                                        />
                                        <FormControlLabel 
                                            value="오후" 
                                            control={<Radio size="small" disabled={isReadOnly} />} 
                                            label={<Typography sx={{ fontSize: '13px' }}>오후 반차 (14:00~18:00)</Typography>} 
                                        />
                                    </RadioGroup>
                                    {/* 시간 값은 백엔드 전송용으로 유지하되 화면에서는 숨김 처리 (Bug #1 지시사항) */}
                                    <input type="hidden" value={data.half_day_start || ''} />
                                    <input type="hidden" value={data.half_day_end || ''} />
                                </Box>
                            )}
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>휴가사유</Box>
                        <td colSpan={4} style={{ height: '150px', verticalAlign: 'top' }}>
                            <textarea 
                                value={data.vacation_reason || ''} 
                                onChange={(e) => handleChange('vacation_reason', e.target.value)}
                                readOnly={isReadOnly}
                                rows={6}
                                style={{ border: 'none', width: '100%', height: '100%', outline: 'none', resize: 'none', fontFamily: 'inherit', padding: '10px' }}
                            />
                        </td>
                    </TableRow>
                </TableBody>
            </Table>

            <Box sx={{ mt: 4, textAlign: 'center' }}>
                <Typography sx={{ mb: 4, fontSize: '15px' }}>
                    상기 사유와 같이 휴가원을 제출하오니 허가하여 주시기 바랍니다.
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

export default LeaveRequestForm;
