import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    Box, Button, TextField, Table, TableBody, TableCell, TableHead, TableRow,
    IconButton, Typography, Paper, Divider, Stack
} from '@mui/material';
import { Printer, FileDown, Plus, Trash2, FileText, Send } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import api from '../lib/api';
import MultiFileUpload from './MultiFileUpload';
import { formatNumber } from '../lib/utils';

// ────────────────────────────────────────────
// A4 Portrait 전용 인쇄 CSS
// ────────────────────────────────────────────
const PRINT_STYLE_ID = 'idf-print-style';
const injectPrintCSS = () => {
    if (document.getElementById(PRINT_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PRINT_STYLE_ID;
    style.innerHTML = `
        @media print {
            @page { size: A4 portrait; margin: 0; }
            html, body { 
                width: 210mm !important; 
                height: 297mm !important; 
                margin: 0 !important; 
                padding: 0 !important; 
                overflow: hidden !important; 
            }
            body * { visibility: hidden !important; }
            .idf-no-print { display: none !important; }
            .idf-print-container {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 210mm !important;
                height: 297mm !important;
                margin: 0 !important;
                padding: 15mm !important;
                box-sizing: border-box !important;
                visibility: visible !important;
                background: white !important;
                box-shadow: none !important;
            }
            .idf-print-container * { visibility: visible !important; }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    `;
    document.head.appendChild(style);
};
const removePrintCSS = () => {
    const el = document.getElementById(PRINT_STYLE_ID);
    if (el) el.remove();
};

const InternalDraftForm = ({ documentData, onSave, onCancel }) => {
    const [title, setTitle] = useState(documentData?.title || '');
    const [content, setContent] = useState(documentData?.content?.reason || '');
    const [docNo, setDocNo] = useState(documentData?.content?.doc_no || `DM${new Date().getFullYear()}-B${Math.floor(Math.random()*1000).toString().padStart(3, '0')}`);
    const [draftDate, setDraftDate] = useState(documentData?.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState(documentData?.content?.items || []);
    const [attachments, setAttachments] = useState(documentData?.attachments || []);
    const [isSaving, setIsSaving] = useState(false);
    
    const printRef = useRef();

    useEffect(() => {
        injectPrintCSS();
        return () => removePrintCSS();
    }, []);

    const handleAddItem = () => {
        setItems([...items, { date: new Date().toISOString().split('T')[0], name: '', spec: '', qty: 0, amount: 0 }]);
    };

    const handleRemoveItem = (idx) => {
        setItems(items.filter((_, i) => i !== idx));
    };

    const handleItemChange = (idx, field, value) => {
        const newItems = [...items];
        newItems[idx][field] = value;
        setItems(newItems);
    };

    const handlePrint = () => {
        window.print();
    };

    const handleDownloadPDF = async () => {
        const cvs = await html2canvas(printRef.current, {
            scale: 2,
            useCORS: true,
            backgroundColor: '#ffffff'
        });
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        pdf.addImage(cvs.toDataURL('image/png'), 'PNG', 0, 0, pageWidth, pageHeight);
        pdf.save(`내부기안_${title || '문서'}.pdf`);
    };

    const handleSubmit = async () => {
        if (!title) { alert('제목을 입력해주세요.'); return; }
        setIsSaving(true);
        try {
            const payload = {
                title,
                doc_type: 'INTERNAL_DRAFT',
                content: {
                    reason: content,
                    doc_no: docNo,
                    items: items,
                    dept: '사업본부'
                },
                attachments_to_add: attachments.map(a => ({ filename: a.name || a.filename, url: a.url }))
            };

            if (documentData?.id) {
                await api.put(`/approval/documents/${documentData.id}`, payload);
            } else {
                await api.post('/approval/documents', payload);
            }
            onSave();
        } catch (err) {
            console.error(err);
            alert('저장에 실패했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const getStatusMarker = (stepSequence) => {
        const step = documentData?.steps?.find(s => s.sequence === stepSequence);
        if (step?.status === 'APPROVED') {
            return (
                <Box sx={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <Typography variant="caption" sx={{ color: 'blue', fontWeight: 'bold' }}>승인</Typography>
                    <Typography variant="caption" sx={{ fontSize: '8px' }}>{step.processed_at?.split('T')[0]}</Typography>
                    <Box sx={{ 
                        position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                        width: '35px', height: '35px', border: '1.5px solid rgba(0,0,255,0.3)', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5
                    }}>
                        <Typography sx={{ color: 'blue', fontSize: '10px', fontWeight: 'bold' }}>인</Typography>
                    </Box>
                </Box>
            );
        }
        if (step?.status === 'REJECTED') {
            return <Typography variant="caption" sx={{ color: 'red', fontWeight: 'bold' }}>반려</Typography>;
        }
        return null;
    };

    const totalAmount = items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    return (
        <Box sx={{ p: 4, bgcolor: '#f4f4f7', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Action Bar */}
            <Paper className="idf-no-print" sx={{ p: 2, mb: 3, width: '100%', maxWidth: '800px', display: 'flex', gap: 2, position: 'sticky', top: 10, zIndex: 10 }}>
                <Button variant="contained" startIcon={<Send />} onClick={handleSubmit} disabled={isSaving}>기안하기</Button>
                <Button variant="outlined" startIcon={<Printer />} onClick={handlePrint}>인쇄</Button>
                <Button variant="outlined" startIcon={<FileDown />} onClick={handleDownloadPDF}>PDF 다운로드</Button>
                <Box sx={{ flexGrow: 1 }} />
                <Button color="inherit" onClick={onCancel}>취소</Button>
            </Paper>

            {/* A4 Form */}
            <Paper
                ref={printRef}
                className="idf-print-container"
                sx={{
                    width: '210mm',
                    height: '297mm',
                    p: '15mm',
                    display: 'flex',
                    flexDirection: 'column',
                    boxShadow: '0 0 20px rgba(0,0,0,0.1)',
                    bgcolor: 'white',
                    fontFamily: '"Malgun Gothic", sans-serif',
                    color: '#000',
                    lineHeight: 1.5
                }}
            >
                {/* 1. Header */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
                    <Box>
                        <Typography sx={{ fontSize: '12px', fontWeight: 'bold' }}>전문가정신과 주인의식으로 하나되는 DM가족</Typography>
                        <Typography sx={{ fontSize: '18px', fontWeight: '900', color: '#1a365d' }}>주식회사 디자인메카</Typography>
                    </Box>
                    {/* 결재선 */}
                    <Table size="small" sx={{ width: 'auto', '& td': { border: '1px solid #000', p: 0, width: '60px', height: '60px', textAlign: 'center' } }}>
                        <TableBody>
                             <TableRow sx={{ height: '20px', '& td': { height: '20px', fontSize: '11px', bgcolor: '#f0f0f0' } }}>
                                <td>기안자</td>
                                <td>부장</td>
                                <td>이사</td>
                                <td>대표이사</td>
                            </TableRow>
                            <TableRow sx={{ height: '50px' }}>
                                <td>{documentData ? getStatusMarker(1) : <Typography variant="caption" sx={{ color: '#ccc' }}>서명</Typography>}</td>
                                <td>{getStatusMarker(2)}</td>
                                <td>{getStatusMarker(3)}</td>
                                <td>{getStatusMarker(4)}</td>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Box>

                <Typography variant="h4" align="center" sx={{ fontWeight: 'bold', mb: 4, letterSpacing: '4px', textDecoration: 'underline' }}>내 부 기 안</Typography>

                {/* 2. Doc Info Table */}
                <Table sx={{ border: '2px solid #000', mb: 3, '& td, & th': { border: '1px solid #000', p: 1, fontSize: '13px' } }}>
                    <TableBody>
                        <TableRow>
                            <Box component="td" sx={{ width: '100px', bgcolor: '#f0f0f0', fontWeight: 'bold' }}>문서번호</Box>
                            <td><TextField variant="standard" fullWidth value={docNo} onChange={(e) => setDocNo(e.target.value)} InputProps={{ disableUnderline: true }} sx={{ '& input': { p: 0 } }} /></td>
                            <Box component="td" sx={{ width: '100px', bgcolor: '#f0f0f0', fontWeight: 'bold' }}>시행일자</Box>
                            <td><TextField type="date" variant="standard" fullWidth value={draftDate} onChange={(e) => setDraftDate(e.target.value)} InputProps={{ disableUnderline: true }} sx={{ '& input': { p: 0 } }} /></td>
                        </TableRow>
                        <TableRow>
                            <Box component="td" sx={{ bgcolor: '#f0f0f0', fontWeight: 'bold' }}>수신</Box>
                            <td>내부결재</td>
                            <Box component="td" sx={{ bgcolor: '#f0f0f0', fontWeight: 'bold' }}>부서명</Box>
                            <td>사업본부</td>
                        </TableRow>
                        <TableRow>
                            <Box component="td" sx={{ bgcolor: '#f0f0f0', fontWeight: 'bold' }}>제목</Box>
                            <td colSpan={3}>
                                <TextField 
                                    variant="standard" 
                                    fullWidth 
                                    placeholder="기안 제목을 입력하세요"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    InputProps={{ disableUnderline: true, sx: { fontSize: '15px', fontWeight: 'bold' } }}
                                    sx={{ '& input': { p: 0 } }}
                                />
                            </td>
                        </TableRow>
                    </TableBody>
                </Table>

                {/* 3. Body Content */}
                <Box sx={{ border: '2px solid #000', flexGrow: 1, p: 2, display: 'flex', flexDirection: 'column' }}>
                    <Typography sx={{ fontWeight: 'bold', mb: 1 }}>[기안내용]</Typography>
                    <TextField
                        multiline
                        fullWidth
                        rows={10}
                        variant="standard"
                        placeholder="사유 및 상세 내용을 입력하세요..."
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        InputProps={{ disableUnderline: true }}
                        sx={{ mb: 4, '& textarea': { p: 1, fontSize: '14px', lineHeight: 1.6 } }}
                    />

                    <Divider sx={{ mb: 2, borderBottomWidth: 2, borderColor: '#000' }} />
                    <Typography sx={{ fontWeight: 'bold', mb: 1 }}>[발주내역]</Typography>
                    <Table size="small" sx={{ borderCollapse: 'collapse', '& td, & th': { border: '1px solid #000', p: 0.5, fontSize: '12px' } }}>
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f0f0f0' }}>
                                <th style={{ width: '15%' }}>일자</th>
                                <th style={{ width: '30%' }}>품명</th>
                                <th style={{ width: '20%' }}>규격</th>
                                <th style={{ width: '10%' }}>수량</th>
                                <th style={{ width: '20%' }}>금액</th>
                                <th className="idf-no-print" style={{ width: '5%' }}></th>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map((item, idx) => (
                                <TableRow key={idx}>
                                    <td><input type="date" value={item.date} onChange={(e) => handleItemChange(idx, 'date', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none' }} /></td>
                                    <td><input value={item.name} onChange={(e) => handleItemChange(idx, 'name', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none' }} /></td>
                                    <td><input value={item.spec} onChange={(e) => handleItemChange(idx, 'spec', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none' }} /></td>
                                    <td><input type="number" value={item.qty} onChange={(e) => handleItemChange(idx, 'qty', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                    <td><input type="number" value={item.amount} onChange={(e) => handleItemChange(idx, 'amount', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'right' }} /></td>
                                    <td className="idf-no-print" style={{ textAlign: 'center' }}>
                                        <IconButton size="small" onClick={() => handleRemoveItem(idx)}><Trash2 size={14} /></IconButton>
                                    </td>
                                </TableRow>
                            ))}
                            <TableRow className="idf-no-print">
                                <td colSpan={6} style={{ textAlign: 'center' }}>
                                    <Button size="small" startIcon={<Plus />} onClick={handleAddItem}>항목 추가</Button>
                                </td>
                            </TableRow>
                            <TableRow sx={{ bgcolor: '#f9f9f9', fontWeight: 'bold' }}>
                                <td colSpan={4} style={{ textAlign: 'center' }}>합 계</td>
                                <td style={{ textAlign: 'right' }}>{formatNumber(totalAmount)}</td>
                                <td className="idf-no-print"></td>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Box>

                {/* 4. Footer */}
                <Box sx={{ mt: 3 }}>
                    <Typography sx={{ fontSize: '13px' }}>
                        붙임: {attachments.length > 0 ? attachments.map(a => a.name || a.filename).join(', ') : '해당사항 없음'}
                    </Typography>
                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
                        <Typography sx={{ fontSize: '18px', fontWeight: '900', letterSpacing: '2px' }}>사업본부</Typography>
                    </Box>
                </Box>
            </Paper>

            {/* Attachments UI (No-Print) */}
            <Box className="idf-no-print" sx={{ mt: 4, width: '100%', maxWidth: '800px' }}>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <FileText size={20} /> 첨부파일 관리
                </Typography>
                <MultiFileUpload 
                    files={attachments} 
                    onChange={setAttachments} 
                    label="관련 증빙 서류 (영수증, 견적서 등)" 
                />
            </Box>
        </Box>
    );
};

export default InternalDraftForm;
