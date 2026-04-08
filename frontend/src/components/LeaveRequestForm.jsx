import React, { useEffect } from 'react';
import { Box, Typography, Table, TableBody, TableRow, TableCell, RadioGroup, FormControlLabel, Radio, Checkbox, Select, MenuItem, FormControl, InputLabel } from '@mui/material';
import ApprovalGrid from './ApprovalGrid';

const LeaveRequestForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    const today = new Date();
    const formattedDate = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

    useEffect(() => {
        const offset = new Date().getTimezoneOffset() * 60000;
        const todayStr = new Date(Date.now() - offset).toISOString().split('T')[0];
        const currentStart = data.start_date || todayStr;
        const currentEnd = data.end_date || currentStart;
        const vType = data.vacation_type || '연차';

        let updates = {};

        // 1. 초기 상태가 텅 비어있다면 무조건 기본값을 꽂아 넣음 (레거시 data.reason 호환 포함)
        if (!data.start_date) updates.start_date = currentStart;
        if (!data.end_date) updates.end_date = currentEnd;
        if (!data.vacation_type) updates.vacation_type = vType;
        if (!data.vacation_reason && data.reason) updates.vacation_reason = data.reason;
        if (!data.staff_no && currentUser?.staff_no) updates.staff_no = currentUser.staff_no;
        if (!data.dept && currentUser?.department) updates.dept = currentUser.department;

        let calcDays = data.leave_days;

        // 2. 날짜 계산
        if (vType.includes('반차')) {
            if (parseFloat(calcDays) !== 0.5) updates.leave_days = 0.5;
        } else {
            const start = new Date(currentStart);
            const end = new Date(currentEnd);
            if (end >= start) {
                const diffDays = Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1;
                if (parseFloat(calcDays) !== diffDays) updates.leave_days = diffDays;
            }
        }

        // 3. 업데이트 사항이 있을 때만 부모 state 변경
        if (Object.keys(updates).length > 0) {
            onChange({ ...data, ...updates });
        }
    // 🚨 수동 기입 덮어쓰기 방지를 위해 data.leave_days는 의존성 배열에서 제외할 것
    }, [data.start_date, data.end_date, data.vacation_type, currentUser]);

    // [NEW] Display logic for read-only mode when leave_days might be missing (e.g., from old mobile requests)
    const getDisplayLeaveDays = () => {
        if (data.leave_days) return data.leave_days;
        
        const vType = data.vacation_type || '연차';
        if (vType.includes('반차')) return 0.5;
        
        const start = data.start_date;
        const end = data.end_date || start;
        if (start && end) {
            const s = new Date(start);
            const e = new Date(end);
            if (e >= s) {
                return Math.ceil(Math.abs(e - s) / (1000 * 60 * 60 * 24)) + 1;
            }
        }
        return '0';
    };

    const handleChange = (field, value) => {
        if (isReadOnly || typeof onChange !== 'function') return;
        
        let newData = { ...data, [field]: value };

        // [라디오 버튼 통합 대응] '오전 반차'/'오후 반차' 선택 시 처리
        if (field === 'vacation_type') {
            if (value === '오전 반차') {
                newData.vacation_type = '반차';
                newData.half_day_type = '오전';
                newData.half_day_start = '09:00';
                newData.half_day_end = '13:00';
            } else if (value === '오후 반차') {
                newData.vacation_type = '반차';
                newData.half_day_type = '오후';
                newData.half_day_start = '14:00';
                newData.half_day_end = '18:00';
            } else if (value !== '반차') {
                // 반차 외 다른 휴가 선택 시 반차 관련 데이터 삭제
                delete newData.half_day_type;
                delete newData.half_day_start;
                delete newData.half_day_end;
            }
        }

        onChange(newData);
    };

    return (
        <Box className="a4-form-container print-safe-area" sx={{ width: '100%', height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'white' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box sx={{ flex: 1, pt: 4 }}>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 'bold', letterSpacing: '15px' }}>
                        휴 가 원
                    </Typography>
                </Box>
                <ApprovalGrid documentData={documentData} currentUser={currentUser} docType="LEAVE_REQUEST" />
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
                            <RadioGroup 
                                row 
                                value={data.vacation_type === '반차' ? (data.half_day_type === '오전' ? '오전 반차' : '오후 반차') : (data.vacation_type || '연차')} 
                                onChange={(e) => handleChange('vacation_type', e.target.value)}
                            >
                                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                                    <FormControlLabel value="연차" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>연차</Typography>} disabled={isReadOnly} />
                                    <FormControlLabel value="오전 반차" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>오전 반차</Typography>} disabled={isReadOnly} />
                                    <FormControlLabel value="오후 반차" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>오후 반차</Typography>} disabled={isReadOnly} />
                                    <FormControlLabel value="경조휴가" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>경조휴가</Typography>} disabled={isReadOnly} />
                                    <FormControlLabel value="병가" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>병가</Typography>} disabled={isReadOnly} />
                                    <FormControlLabel value="기타" control={<Radio size="small" />} label={<Typography sx={{ fontSize: '13px' }}>기타</Typography>} disabled={isReadOnly} />
                                </Box>
                            </RadioGroup>
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>휴가기간</Box>
                        <td colSpan={4}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                                {isReadOnly ? (
                                    <Typography sx={{ fontSize: '14px', py: 0.5, borderBottom: '1px solid #eee', minWidth: '120px' }}>
                                        {data.start_date || '-'}
                                    </Typography>
                                ) : (
                                    <input 
                                        type="date" 
                                        value={data.start_date || new Date().toISOString().split('T')[0]} 
                                        onChange={(e) => handleChange('start_date', e.target.value)}
                                        readOnly={isReadOnly}
                                        style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                    />
                                )}
                                <Typography>~</Typography>
                                {isReadOnly ? (
                                    <Typography sx={{ fontSize: '14px', py: 0.5, borderBottom: '1px solid #eee', minWidth: '120px' }}>
                                        {data.end_date || '-'}
                                    </Typography>
                                ) : (
                                    <input 
                                        type="date" 
                                        value={data.end_date || ''} 
                                        onChange={(e) => handleChange('end_date', e.target.value)}
                                        readOnly={isReadOnly}
                                        style={{ border: 'none', borderBottom: '1px solid #ccc', outline: 'none' }}
                                    />
                                )}
                                <Typography sx={{ ml: 2 }}>(&nbsp;</Typography>
                                {isReadOnly ? (
                                    <Typography sx={{ fontWeight: 'bold' }}>{getDisplayLeaveDays()}</Typography>
                                ) : (
                                    <input 
                                        type="number" 
                                        step="0.5" 
                                        value={data.leave_days || ''}
                                        onChange={(e) => handleChange('leave_days', e.target.value)}
                                        placeholder="일수"
                                        readOnly={isReadOnly}
                                        style={{ width: '50px', border: 'none', borderBottom: '1px solid #ccc', outline: 'none', textAlign: 'center' }}
                                    />
                                )}
                                <Typography className="text-sm">)일간</Typography>
                            </Box>
                            {data.vacation_type === '반차' && (
                                <Box sx={{ mt: 1, p: 1, border: '1px dashed #ccc', borderRadius: 1, bgcolor: '#fffde7' }}>
                                    <Typography sx={{ fontSize: '13px', fontWeight: 'bold', color: '#f57f17' }}>
                                        반차 시간: {data.half_day_start} ~ {data.half_day_end} (자동 적용)
                                    </Typography>
                                    <input type="hidden" value={data.half_day_start || ''} />
                                    <input type="hidden" value={data.half_day_end || ''} />
                                </Box>
                            )}
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>휴가사유</Box>
                        <td colSpan={4} style={{ height: '150px', verticalAlign: 'top' }}>
                            {isReadOnly ? (
                                <Typography sx={{ whiteSpace: 'pre-wrap', p: 1, fontSize: '14px', lineHeight: '1.6', minHeight: '150px' }}>
                                    {data.vacation_reason || data.reason || '-'}
                                </Typography>
                            ) : (
                                <textarea 
                                    value={data.vacation_reason || data.reason || ''} 
                                    onChange={(e) => handleChange('vacation_reason', e.target.value)}
                                    readOnly={isReadOnly}
                                    rows={6}
                                    style={{ border: 'none', width: '100%', height: '100%', outline: 'none', resize: 'none', fontFamily: 'inherit', padding: '10px' }}
                                />
                            )}
                        </td>
                    </TableRow>
                </TableBody>
            </Table>

            <Box sx={{ mt: 4, textAlign: 'center' }}>
                <Typography sx={{ mb: 4, fontSize: '15px' }}>
                    상기 사유와 같이 휴가원을 제출하오니 허가하여 주시기 바랍니다.
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

export default LeaveRequestForm;
