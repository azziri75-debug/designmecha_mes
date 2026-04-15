import React from 'react';
import { Box, Table, TableBody, TableRow, Typography } from '@mui/material';
import { getImageUrl, safeParseJSON } from '../lib/utils';
import api from '../lib/api';

const ApprovalGrid = ({ documentData, currentUser, docType, defaultSteps = [] }) => {
    // 1. Author (기안자) info
    const author = documentData?.author || currentUser;
    const createdAt = documentData?.created_at || new Date().toISOString();
    
    // 2. Approver steps (dynamic or forced minimum)
    let baseSteps = documentData?.steps || [];
    const [fallbackSteps, setFallbackSteps] = React.useState([]);
    const [loadingDefault, setLoadingDefault] = React.useState(false);

    React.useEffect(() => {
        // Fetch default lines if no document data exists OR if the document exists but has zero steps (draft)
        if (docType && (!documentData || !documentData.steps || documentData.steps.length === 0)) {
            fetchDefaultLines();
        }
    }, [documentData, docType]);

    const fetchDefaultLines = async () => {
        setLoadingDefault(true);
        try {
            const res = await api.get(`/approval/lines?doc_type=${docType}`);
            const steps = (res.data || []).sort((a,b) => a.sequence - b.sequence).map(line => ({
                approver_id: line.approver_id,
                // [FIX] approver 객체가 있으면 실제 role, 없으면 line의 role 필드 사용
                role: line.approver?.role || line.role || '결재',
                approver: line.approver || null,
                status: 'PENDING'
            }));
            setFallbackSteps(steps);
        } catch (err) {
            console.error('Failed to fetch default approval lines', err);
        } finally {
            setLoadingDefault(false);
        }
    };

    // If no steps and docType provided, use fetched fallbacks
    if (baseSteps.length === 0) {
        if (fallbackSteps.length > 0) {
            baseSteps = fallbackSteps;
        } else if (defaultSteps.length > 0) {
            baseSteps = defaultSteps.map(role => ({ role, status: 'PENDING' }));
        }
    }
    
    // [Bug #4] 중복 제거 및 직급 정렬 로직 추가
    const RANK_MAP = {
        "사원": 1, "연구원": 1, "대리": 2, "과장": 3, "차장": 4, "부장": 5, "이사": 6, "대표이사": 7, "대표": 7
    };

    // (1) 실제 데이터에서 중복 제거 (approver_id 기준)
    const seenIds = new Set();
    let uniqueSteps = baseSteps.filter(step => {
        if (!step.approver_id) return true; // placeholder 등은 통과
        if (seenIds.has(step.approver_id)) return false;
        seenIds.add(step.approver_id);
        return true;
    });

    // (2) 정렬: sequence(순번) 기준 우선, 직급(Rank)은 보조 정렬
    uniqueSteps.sort((a, b) => {
        // sequence가 있으면 최우선
        if (a.sequence !== b.sequence) {
            return (a.sequence || 0) - (b.sequence || 0);
        }
        // sequence가 같거나 없는 경우 직급 기준
        const rankA = RANK_MAP[a.approver?.role] || RANK_MAP[a.role] || 0;
        const rankB = RANK_MAP[b.approver?.role] || RANK_MAP[b.role] || 0;
        return rankA - rankB;
    });

    const steps = [...uniqueSteps];
    
    console.log("렌더링되는 결재선 데이터:", steps);

    const getImgUrl = (img) => {
        if (!img) return null;
        let url = "";
        if (typeof img === 'string') {
            url = safeParseJSON(img, { url: img }).url;
        } else if (img.url) {
            url = img.url;
        } else if (Array.isArray(img) && img.length > 0) {
            url = img[0].url;
        }

        if (!url) return null;
        return getImageUrl(url);
    };

    const getStatusMarker = (step, isAuthor = false) => {
        if (isAuthor) {
            const stampUrl = getImgUrl(author?.stamp_image);
            return (
                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                    {stampUrl ? (
                        <img 
                            src={stampUrl} 
                            alt="Stamp" 
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'contain', 
                                maxWidth: '48px',
                                maxHeight: '48px',
                                mixBlendMode: 'multiply'
                            }} 
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                    ) : (
                        <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '13px' }}>{author?.name}</Typography>
                    )}
                </Box>
            );
        }

        if (step?.status === 'APPROVED') {
            const stampUrl = getImgUrl(step.approver?.stamp_image);
            return (
                <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {stampUrl ? (
                        <img 
                            src={stampUrl} 
                            alt="Stamp" 
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'contain', 
                                maxWidth: '48px',
                                maxHeight: '48px',
                                mixBlendMode: 'multiply'
                            }} 
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                    ) : (
                        <>
                            <Typography variant="caption" sx={{ color: 'blue', fontWeight: 'bold', fontSize: '11px', zIndex: 1 }}>승인</Typography>
                            <Box sx={{ 
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                width: '38px', height: '38px', border: '1.2px solid rgba(0,0,255,0.3)', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5
                            }}>
                                <Typography sx={{ color: 'blue', fontSize: '10px', fontWeight: 'bold' }}>인</Typography>
                            </Box>
                        </>
                    )}
                </Box>
            );
        }

        if (step?.status === 'REJECTED') {
            return (
                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography sx={{ color: 'red', fontWeight: 'bold', fontSize: '15px', border: '2px solid red', px: 0.5, py: 0.2, borderRadius: '4px', transform: 'rotate(-15deg)' }}>반 려</Typography>
                </Box>
            );
        }
        
        return null;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        return dateStr.split('T')[0].replace(/-/g, '.');
    };

    if (loadingDefault && steps.length === 0) {
        return <Box sx={{ fontSize: '12px', color: 'text.secondary', textAlign: 'right', p: 1 }}>결재선 불러오는 중...</Box>;
    }

    // Calculate columns: 1 (Author) + N (Steps)
    const totalCols = steps.length + 1;
    // Reduced width per column (e.g., 55px per column)
    const gridWidth = 55 * totalCols; 

    return (
        <Table size="small" sx={{ 
            width: `${gridWidth}px`, 
            borderCollapse: 'collapse',
            mr: 0,
            ml: 'auto',
            border: '2px solid #000',
            '& td': { border: '1px solid #000', p: 0, textAlign: 'center', fontSize: '11px' } 
        }}>
            <TableBody>
                {/* 1. Header Row (Roles) */}
                <TableRow sx={{ height: '22px' }}>
                    <Box component="td" sx={{ width: `${100/totalCols}%`, bgcolor: '#f1f3f5', fontWeight: 'bold', fontSize: '10px' }}>기안자</Box>
                    {steps.map((step, i) => (
                        <Box key={i} component="td" sx={{ width: `${100/totalCols}%`, bgcolor: '#f1f3f5', fontWeight: 'bold', fontSize: '10px' }}>
                            {/* [FIX] approver 객체의 role → step.role 순서로 fallback */}
                            {step.approver?.role || step.role || '결재'}
                        </Box>
                    ))}
                </TableRow>

                {/* 2. Stamp/Signature Row */}
                <TableRow sx={{ height: '65px' }}>
                    <Box component="td">{getStatusMarker(null, true)}</Box>
                    {steps.map((step, i) => (
                        <Box key={i} component="td">{getStatusMarker(step)}</Box>
                    ))}
                </TableRow>

                {/* 3. Date Row */}
                <TableRow sx={{ height: '20px' }}>
                    <Box component="td" sx={{ fontSize: '8px !important' }}>{formatDate(createdAt)}</Box>
                    {steps.map((step, i) => (
                        <Box key={i} component="td" sx={{ fontSize: '8px !important' }}>
                            {step.status === 'APPROVED' ? formatDate(step.processed_at) : ''}
                        </Box>
                    ))}
                </TableRow>
            </TableBody>
        </Table>
    );
};

export default ApprovalGrid;
