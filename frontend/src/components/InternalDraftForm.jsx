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
                    fontFamily: '"Malgun Gothic", "Dotum", sans-serif',
                    color: '#000',
                    lineHeight: 1.5,
                    overflow: 'hidden'
                }}
            >
                {/* 1. Header Area */}
                <Box sx={{ textAlign: 'center', mb: 1 }}>
                    <Box sx={{ 
                        border: '1px solid #777', 
                        display: 'inline-block', 
                        px: 1, py: 0.2, 
                        fontSize: '11px',
                        letterSpacing: '1px',
                        mb: 0.5
                    }}>
                        전문가정신과 주인의식으로 하나되는 DM가족
                    </Box>
                    <Typography sx={{ fontSize: '24px', fontWeight: 'bold', mb: 1, letterSpacing: '2px' }}>
                        주식회사 디자인메카
                    </Typography>
                    <Box sx={{ height: '3px', borderTop: '1px solid #000', borderBottom: '1px solid #000', mb: 3 }} />
                </Box>

                {/* 2. Top Section: Doc Info & Approval Grid */}
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 4, alignItems: 'flex-start' }}>
                    {/* Left: Document Info */}
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, pt: 1 }}>
                        <Typography sx={{ fontSize: '13px', display: 'flex' }}>
                            <Box component="span" sx={{ width: '80px' }}>문서번호 :</Box> {docNo}
                        </Typography>
                        <Typography sx={{ fontSize: '13px', display: 'flex' }}>
                            <Box component="span" sx={{ width: '80px' }}>시행일자 :</Box> {draftDate.replace(/-/g, '. ')}.
                        </Typography>
                        <Typography sx={{ fontSize: '13px', display: 'flex' }}>
                            <Box component="span" sx={{ width: '80px' }}>수&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;신 :</Box> 내부결재
                        </Typography>
                    </Box>

                    {/* Right: Approval Grid (Exact PDF Layout) */}
                    <Table size="small" sx={{ 
                        width: '320px', 
                        borderCollapse: 'collapse',
                        '& td': { border: '1px solid #000', p: 0, textAlign: 'center', fontSize: '12px' } 
                    }}>
                        <TableBody>
                            <TableRow sx={{ height: '30px' }}>
                                <Box component="td" sx={{ width: '60px', bgcolor: '#fff' }}>부 장</Box>
                                <td rowSpan={2} style={{ width: '100px', fontSize: '14px' }}>
                                    {getStatusMarker(2)}
                                    {!documentData?.steps?.find(s => s.sequence === 2) && '/'}
                                </td>
                                <Box component="td" sx={{ width: '80px' }}>이 사</Box>
                                <Box component="td" sx={{ width: '80px' }}>대표이사</Box>
                            </TableRow>
                            <TableRow sx={{ height: '30px' }}>
                                <Box component="td" sx={{ bgcolor: '#fff' }}>기안자</Box>
                                <td>{getStatusMarker(3)}</td>
                                <td>{getStatusMarker(4)}</td>
                            </TableRow>
                            <TableRow sx={{ height: '30px' }}>
                                <Box component="td" sx={{ bgcolor: '#fff' }}>기안일</Box>
                                <td>{draftDate.replace(/-/g, '. ')}.</td>
                                <Box component="td" sx={{ bgcolor: '#fff' }}>부서명</Box>
                                <td>사업본부</td>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Box>

                {/* 3. Title Section */}
                <Box sx={{ borderTop: '2px solid #000', borderBottom: '1px solid #000', py: 1, mb: 3, px: 1 }}>
                    <Typography sx={{ fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                        제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목 :&nbsp;
                        <TextField 
                            variant="standard" 
                            fullWidth 
                            placeholder="제목을 입력하세요"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            InputProps={{ disableUnderline: true, sx: { fontSize: '15px', fontWeight: 'bold' } }}
                            sx={{ '& input': { p: 0 } }}
                        />
                    </Typography>
                </Box>

                {/* 4. Content Area */}
                <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    <Typography sx={{ fontSize: '14px', px: 2, textIndent: '30px', mb: 2 }}>
                        아래와 같이 납품을 위한 발주를 하고자 하오니 재가하여 주시기 바랍니다.
                    </Typography>
                    <Typography align="center" sx={{ fontSize: '14px', mb: 2, fontWeight: 'bold' }}>= 아&nbsp;&nbsp;&nbsp;&nbsp;래 =</Typography>
                    
                    <Box sx={{ px: 2, mb: 2 }}>
                        <Typography sx={{ fontSize: '14px', mb: 1 }}>1. 업&nbsp;&nbsp;&nbsp;&nbsp;체 : (주)디자인메카</Typography>
                        <Typography sx={{ fontSize: '14px', mb: 1 }}>2. 발주내역 :</Typography>
                        
                        <Table size="small" sx={{ 
                            borderCollapse: 'collapse', 
                            '& td, & th': { border: '1px solid #000', p: 0.5, fontSize: '12px', textAlign: 'center' } 
                        }}>
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#fff' }}>
                                    <th style={{ width: '15%' }}>일자</th>
                                    <th style={{ width: '30%' }}>품명</th>
                                    <th style={{ width: '25%' }}>규격</th>
                                    <th style={{ width: '10%' }}>수량</th>
                                    <th style={{ width: '20%' }}>금액 (원)</th>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {items.map((item, idx) => (
                                    <TableRow key={idx}>
                                        <td><input type="text" value={item.date.slice(5).replace('-', '/')} onChange={(e) => handleItemChange(idx, 'date', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                        <td><input value={item.name} onChange={(e) => handleItemChange(idx, 'name', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                        <td><input value={item.spec} onChange={(e) => handleItemChange(idx, 'spec', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                        <td><input type="number" value={item.qty} onChange={(e) => handleItemChange(idx, 'qty', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center' }} /></td>
                                        <td><input type="number" value={item.amount} onChange={(e) => handleItemChange(idx, 'amount', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'right' }} /></td>
                                    </TableRow>
                                ))}
                                <TableRow sx={{ fontWeight: 'bold' }}>
                                    <td colSpan={3}>계</td>
                                    <td>{items.reduce((s, i) => s + (Number(i.qty) || 0), 0)}</td>
                                    <td style={{ textAlign: 'right' }}>{formatNumber(totalAmount)}</td>
                                </TableRow>
                            </TableBody>
                        </Table>
                        
                        <Typography sx={{ fontSize: '14px', mt: 2 }}>
                            3. 총 금액 : {formatNumber(totalAmount)} 원 (부가세별도)
                        </Typography>
                    </Box>

                    <Box sx={{ mt: 'auto', mb: 8, px: 2 }}>
                        <Typography sx={{ fontSize: '13px' }}>
                            붙임 : {attachments.length > 0 ? attachments.map(a => a.name || a.filename).join(', ') : '해당사항 없음'}
                        </Typography>
                    </Box>

                    {/* Footer Department */}
                    <Box sx={{ textAlign: 'center', mb: 4 }}>
                        <Typography sx={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '8px' }}>사 업 본 부</Typography>
                    </Box>
                </Box>
            </Paper>

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
