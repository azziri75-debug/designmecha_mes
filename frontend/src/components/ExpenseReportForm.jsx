import React from 'react';
import { Box, Typography, Table, TableBody, TableRow, TableCell, TextField } from '@mui/material';
import ApprovalGrid from './ApprovalGrid';

const ExpenseReportForm = ({ data = {}, onChange, isReadOnly, currentUser, documentData }) => {
    const handleChange = (field, value) => {
        if (isReadOnly) return;
        onChange({ ...data, [field]: value });
    };

    return (
        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Header: Title & Approval Grid */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box sx={{ flex: 1, pt: 4 }}>
                    <Typography variant="h4" align="center" sx={{ fontWeight: 'bold', letterSpacing: '15px', textDecoration: 'underline', textUnderlineOffset: '8px' }}>
                        지 출 결 의 서
                    </Typography>
                </Box>
                <ApprovalGrid documentData={documentData} currentUser={currentUser} />
            </Box>

            {/* Basic Info Table */}
            <Table size="small" sx={{ mb: 3, '& td': { border: '1px solid #000', p: 1, fontSize: '13px' } }}>
                <TableBody>
                    <TableRow>
                        <Box component="td" sx={{ width: '100px', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>작 성 일</Box>
                        <td>
                            <input 
                                type="date" 
                                value={data.draft_date || ''} 
                                onChange={(e) => handleChange('draft_date', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent' }}
                            />
                        </td>
                        <Box component="td" sx={{ width: '100px', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>작성부서</Box>
                        <td>
                            <input 
                                type="text" 
                                value={data.dept || ''} 
                                onChange={(e) => handleChange('dept', e.target.value)}
                                readOnly={isReadOnly}
                                placeholder="생산부 / 관리부 등"
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent' }}
                            />
                        </td>
                        <Box component="td" sx={{ width: '100px', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>작 성 자</Box>
                        <td style={{ textAlign: 'center' }}>{documentData?.author?.name || currentUser?.name}</td>
                    </TableRow>
                </TableBody>
            </Table>

            {/* Main Content Table */}
            <Table size="small" sx={{ mb: 3, '& td': { border: '1px solid #000', p: 1.2, fontSize: '13px' } }}>
                <TableBody>
                    <TableRow>
                        <Box component="td" sx={{ width: '120px', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>사 업 명</Box>
                        <td colSpan={3}>
                            <input 
                                type="text" 
                                value={data.project_name || ''} 
                                onChange={(e) => handleChange('project_name', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent' }}
                            />
                        </td>
                        <Box component="td" sx={{ width: '100px', bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>과제번호</Box>
                        <td>
                            <input 
                                type="text" 
                                value={data.project_no || ''} 
                                onChange={(e) => handleChange('project_no', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent' }}
                            />
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>과 제 명</Box>
                        <td colSpan={5}>
                            <textarea 
                                value={data.project_title || ''} 
                                onChange={(e) => handleChange('project_title', e.target.value)}
                                readOnly={isReadOnly}
                                rows={2}
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent', resize: 'none', fontFamily: 'inherit' }}
                            />
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>비 목</Box>
                        <td colSpan={5}>
                            <input 
                                type="text" 
                                value={data.category1 || ''} 
                                onChange={(e) => handleChange('category1', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent' }}
                            />
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>세 목</Box>
                        <td colSpan={5}>
                            <input 
                                type="text" 
                                value={data.category2 || ''} 
                                onChange={(e) => handleChange('category2', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent' }}
                            />
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>세 세 목</Box>
                        <td colSpan={5}>
                            <input 
                                type="text" 
                                value={data.category3 || ''} 
                                onChange={(e) => handleChange('category3', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent' }}
                            />
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>내 역</Box>
                        <td colSpan={5}>
                            <textarea 
                                value={data.details || ''} 
                                onChange={(e) => handleChange('details', e.target.value)}
                                readOnly={isReadOnly}
                                rows={3}
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent', resize: 'none', fontFamily: 'inherit' }}
                            />
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>금 액</Box>
                        <td colSpan={5}>
                            <Box sx={{ display: 'flex', alignItems: 'center' }}>
                                <input 
                                    type="text" 
                                    value={data.amount || ''} 
                                    onChange={(e) => handleChange('amount', e.target.value)}
                                    readOnly={isReadOnly}
                                    style={{ border: 'none', width: '200px', outline: 'none', background: 'transparent', textAlign: 'right', fontWeight: 'bold', fontSize: '15px' }}
                                />
                                <Typography sx={{ ml: 1, fontWeight: 'bold' }}>원</Typography>
                                <Typography sx={{ ml: 4, color: '#666', fontSize: '12px' }}>(카드결제, 부가세포함 여부 등 기재)</Typography>
                            </Box>
                        </td>
                    </TableRow>
                    <TableRow>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>지급기한</Box>
                        <td colSpan={5}>
                            <input 
                                type="text" 
                                value={data.due_date || ''} 
                                onChange={(e) => handleChange('due_date', e.target.value)}
                                readOnly={isReadOnly}
                                style={{ border: 'none', width: '100%', outline: 'none', background: 'transparent' }}
                            />
                        </td>
                    </TableRow>
                </TableBody>
            </Table>

            {/* Attachments text section */}
            <Table size="small" sx={{ mb: 3, '& td': { border: '1px solid #000', p: 1, fontSize: '13px' } }}>
                <TableBody>
                    <TableRow sx={{ height: '30px' }}>
                        <Box component="td" sx={{ bgcolor: '#f5f5f5', textAlign: 'center', fontWeight: 'bold' }}>첨 부 서 류</Box>
                    </TableRow>
                    <TableRow>
                        <td style={{ minHeight: '150px', verticalAlign: 'top', padding: '15px' }}>
                            <textarea 
                                value={data.attachment_notes || ''} 
                                onChange={(e) => handleChange('attachment_notes', e.target.value)}
                                readOnly={isReadOnly}
                                placeholder="1. 카드 매출전표 1부&#10;2. 거래명세표 1부&#10;3. 견적서 1부"
                                style={{ border: 'none', width: '100%', minHeight: '120px', outline: 'none', background: 'transparent', resize: 'none', fontFamily: 'inherit', lineHeight: 2 }}
                            />
                        </td>
                    </TableRow>
                </TableBody>
            </Table>

            <Typography align="right" sx={{ mt: 2, fontSize: '18px', fontWeight: 'bold', letterSpacing: '2px' }}>
                (주)디자인메카
            </Typography>
        </Box>
    );
};

export default ExpenseReportForm;
