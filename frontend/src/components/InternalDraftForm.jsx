import React, { useState, useRef, useEffect } from 'react';
import {
    Box, Button, TextField, Table, TableBody, TableCell, TableHead, TableRow,
    Typography, Paper, Radio, RadioGroup, FormControlLabel, FormControl
} from '@mui/material';
import { Printer, FileDown, Plus, Trash2, FileText, Send } from 'lucide-react';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
                background: white !important;
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
            
            /* Remove borders/backgrounds of inputs in print */
            input, textarea {
                border: none !important;
                background: transparent !important;
                padding: 0 !important;
                resize: none !important;
                overflow: hidden !important;
            }
            * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
    `;
    document.head.appendChild(style);
};
const removePrintCSS = () => {
    const el = document.getElementById(PRINT_STYLE_ID);
    if (el) el.remove();
};

const InternalDraftForm = ({ documentData: initialData, onSave, onCancel }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const docIdFromUrl = searchParams.get('id');

    const [documentData, setDocumentData] = useState(initialData || null);
    const [draftType, setDraftType] = useState('PAYMENT'); // PAYMENT, GENERAL
    const [title, setTitle] = useState('');
    const [content, setContent] = useState(''); // Only used in GENERAL
    const [introText, setIntroText] = useState('아래와 같이 납품을 위한 발주를 하고자 하오니 재가하여 주시기 바랍니다.');
    const [companyName, setCompanyName] = useState('(주)디자인메카');
    const [docNo, setDocNo] = useState('');
    const [draftDate, setDraftDate] = useState(new Date().toISOString().split('T')[0]);
    const [items, setItems] = useState([{ date: '', name: '', spec: '', qty: 0, amount: 0 }]);
    const [attachments, setAttachments] = useState([]);
    const [attachmentsText, setAttachmentsText] = useState('해당사항 없음');
    
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    
    const printRef = useRef();

    useEffect(() => {
        injectPrintCSS();
        return () => removePrintCSS();
    }, []);

    useEffect(() => {
        if (docIdFromUrl) {
            fetchDocument(docIdFromUrl);
        }
    }, [docIdFromUrl]);

    useEffect(() => {
        if (documentData) {
            const c = documentData.content || {};
            setDraftType(c.draft_type || 'PAYMENT');
            setTitle(documentData.title || '');
            setContent(c.reason || '');
            setIntroText(c.intro_text || '아래와 같이 납품을 위한 발주를 하고자 하오니 재가하여 주시기 바랍니다.');
            setCompanyName(c.company_name || '(주)디자인메카');
            setDocNo(c.doc_no || `DM${new Date().getFullYear()}-H${Math.floor(Math.random()*1000).toString().padStart(3, '0')}`);
            setDraftDate(documentData.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]);
            setItems(c.items || []);
            setAttachments(documentData.attachments || []);
            setAttachmentsText(c.attachments_text || (documentData.attachments?.length > 0 ? '' : '해당사항 없음'));
        } else {
            setDocNo(`DM${new Date().getFullYear()}-H${Math.floor(Math.random()*1000).toString().padStart(3, '0')}`);
        }
    }, [documentData]);

    const fetchDocument = async (id) => {
        setIsLoading(true);
        try {
            const res = await api.get(`/approval/documents/${id}`);
            setDocumentData(res.data);
        } catch (err) {
            console.error(err);
            alert('문서를 불러오는데 실패했습니다.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddItem = () => {
        setItems([...items, { date: '', name: '', spec: '', qty: 0, amount: 0 }]);
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
                    draft_type: draftType,
                    reason: content,
                    intro_text: introText,
                    company_name: companyName,
                    doc_no: docNo,
                    items: items,
                    attachments_text: attachmentsText,
                    dept: '사업본부'
                },
                attachments_to_add: attachments.map(a => ({ filename: a.name || a.filename, url: a.url }))
            };

            if (documentData?.id) {
                await api.put(`/approval/documents/${documentData.id}`, payload);
            } else {
                await api.post('/approval/documents', payload);
            }
            if (onSave) onSave();
            else navigate('/approval');
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
                    <Typography variant="caption" sx={{ color: 'blue', fontWeight: 'bold', fontSize: '10px' }}>승인</Typography>
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
    const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);

    return (
        <Box sx={{ p: 4, bgcolor: '#f4f4f7', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Action Bar */}
            <Paper className="idf-no-print" sx={{ p: 3, mb: 3, width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: 2, position: 'sticky', top: 10, zIndex: 10 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', gap: 2 }}>
                        <Button variant="contained" startIcon={<Send />} onClick={handleSubmit} disabled={isSaving || (documentData && documentData.status !== 'PENDING' && documentData.status !== 'REJECTED')}>
                            {documentData?.id ? '수정하기' : '기안하기'}
                        </Button>
                        <Button variant="outlined" startIcon={<Printer />} onClick={handlePrint}>인쇄</Button>
                        <Button variant="outlined" startIcon={<FileDown />} onClick={handleDownloadPDF}>PDF 다운로드</Button>
                    </Box>
                    <Button color="inherit" onClick={() => (onCancel ? onCancel() : navigate('/approval'))}>닫기</Button>
                </Box>
                
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 3, pt: 1, borderTop: '1px solid #eee' }}>
                    <Typography sx={{ fontWeight: 'bold', color: '#666' }}>기안 종류:</Typography>
                    <RadioGroup row value={draftType} onChange={(e) => setDraftType(e.target.value)}>
                        <FormControlLabel value="GENERAL" control={<Radio size="small" />} label="일반기안" />
                        <FormControlLabel value="PAYMENT" control={<Radio size="small" />} label="대금지급기안" />
                    </RadioGroup>
                </Box>
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
                    boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
                    bgcolor: 'white',
                    fontFamily: '"Malgun Gothic", "Dotum", sans-serif',
                    color: '#000',
                    lineHeight: 1.5,
                    overflow: 'hidden',
                    position: 'relative'
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
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.2, pt: 1 }}>
                        <Typography sx={{ fontSize: '13px', display: 'flex' }}>
                            <Box component="span" sx={{ width: '70px', fontWeight: 'bold' }}>문서번호 :</Box> {docNo}
                        </Typography>
                        <Typography sx={{ fontSize: '13px', display: 'flex' }}>
                            <Box component="span" sx={{ width: '70px', fontWeight: 'bold' }}>시행일자 :</Box> {draftDate.replace(/-/g, '. ')}.
                        </Typography>
                        <Typography sx={{ fontSize: '13px', display: 'flex' }}>
                            <Box component="span" sx={{ width: '70px', fontWeight: 'bold' }}>수&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;신 :</Box> 내부결재
                        </Typography>
                    </Box>

                    {/* Right: Approval Grid (4 Columns) */}
                    <Table size="small" sx={{ 
                        width: '320px', 
                        borderCollapse: 'collapse',
                        '& td': { border: '1px solid #000', p: 0, textAlign: 'center', fontSize: '11px' } 
                    }}>
                        <TableBody>
                            <TableRow sx={{ height: '24px' }}>
                                <Box component="td" sx={{ width: '25%', bgcolor: '#f7f7f7' }}>기안자</Box>
                                <Box component="td" sx={{ width: '25%', bgcolor: '#f7f7f7' }}>부 장</Box>
                                <Box component="td" sx={{ width: '25%', bgcolor: '#f7f7f7' }}>이 사</Box>
                                <Box component="td" sx={{ width: '25%', bgcolor: '#f7f7f7' }}>대표이사</Box>
                            </TableRow>
                            <TableRow sx={{ height: '80px' }}>
                                <td>{getStatusMarker(1)}</td>
                                <td>{getStatusMarker(2)}</td>
                                <td>{getStatusMarker(3)}</td>
                                <td>{getStatusMarker(4)}</td>
                            </TableRow>
                        </TableBody>
                    </Table>
                </Box>

                {/* 3. Title Section */}
                <Box sx={{ borderTop: '2.5px solid #000', borderBottom: '1px solid #000', py: 1.2, mb: 3, px: 1.5 }}>
                    <Typography sx={{ fontSize: '16px', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                        제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목 :&nbsp;
                        <TextField 
                            variant="standard" 
                            fullWidth 
                            placeholder="제목을 입력하세요"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            InputProps={{ disableUnderline: true, sx: { fontSize: '16px', fontWeight: 'bold' } }}
                            sx={{ '& input': { p: 0 } }}
                        />
                    </Typography>
                </Box>

                {/* 4. Content Area */}
                <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
                    {draftType === 'GENERAL' ? (
                        <Box sx={{ px: 1, flexGrow: 1 }}>
                            <textarea
                                value={content}
                                onChange={(e) => setContent(e.target.value)}
                                placeholder="기안 내용을 입력하세요..."
                                style={{
                                    width: '100%',
                                    height: '100%',
                                    border: 'none',
                                    outline: 'none',
                                    fontSize: '14px',
                                    fontFamily: 'inherit',
                                    lineHeight: '1.8',
                                    resize: 'none',
                                    padding: '10px'
                                }}
                            />
                        </Box>
                    ) : (
                        <>
                            <Box sx={{ px: 1.5, mb: 2 }}>
                                <textarea
                                    value={introText}
                                    onChange={(e) => setIntroText(e.target.value)}
                                    rows={2}
                                    style={{
                                        width: '100%',
                                        border: 'none',
                                        outline: 'none',
                                        fontSize: '14px',
                                        fontFamily: 'inherit',
                                        textIndent: '30px',
                                        lineHeight: '1.6',
                                        resize: 'none'
                                    }}
                                />
                            </Box>
                            <Typography align="center" sx={{ fontSize: '15px', mb: 3, fontWeight: 'bold' }}>= 아&nbsp;&nbsp;&nbsp;&nbsp;래 =</Typography>
                            
                            <Box sx={{ px: 2, mb: 2 }}>
                                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1.5 }}>
                                    <Typography sx={{ fontSize: '14px', fontWeight: 'bold', width: '80px' }}>1. 업&nbsp;&nbsp;&nbsp;&nbsp;체 :</Typography>
                                    <TextField 
                                        variant="standard" 
                                        value={companyName}
                                        onChange={(e) => setCompanyName(e.target.value)}
                                        InputProps={{ disableUnderline: true, sx: { fontSize: '14px' } }}
                                        sx={{ flexGrow: 1, '& input': { p: 0 } }}
                                    />
                                </Box>
                                <Typography sx={{ fontSize: '14px', fontWeight: 'bold', mb: 1.5 }}>2. 발주내역 :</Typography>
                                
                                <Table size="small" sx={{ 
                                    borderCollapse: 'collapse', 
                                    '& td, & th': { border: '1px solid #000', p: 0.8, fontSize: '12px', textAlign: 'center' } 
                                }}>
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: '#f7f7f7' }}>
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
                                                <td><input type="text" value={item.date} onChange={(e) => handleItemChange(idx, 'date', e.target.value)} placeholder="00/00" style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center', fontSize: '12px' }} /></td>
                                                <td><input value={item.name} onChange={(e) => handleItemChange(idx, 'name', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center', fontSize: '12px' }} /></td>
                                                <td><input value={item.spec} onChange={(e) => handleItemChange(idx, 'spec', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center', fontSize: '12px' }} /></td>
                                                <td><input type="number" value={item.qty} onChange={(e) => handleItemChange(idx, 'qty', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'center', fontSize: '12px' }} /></td>
                                                <td><input type="number" value={item.amount} onChange={(e) => handleItemChange(idx, 'amount', e.target.value)} style={{ border: 'none', width: '100%', outline: 'none', textAlign: 'right', fontSize: '12px' }} /></td>
                                                <td className="idf-no-print" style={{ border: 'none', width: '30px', padding: 0 }}>
                                                    <IconButton size="small" color="error" onClick={() => handleRemoveItem(idx)}><Trash2 size={14} /></IconButton>
                                                </td>
                                            </TableRow>
                                        ))}
                                        <TableRow sx={{ fontWeight: 'bold', bgcolor: '#fafafa' }}>
                                            <td colSpan={3}>계</td>
                                            <td>{totalQty}</td>
                                            <td style={{ textAlign: 'right' }}>{formatNumber(totalAmount)}</td>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                                
                                <Box className="idf-no-print" sx={{ mt: 1, textAlign: 'left' }}>
                                    <Button size="small" startIcon={<Plus size={14} />} onClick={handleAddItem} sx={{ color: '#777' }}>행 추가</Button>
                                </Box>

                                <Box sx={{ display: 'flex', alignItems: 'center', mt: 3 }}>
                                    <Typography sx={{ fontSize: '14px', fontWeight: 'bold', width: '100px' }}>3. 총 금액 :</Typography>
                                    <Typography sx={{ fontSize: '14px', fontWeight: 'bold' }}>{formatNumber(totalAmount)} 원 (부가세별도)</Typography>
                                </Box>
                            </Box>
                        </>
                    )}

                    <Box sx={{ mt: 'auto', mb: 8, px: 2, display: 'flex', alignItems: 'flex-start' }}>
                        <Typography sx={{ fontSize: '14px', fontWeight: 'bold', whiteSpace: 'nowrap', pt: 0.2 }}>붙&nbsp;&nbsp;&nbsp;&nbsp;임 :&nbsp;</Typography>
                        <TextField 
                            variant="standard" 
                            fullWidth 
                            multiline
                            value={attachmentsText}
                            onChange={(e) => setAttachmentsText(e.target.value)}
                            placeholder="파일 설명을 입력하세요 (예: 견적서 1부)"
                            InputProps={{ disableUnderline: true, sx: { fontSize: '14px', lineHeight: '1.4' } }}
                            sx={{ '& textarea': { p: 0 } }}
                        />
                    </Box>

                    {/* Footer Department */}
                    <Box sx={{ textAlign: 'center', mb: 4 }}>
                        <Typography sx={{ fontSize: '24px', fontWeight: 'bold', letterSpacing: '8px' }}>사 업 본 부</Typography>
                    </Box>
                </Box>
            </Paper>

            {/* Attachments UI (No-Print) */}
            <Box className="idf-no-print" sx={{ mt: 4, width: '100%', maxWidth: '800px' }}>
                <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1, color: '#333' }}>
                    <FileText size={20} /> 첨부파일 업로드
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
