import React from 'react';
import { Box, Table, TableBody, TableRow, Typography } from '@mui/material';

const ApprovalGrid = ({ documentData, currentUser }) => {
    const getStepByRole = (roleType) => {
        if (!documentData?.steps) return null;
        if (roleType === '부장') {
            return documentData.steps.find(s => 
                s.approver?.role === '부장' || 
                (s.approver?.role?.includes('부장') && !s.approver?.role?.includes('이사') && !s.approver?.role?.includes('대표'))
            );
        }
        if (roleType === '이사') {
            return documentData.steps.find(s => 
                (s.approver?.role === '이사' || s.approver?.role?.includes('이사')) && 
                !s.approver?.role?.includes('대표')
            );
        }
        if (roleType === '대표이사') {
            return documentData.steps.find(s => 
                s.approver?.role === '대표이사' || 
                s.approver?.role?.includes('대표')
            );
        }
        return null;
    };

    const getStatusMarker = (roleType) => {
        if (roleType === '기안자') {
            const author = documentData?.author || currentUser;
            return (
                <Box sx={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
                    {author?.stamp_image ? (
                        <img 
                            src={author.stamp_image.url} 
                            alt="Stamp" 
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'contain', 
                                transform: 'scale(1.3)',
                                mixBlendMode: 'multiply'
                            }} 
                        />
                    ) : (
                        <Typography variant="caption" sx={{ fontWeight: 'bold', fontSize: '14px' }}>{author?.name}</Typography>
                    )}
                </Box>
            );
        }

        const step = getStepByRole(roleType);
        
        if (step?.status === 'APPROVED') {
            return (
                <Box sx={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {step.approver?.stamp_image ? (
                        <img 
                            src={step.approver.stamp_image.url} 
                            alt="Stamp" 
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                objectFit: 'contain', 
                                transform: 'scale(1.3)',
                                mixBlendMode: 'multiply'
                            }} 
                        />
                    ) : (
                        <>
                            <Typography variant="caption" sx={{ color: 'blue', fontWeight: 'bold', fontSize: '11px' }}>승인</Typography>
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
                    <Typography sx={{ color: 'red', fontWeight: 'bold', fontSize: '16px', border: '2px solid red', px: 1, borderRadius: '4px', transform: 'rotate(-15deg)' }}>반 려</Typography>
                </Box>
            );
        }

        if (documentData?.id && !step && roleType !== '기안자') {
            return (
                <Box sx={{ 
                    width: '100%', height: '100%', position: 'relative',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute' }}>
                        <line x1="0" y1="100" x2="100" y2="0" stroke="#bbb" strokeWidth="1" />
                    </svg>
                </Box>
            );
        }
        
        return null;
    };

    const getApprovalDate = (roleType) => {
        if (roleType === '기안자') {
            const date = documentData?.created_at || new Date().toISOString();
            return date.split('T')[0].replace(/-/g, '.');
        }
        const step = getStepByRole(roleType);
        if (step?.status === 'APPROVED' && step.processed_at) {
            return step.processed_at.split('T')[0].replace(/-/g, '.');
        }
        return '';
    };

    return (
        <Table size="small" sx={{ 
            width: '320px', 
            borderCollapse: 'collapse',
            mr: 0,
            ml: 'auto',
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
                    <Box component="td" sx={{ p: '0 !important' }}>{getStatusMarker('기안자')}</Box>
                    <Box component="td" sx={{ p: '0 !important' }}>{getStatusMarker('부장')}</Box>
                    <Box component="td" sx={{ p: '0 !important' }}>{getStatusMarker('이사')}</Box>
                    <Box component="td" sx={{ p: '0 !important' }}>{getStatusMarker('대표이사')}</Box>
                </TableRow>
                <TableRow sx={{ height: '20px' }}>
                    <Box component="td" sx={{ fontSize: '9px !important' }}>{getApprovalDate('기안자')}</Box>
                    <Box component="td" sx={{ fontSize: '9px !important' }}>{getApprovalDate('부장')}</Box>
                    <Box component="td" sx={{ fontSize: '9px !important' }}>{getApprovalDate('이사')}</Box>
                    <Box component="td" sx={{ fontSize: '9px !important' }}>{getApprovalDate('대표이사')}</Box>
                </TableRow>
            </TableBody>
        </Table>
    );
};

export default ApprovalGrid;
