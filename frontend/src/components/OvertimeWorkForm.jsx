import React, { useEffect } from 'react';
import { Box, Typography, Table, TableBody, TableRow, TableCell, RadioGroup, FormControlLabel, Radio } from '@mui/material';
import ApprovalGrid from './ApprovalGrid';

const OvertimeWorkForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    const today = new Date();
    const formattedDate = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

    useEffect(() => {
        let updates = {};
        if (!data.staff_no && currentUser?.staff_no) updates.staff_no = currentUser.staff_no;
        if (!data.dept && currentUser?.department) updates.dept = currentUser.department;

        if (data.start_time && data.end_time) {
            const start = new Date(`2000-01-01T${data.start_time}`);
            const end = new Date(`2000-01-01T${data.end_time}`);
            let diff = (end - start) / (1000 * 60 * 60);
            if (diff < 0) diff += 24; // 자정을 넘기는 특근(철야) 처리
            
            const calcHours = parseFloat(diff.toFixed(1));
            if (data.hours !== calcHours) {
                updates.hours = calcHours;
            }
        }

        if (Object.keys(updates).length > 0) {
            onChange({ ...data, ...updates });
        }
    }, [data.start_time, data.end_time, currentUser]);

    const handleChange = (field, value) => {
        if (isReadOnly || typeof onChange !== 'function') return;
        onChange({ ...data, [field]: value });
    };

    return (
        <Box className="a4-form-container print-safe-area" sx={{ width: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'white' }}>
            <Box className="idf-header" sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box sx={{ flex: 1, pt: 4 }}>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 'bold', letterSpacing: '5px' }}>
                        야근 · 특근 신청서
                    </Typography>
                </Box>
                <ApprovalGrid documentData={documentData} currentUser={currentUser} docType="OVERTIME" />
            </Box>

            <Table size="small" className="responsive-table" sx={{ mb: 3, '& td': { border: '1px solid #000', p: 1.5, fontSize: '14px' } }}>
                <TableBody>
                    <TableRow sx={{ height: '50px' }}>
                        <Box component="td" sx={{ width: '100px', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>소 속</Box>
                        <td style={{ width: '200px' }}>
                            <input 
                                value={data.dept || ''} 
                                onChange={(e) => handleChange('dept', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none' }}
                                placeholder="소속 부서"
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
                            <RadioGroup row value={data.work_type || '야근'} onChange={(e) => handleChange('work_type', e.target.value)}>
                                <FormControlLabel value="야근" control={<Radio size="small" />} label="야근" disabled={isReadOnly} />
                                <FormControlLabel value="특근" control={<Radio size="small" />} label="특근(휴일)" disabled={isReadOnly} />
                            </RadioGroup>
                        </td>
                    </TableRow>
                    <TableRow sx={{ height: '60px' }}>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>근무일시</Box>
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
                                    value={data.start_time || '18:00'} 
                                    onChange={(e) => handleChange('start_time', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                />
                                <Typography>~</Typography>
                                <input 
                                    type="time" 
                                    value={data.end_time || ''} 
                                    onChange={(e) => handleChange('end_time', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                />
                                <Typography sx={{ ml: 2, fontWeight: 'bold', fontSize: '14px', color: '#1976d2' }}>
                                    총: {data.hours || 0} 시간
                                </Typography>
                            </Box>
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>근무내용</Box>
                        <td colSpan={4} style={{ height: '200px', verticalAlign: 'top' }}>
                            <textarea 
                                value={data.reason || ''} 
                                onChange={(e) => handleChange('reason', e.target.value)}
                                readOnly={isReadOnly}
                                rows={8}
                                placeholder="상세 근무 내용을 입력하세요."
                                style={{ border: 'none', width: '100%', height: '100%', outline: 'none', resize: 'none', fontFamily: 'inherit', padding: '10px' }}
                            />
                        </td>
                    </TableRow>
                </TableBody>
            </Table>

            <Box sx={{ mt: 4, textAlign: 'center' }}>
                <Typography sx={{ mb: 4, fontSize: '15px' }}>
                    상기 사유와 같이 야근 · 특근 신청서를 제출하오니 허가하여 주시기 바랍니다.
                </Typography>
                
                <div className="text-center mt-10 mb-6 font-bold text-lg">
                    {formattedDate}
                </div>
                
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
                    .responsive-table tr { margin-bottom: 20px; border-bottom: 1px solid #eee !important; padding-bottom: 10px; }
                    .responsive-table td { padding: 8px 0 !important; }
                    .responsive-table td[component="td"] { background-color: transparent !important; text-align: left !important; color: #666; font-size: 12px; }
                    textarea, input { font-size: 16px !important; border: 1px solid #eee !important; padding: 10px !important; border-radius: 4px; }
                }
            `}</style>
        </Box>
    );
};

export default OvertimeWorkForm;
