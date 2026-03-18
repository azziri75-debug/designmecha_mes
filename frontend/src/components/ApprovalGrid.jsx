import React from 'react';
import { Box, Table, TableBody, TableRow, Typography } from '@mui/material';

const ApprovalGrid = ({ documentData, currentUser }) => {
    // 1. Author (기안자) info
    const author = documentData?.author || currentUser;
    const createdAt = documentData?.created_at || new Date().toISOString();
    
    // 2. Approver steps (dynamic)
    const steps = documentData?.steps || [];
    console.log("렌더링되는 결재선 데이터:", steps);

    const getImgUrl = (img) => {
        if (!img) return null;
        let url = "";
        if (typeof img === 'string') {
            try { url = JSON.parse(img).url; } catch { url = img; }
        } else if (img.url) {
            url = img.url;
        } else if (Array.isArray(img) && img.length > 0) {
            url = img[0].url;
        }

        if (!url) return null;
        if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('/')) return url;
        // Fix for relative paths: ensure static prefix
        return `/api/v1/static/${url.replace(/^\//, '')}`;
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
                                maxWidth: '60px',
                                maxHeight: '60px',
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
                                maxWidth: '60px',
                                maxHeight: '60px',
                                mixBlendMode: 'multiply'
                            }} 
                            onError={(e) => { e.target.style.display = 'none'; }}
                        />
                    ) : (
                        <>
                            <Typography variant="caption" sx={{ color: 'blue', fontWeight: 'bold', fontSize: '11px', zIndex: 1 }}>승인</Typography>
                            <Box sx={{ 
                                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                                width: '45px', height: '45px', border: '1.5px solid rgba(0,0,255,0.3)', borderRadius: '50%',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.5
                            }}>
                                <Typography sx={{ color: 'blue', fontSize: '12px', fontWeight: 'bold' }}>인</Typography>
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

    // Calculate columns: 1 (Author) + N (Steps)
    const totalCols = 1 + steps.length;
    // Limit width to 320px or expand if many steps, but keep it professional
    const gridWidth = Math.max(80 * totalCols, 240); 

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
                <TableRow sx={{ height: '26px' }}>
                    <Box component="td" sx={{ width: `${100/totalCols}%`, bgcolor: '#f1f3f5', fontWeight: 'bold' }}>기안자</Box>
                    {steps.map((step, i) => (
                        <Box key={i} component="td" sx={{ width: `${100/totalCols}%`, bgcolor: '#f1f3f5', fontWeight: 'bold' }}>
                            {step.approver?.role || step.role || ''}
                        </Box>
                    ))}
                </TableRow>

                {/* 2. Stamp/Signature Row */}
                <TableRow sx={{ height: '80px' }}>
                    <Box component="td">{getStatusMarker(null, true)}</Box>
                    {steps.map((step, i) => (
                        <Box key={i} component="td">{getStatusMarker(step)}</Box>
                    ))}
                </TableRow>

                {/* 3. Date Row */}
                <TableRow sx={{ height: '22px' }}>
                    <Box component="td" sx={{ fontSize: '9px !important' }}>{formatDate(createdAt)}</Box>
                    {steps.map((step, i) => (
                        <Box key={i} component="td" sx={{ fontSize: '9px !important' }}>
                            {step.status === 'APPROVED' ? formatDate(step.processed_at) : ''}
                        </Box>
                    ))}
                </TableRow>
            </TableBody>
        </Table>
    );
};

export default ApprovalGrid;
