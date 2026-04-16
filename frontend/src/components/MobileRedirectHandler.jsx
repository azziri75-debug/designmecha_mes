import React, { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * MobileRedirectHandler
 * 
 * 알림 클릭 등을 통해 데스크탑 전용 URL(/approval, /attendance 등)로 접근했을 때,
 * 모바일 기기라면 해당하는 모바일 최적화 경로로 자동 리다이렉트합니다.
 */
const MobileRedirectHandler = () => {
    const navigate = useNavigate();
    const location = useLocation();

    useEffect(() => {
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        
        if (isMobile) {
            // 결재 페이지 접근 시 모바일 결재 탭(tab=2)으로 이동
            if (location.pathname === '/approval' || location.pathname === '/approval/draft') {
                navigate('/mobile/work-logs?tab=2', { replace: true });
            }
            
            // 근태 관리 페이지 접근 시 모바일 근태 페이지로 이동
            if (location.pathname === '/attendance') {
                navigate('/mobile/attendance', { replace: true });
            }

            // 대시보드 접근 시 모바일 홈(생산현황)으로 이동
            if (location.pathname === '/' || location.pathname === '/dashboard') {
                navigate('/mobile/work-logs?tab=0', { replace: true });
            }
        }
    }, [location.pathname, navigate]);

    return null; // UI를 렌더링하지 않음
};

export default MobileRedirectHandler;
