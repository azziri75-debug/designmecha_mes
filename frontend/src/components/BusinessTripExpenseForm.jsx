import React, { useEffect } from 'react';
import { Box, Typography } from '@mui/material';
import ApprovalGrid from './ApprovalGrid';
import { formatNumber } from '../lib/utils';

const BusinessTripExpenseForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    const today = new Date();
    const formattedDate = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

    // Initialize default data items
    useEffect(() => {
        let updates = {};
        
        const todayStr = new Date().toISOString().split('T')[0];
        if (!data.start_date) updates.start_date = todayStr;
        if (!data.end_date) updates.end_date = todayStr;
        
        // Auto-fill author info if draft
        if (!data.dept) updates.dept = documentData?.author?.department || currentUser?.department || '';
        if (!data.role) updates.role = documentData?.author?.role || currentUser?.role || '';
        if (!data.staff_no) updates.staff_no = documentData?.author?.staff_no || currentUser?.staff_no || '';
        if (!data.name) updates.name = documentData?.author?.name || currentUser?.name || '';
        
        if (Object.keys(updates).length > 0) {
            onChange({ ...data, ...updates });
        }
    }, [currentUser]);

    // Dynamically adjust item rows based on date range
    useEffect(() => {
        if (isReadOnly || typeof onChange !== 'function') return;
        if (!data.start_date || !data.end_date) return;
        
        const start = new Date(data.start_date);
        const end = new Date(data.end_date);
        const diffTime = end.getTime() - start.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

        if (diffDays > 0 && diffDays <= 60) {
            let itemsChanged = false;
            const currentItems = data.items || [];
            
            if (currentItems.length !== diffDays) itemsChanged = true;
            
            const newItems = [];
            for (let i = 0; i < diffDays; i++) {
                const currentDate = new Date(start);
                currentDate.setDate(start.getDate() + i);
                const dateStr = `${currentDate.getMonth() + 1}/${currentDate.getDate()}`; // "3/10"
                
                const existingItem = currentItems[i] || { 
                    round_trip: '', local_transport: '', lodging: '', meals: '', parking: '', other: '' 
                };
                
                if (existingItem.date !== dateStr) itemsChanged = true;
                
                newItems.push({ ...existingItem, date: dateStr });
            }
            
            let updates = {};
            if (data.days !== diffDays) updates.days = diffDays;
            if (itemsChanged) updates.items = newItems;

            if (Object.keys(updates).length > 0) {
                onChange({ ...data, ...updates });
            }
        }
    }, [data.start_date, data.end_date, isReadOnly]);

    const handleChange = (field, value) => {
        if (isReadOnly || typeof onChange !== 'function') return;
        onChange({ ...data, [field]: value });
    };

    const handleItemChange = (index, field, value) => {
        if (isReadOnly || typeof onChange !== 'function') return;
        const newItems = [...(data.items || [])];
        newItems[index] = { ...newItems[index], [field]: value };
        onChange({ ...data, items: newItems });
    };

    // Derived calculations
    const items = data.items || [];
    
    const calculateRowTotal = (item) => {
        const sum = ['round_trip', 'local_transport', 'lodging', 'meals', 'parking', 'other']
            .reduce((acc, key) => acc + (parseInt(item[key]?.toString().replace(/,/g, '')) || 0), 0);
        return sum;
    };

    const totalSum = items.reduce((acc, item) => acc + calculateRowTotal(item), 0);
    const cashValue = parseInt(data.cash_usage?.toString().replace(/,/g, '')) || 0;
    const cardValue = parseInt(data.card_usage?.toString().replace(/,/g, '')) || 0;

    // Automatically update cash if it's not manually filled or auto-balance
    // Wait, the form typically expects user to split cash/card manually. We will just show total.

    return (
        <Box className="a4-form-container print-safe-area" sx={{ width: '100%', height: '100%', minHeight: '100%', display: 'flex', flexDirection: 'column', bgcolor: 'white' }}>
            <style>
                {`
                    .settlement-table {
                        border-collapse: collapse !important;
                        border: 2px solid #000 !important;
                    }
                    .settlement-table td {
                        border: 1px solid #000 !important;
                        padding: 4px !important;
                    }
                    @media print {
                        .settlement-table td {
                            border: 1px solid #000 !important;
                        }
                    }
                `}
            </style>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                <Box sx={{ flex: 1, pt: 4 }}>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 'bold', letterSpacing: '8px' }}>
                        출장여비 정산서
                    </Typography>
                </Box>
                <ApprovalGrid documentData={documentData} currentUser={currentUser} docType="BUSINESS_TRIP" />
            </Box>

            <table className="settlement-table" style={{ width: '100%', borderCollapse: 'collapse', border: '2px solid #000', fontSize: '13px', textAlign: 'center', tableLayout: 'fixed' }}>
                <tbody>
                    <tr style={{ height: '40px' }}>
                        <td style={{ width: '10%', backgroundColor: '#f9fafb' }}>소 속</td>
                        <td style={{ width: '15%' }}>
                            <input value={data.dept || ''} onChange={(e) => handleChange('dept', e.target.value)} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'center' }} />
                        </td>
                        <td style={{ width: '10%', backgroundColor: '#f9fafb' }}>직 위</td>
                        <td style={{ width: '15%' }}>
                            <input value={data.role || ''} onChange={(e) => handleChange('role', e.target.value)} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'center' }} />
                        </td>
                        <td style={{ width: '12%', backgroundColor: '#f9fafb', fontSize: '12px' }}>사원번호</td>
                        <td style={{ width: '13%' }}>
                            <input value={data.staff_no || ''} onChange={(e) => handleChange('staff_no', e.target.value)} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'center' }} />
                        </td>
                        <td style={{ width: '10%', backgroundColor: '#f9fafb' }}>성 명</td>
                        <td style={{ width: '15%' }}>
                            <input value={data.name || ''} onChange={(e) => handleChange('name', e.target.value)} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'center' }} />
                        </td>
                    </tr>
                    
                    <tr style={{ height: '50px' }}>
                        <td style={{ backgroundColor: '#f9fafb' }}>기 간</td>
                        <td colSpan={5} style={{ textAlign: 'left', paddingLeft: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                <input type="date" value={data.start_date || ''} onChange={(e) => handleChange('start_date', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', outline: 'none', fontFamily: 'inherit' }} />
                                <span>~</span>
                                <input type="date" value={data.end_date || ''} onChange={(e) => handleChange('end_date', e.target.value)} readOnly={isReadOnly} style={{ border: 'none', outline: 'none', fontFamily: 'inherit' }} />
                                <span>(</span>
                                <input type="number" value={data.days || ''} onChange={(e) => handleChange('days', e.target.value)} readOnly={isReadOnly} style={{ width: '40px', border: 'none', outline: 'none', textAlign: 'center', borderBottom: '1px solid #ccc' }} />
                                <span>일)</span>
                            </div>
                        </td>
                        <td style={{ backgroundColor: '#f9fafb' }}>출장지역</td>
                        <td>
                            <input value={data.destination || ''} onChange={(e) => handleChange('destination', e.target.value)} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'center' }} />
                        </td>
                    </tr>

                    <tr style={{ height: '40px' }}>
                        <td colSpan={8} style={{ textAlign: 'left', paddingLeft: '10px' }}>
                            출장목적 : <input value={data.purpose || ''} onChange={(e) => handleChange('purpose', e.target.value)} readOnly={isReadOnly} style={{ width: '80%', border: 'none', outline: 'none' }} />
                        </td>
                    </tr>
                    
                    <tr style={{ height: '40px' }}>
                        <td colSpan={8} style={{ textAlign: 'left', paddingLeft: '10px' }}>
                            출장자 : <input value={data.traveler || ''} onChange={(e) => handleChange('traveler', e.target.value)} readOnly={isReadOnly} style={{ width: '85%', border: 'none', outline: 'none' }} />
                        </td>
                    </tr>

                    <tr style={{ height: '40px', backgroundColor: '#f9fafb' }}>
                        <td colSpan={8} style={{ fontWeight: 'bold', fontSize: '15px', letterSpacing: '4px' }}>일 정 및 여 비 정 산</td>
                    </tr>

                    <tr style={{ height: '40px', backgroundColor: '#f9fafb', fontSize: '12px' }}>
                        <td>월/일</td>
                        <td>왕복교통비</td>
                        <td>현지교통비</td>
                        <td>숙 박 비</td>
                        <td>식 대</td>
                        <td>주 차 료</td>
                        <td style={{ fontSize: '10px' }}>기 타<br/>(유류대등)</td>
                        <td>합 계</td>
                    </tr>

                    {items.map((item, idx) => {
                        const rowTotal = calculateRowTotal(item);
                        return (
                            <tr key={idx} style={{ height: '30px' }}>
                                <td>
                                    <input value={item.date || ''} onChange={(e) => handleItemChange(idx, 'date', e.target.value)} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'center' }} placeholder="M/D" />
                                </td>
                                <td>
                                    <input value={item.round_trip || ''} onChange={(e) => handleItemChange(idx, 'round_trip', e.target.value.replace(/[^0-9]/g, ''))} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', paddingRight: '5px' }} onBlur={() => handleItemChange(idx, 'round_trip', formatNumber(item.round_trip))} />
                                </td>
                                <td>
                                    <input value={item.local_transport || ''} onChange={(e) => handleItemChange(idx, 'local_transport', e.target.value.replace(/[^0-9]/g, ''))} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', paddingRight: '5px' }} onBlur={() => handleItemChange(idx, 'local_transport', formatNumber(item.local_transport))} />
                                </td>
                                <td>
                                    <input value={item.lodging || ''} onChange={(e) => handleItemChange(idx, 'lodging', e.target.value.replace(/[^0-9]/g, ''))} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', paddingRight: '5px' }} onBlur={() => handleItemChange(idx, 'lodging', formatNumber(item.lodging))} />
                                </td>
                                <td>
                                    <input value={item.meals || ''} onChange={(e) => handleItemChange(idx, 'meals', e.target.value.replace(/[^0-9]/g, ''))} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', paddingRight: '5px' }} onBlur={() => handleItemChange(idx, 'meals', formatNumber(item.meals))} />
                                </td>
                                <td>
                                    <input value={item.parking || ''} onChange={(e) => handleItemChange(idx, 'parking', e.target.value.replace(/[^0-9]/g, ''))} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', paddingRight: '5px' }} onBlur={() => handleItemChange(idx, 'parking', formatNumber(item.parking))} />
                                </td>
                                <td>
                                    <input value={item.other || ''} onChange={(e) => handleItemChange(idx, 'other', e.target.value.replace(/[^0-9]/g, ''))} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'right', paddingRight: '5px' }} onBlur={() => handleItemChange(idx, 'other', formatNumber(item.other))} />
                                </td>
                                <td style={{ textAlign: 'right', paddingRight: '5px' }}>
                                    {rowTotal > 0 ? formatNumber(rowTotal) : ''}
                                </td>
                            </tr>
                        );
                    })}

                    <tr style={{ height: '40px', backgroundColor: '#fcfcfc' }}>
                        <td>현 금<br/>사 용</td>
                        <td colSpan={2}>
                            <input value={data.cash_usage || ''} onChange={(e) => handleChange('cash_usage', e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => handleChange('cash_usage', formatNumber(data.cash_usage))} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'center', backgroundColor: 'transparent' }} />
                        </td>
                        <td>카 드<br/>사 용</td>
                        <td colSpan={2}>
                            <input value={data.card_usage || ''} onChange={(e) => handleChange('card_usage', e.target.value.replace(/[^0-9]/g, ''))} onBlur={() => handleChange('card_usage', formatNumber(data.card_usage))} readOnly={isReadOnly} style={{ width: '100%', border: 'none', outline: 'none', textAlign: 'center', backgroundColor: 'transparent' }} />
                        </td>
                        <td>총 액</td>
                        <td style={{ textAlign: 'right', paddingRight: '10px' }}>
                            {formatNumber(totalSum)}원
                        </td>
                    </tr>

                    <tr style={{ height: '300px' }}>
                        <td colSpan={8} style={{ textAlign: 'left', verticalAlign: 'top', padding: '10px' }}>
                            <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>정산내역</div>
                            <textarea 
                                value={data.details || ''} 
                                onChange={(e) => handleChange('details', e.target.value)}
                                readOnly={isReadOnly}
                                rows={10}
                                style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', fontFamily: 'inherit', fontSize: '13px', lineHeight: '1.6' }}
                                placeholder="자차사용 사유 등 상세 내역을 입력하세요..."
                            />
                            <div style={{ fontSize: '11px', marginTop: '30px' }}>
                                * ㈜디자인메카 여비규정 "제2장 자가차량 사용 출장시 처리지침" 적용
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            <Box sx={{ flex: 1 }} />

            <Box sx={{ mt: 'auto', pt: 6, pb: 2, textAlign: 'center' }}>
                <Typography sx={{ fontWeight: 'bold', fontSize: '16px', mb: 3 }}>
                    상기와 같이 정산합니다.
                </Typography>
                <div style={{ marginBottom: '20px', fontSize: '15px' }}>
                    {data.submit_date || formattedDate}
                </div>
                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2, mb: 4 }}>
                    <Typography sx={{ fontSize: '15px' }}>정산자 :</Typography>
                    <Typography sx={{ minWidth: '80px', textAlign: 'center', fontSize: '15px' }}>
                        {data.name || documentData?.author?.name || currentUser?.name || ''}
                    </Typography>
                    <Typography sx={{ fontSize: '15px' }}>(인)</Typography>
                </Box>

                <Typography align="center" variant="h6" sx={{ mt: 4, fontWeight: 'bold' }}>
                    (주)디자인메카
                </Typography>
            </Box>
        </Box>
    );
};

export default BusinessTripExpenseForm;
