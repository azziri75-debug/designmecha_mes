import React from 'react';
import { Box, Typography, Table, TableBody, TableRow, TableCell, RadioGroup, FormControlLabel, Radio, Checkbox } from '@mui/material';
import ApprovalGrid from './ApprovalGrid';

const LeaveRequestForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    const handleChange = (field, value) => {
        if (isReadOnly) return;
        onChange({ ...data, [field]: value });
    };

    return (
        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
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
                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                <FormControlLabel 
                                    control={<Checkbox size="small" checked={data.vacation_type === '연차'} onChange={() => handleChange('vacation_type', '연차')} disabled={isReadOnly} />} 
                                    label={<Typography sx={{ fontSize: '13px' }}>연차</Typography>} 
                                />
                                <FormControlLabel 
                                    control={<Checkbox size="small" checked={data.vacation_type === '반차'} onChange={() => handleChange('vacation_type', '반차')} disabled={isReadOnly} />} 
                                    label={<Typography sx={{ fontSize: '13px' }}>반차 (오전 / 오후)</Typography>} 
                                />
                                <FormControlLabel 
                                    control={<Checkbox size="small" checked={data.vacation_type === '경조휴가'} onChange={() => handleChange('vacation_type', '경조휴가')} disabled={isReadOnly} />} 
                                    label={<Typography sx={{ fontSize: '13px' }}>경조휴가</Typography>} 
                                />
                                <FormControlLabel 
                                    control={<Checkbox size="small" checked={data.vacation_type === '기타'} onChange={() => handleChange('vacation_type', '기타')} disabled={isReadOnly} />} 
                                    label={<Typography sx={{ fontSize: '13px' }}>기타</Typography>} 
                                />
                            </Box>
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>휴가기간</Box>
                        <td colSpan={4}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                <input 
                                    type="date" 
                                    value={data.start_date || ''} 
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
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Typography sx={{ fontSize: '13px' }}>반차 :</Typography>
                                    <input 
                                        type="time" 
                                        value={data.half_day_start || ''} 
                                        onChange={(e) => handleChange('half_day_start', e.target.value)}
                                        readOnly={isReadOnly}
                                        style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                    />
                                    <Typography>~</Typography>
                                    <input 
                                        type="time" 
                                        value={data.half_day_end || ''} 
                                        onChange={(e) => handleChange('half_day_end', e.target.value)}
                                        readOnly={isReadOnly}
                                        style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                    />
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
        </Box>
    );
};

export default LeaveRequestForm;
