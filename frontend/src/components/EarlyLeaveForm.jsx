import React, { useEffect } from 'react';
import { Box, Typography, Table, TableBody, TableRow, TableCell, RadioGroup, FormControlLabel, Radio, Select, MenuItem, FormControl } from '@mui/material';
import ApprovalGrid from './ApprovalGrid';

const EarlyLeaveForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    const today = new Date();
    const formattedDate = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

    const isOuting = data.leave_type === '외출';

    useEffect(() => {
        let updates = {};
        
        // 1. 초기값 강제 셋업 및 레거시 데이터 호환성
        if (!data.leave_type) updates.leave_type = data.type || '조퇴';
        if (!data.leave_time && data.time) updates.leave_time = data.time;
        if (!data.return_time && data.end_time) updates.return_time = data.end_time;
        if (!data.leave_reason && data.reason) updates.leave_reason = data.reason;
        
        const offset = new Date().getTimezoneOffset() * 60000;
        const todayStr = new Date(Date.now() - offset).toISOString().split('T')[0];
        if (!data.date) updates.date = todayStr;
        if (!data.staff_no && currentUser?.staff_no) updates.staff_no = currentUser.staff_no;
        if (!data.dept && currentUser?.department) updates.dept = currentUser.department;

        // 2. 시간 계산 (입력 즉시 반응하도록 보정)
        const startTime = data.leave_time || data.time;
        const endTime = data.return_time || data.end_time;
        
        if (startTime && (data.leave_type === '외출' ? endTime : true)) {
            const start = new Date(`2000-01-01T${startTime}`);
            const end = endTime ? new Date(`2000-01-01T${endTime}`) : null;
            
            let calcHours = 0;
            if (data.leave_type === '외출' && end) {
                let diff = (end - start) / (1000 * 60 * 60);
                if (diff < 0) diff += 24;
                calcHours = isNaN(diff) ? 0 : parseFloat(diff.toFixed(1));
            } else if (data.leave_type === '조퇴') {
                // 조퇴는 정규 퇴근 시간(18:00)까지의 시간을 계산
                const workEnd = new Date(`2000-01-01T18:00`);
                let diff = (workEnd - start) / (1000 * 60 * 60);
                calcHours = isNaN(diff) ? 0 : parseFloat(Math.max(0, diff).toFixed(1));
            }

            if (data.hours !== calcHours && calcHours >= 0) {
                updates.hours = calcHours;
            }
        }

        if (Object.keys(updates).length > 0 && typeof onChange === 'function') {
            onChange({ ...data, ...updates });
        }
    }, [data.leave_type, data.date, data.leave_time, data.time, data.return_time, data.end_time, currentUser, onChange]);

    // [NEW] Display logic for read-only mode when hours might be missing
    const getDisplayHours = () => {
        if (data.hours) return data.hours;
        
        const startTime = data.leave_time || data.time;
        const endTime = data.return_time || data.end_time;
        if (!startTime) return 0;

        const start = new Date(`2000-01-01T${startTime}`);
        let calcHours = 0;
        if (data.leave_type === '외출' && endTime) {
            const end = new Date(`2000-01-01T${endTime}`);
            let diff = (end - start) / (1000 * 60 * 60);
            if (diff < 0) diff += 24;
            calcHours = parseFloat(diff.toFixed(1));
        } else if (data.leave_type === '조퇴' || !data.leave_type) {
            const workEnd = new Date(`2000-01-01T18:00`);
            let diff = (workEnd - start) / (1000 * 60 * 60);
            calcHours = parseFloat(Math.max(0, diff).toFixed(1));
        }
        return isNaN(calcHours) ? 0 : calcHours;
    };

    const handleChange = (field, value) => {
        if (isReadOnly || typeof onChange !== 'function') return;
        const newData = { ...data, [field]: value };
        if (field === 'leave_type' && value === '조퇴') {
            newData.return_time = null;
        }
        onChange(newData);
    };

    return (
        <Box className="a4-form-container print-safe-area" sx={{ width: '100%', height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'white' }}>
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
                    <TableRow sx={{ height: '70px' }}>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>근무일시</Box>
                        <td colSpan={4}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                {isReadOnly ? (
                                    <Typography sx={{ fontSize: '14px', py: 0.5, borderBottom: '1px solid #eee' }}>
                                        {data.date || '-'}
                                    </Typography>
                                ) : (
                                    <input 
                                        type="date" 
                                        value={data.date || new Date().toISOString().split('T')[0]} 
                                        onChange={(e) => handleChange('date', e.target.value)}
                                        readOnly={isReadOnly}
                                        style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                    />
                                )}
                                {!isOuting ? (
                                    <>
                                        <Typography sx={{ ml: 2, fontWeight: 'bold', fontSize: '13px' }}>퇴근시간:</Typography>
                                        {isReadOnly ? (
                                            <Typography sx={{ fontSize: '14px', py: 0.5 }}>
                                                {data.leave_time || data.time || '-'}
                                            </Typography>
                                        ) : (
                                            <input 
                                                type="time" 
                                                value={data.leave_time || data.time || ''} 
                                                onChange={(e) => {
                                                    if (isReadOnly || typeof onChange !== 'function') return;
                                                    onChange({ ...data, leave_time: e.target.value, return_time: '' });
                                                }}
                                                readOnly={isReadOnly}
                                                style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                            />
                                        )}
                                    </>
                                ) : (
                                    <>
                                        <Typography sx={{ ml: 2, fontWeight: 'bold', fontSize: '13px' }}>외출시간:</Typography>
                                        {isReadOnly ? (
                                            <Typography sx={{ fontSize: '14px', py: 0.5 }}>
                                                {data.leave_time || data.time || '-'}
                                            </Typography>
                                        ) : (
                                            <input 
                                                type="time" 
                                                value={data.leave_time || data.time || ''} 
                                                onChange={(e) => handleChange('leave_time', e.target.value)}
                                                readOnly={isReadOnly}
                                                style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                            />
                                        )}
                                        <Typography>~</Typography>
                                        {isReadOnly ? (
                                            <Typography sx={{ fontSize: '14px', py: 0.5 }}>
                                                {data.return_time || data.end_time || '-'}
                                            </Typography>
                                        ) : (
                                            <input 
                                                type="time" 
                                                value={data.return_time || data.end_time || ''} 
                                                onChange={(e) => handleChange('return_time', e.target.value)}
                                                readOnly={isReadOnly}
                                                style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                            />
                                        )}
                                    </>
                                )}
                                <Typography sx={{ ml: 2, fontWeight: 'bold', fontSize: '14px', color: '#1976d2' }}>
                                    총: {getDisplayHours()} 시간
                                </Typography>
                            </Box>
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>사 유</Box>
                        <td colSpan={4} style={{ height: '200px', verticalAlign: 'top' }}>
                            {isReadOnly ? (
                                <Typography sx={{ whiteSpace: 'pre-wrap', p: 1, fontSize: '14px', lineHeight: '1.6', minHeight: '200px' }}>
                                    {data.leave_reason || data.reason || '-'}
                                </Typography>
                            ) : (
                                <textarea 
                                    value={data.leave_reason || data.reason || ''} 
                                    onChange={(e) => handleChange('leave_reason', e.target.value)}
                                    readOnly={isReadOnly}
                                    rows={8}
                                    style={{ border: 'none', width: '100%', height: '100%', outline: 'none', resize: 'none', fontFamily: 'inherit', padding: '10px' }}
                                />
                            )}
                        </td>
                    </TableRow>
                </TableBody>
            </Table>

            <Box sx={{ mt: 4, textAlign: 'center' }}>
                <Typography sx={{ mb: 4, fontSize: '15px' }}>
                    상기 사유와 같이 조퇴 · 외출원을 제출하오니 허가하여 주시기 바랍니다.
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

            <Box sx={{ flex: 1 }} />

            <Typography align="center" variant="h6" sx={{ mt: 'auto', pt: 6, pb: 2, fontWeight: 'bold' }}>
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
