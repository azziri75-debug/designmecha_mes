import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';
import { useSSE } from '../hooks/useSSE';

const ApprovalBadgeContext = createContext({ waitingCount: 0, refresh: () => {} });

const POLL_INTERVAL = 5 * 60 * 1000; // 5분마다 폴링 (SSE 백업용)

export const ApprovalBadgeProvider = ({ children }) => {
    const { user } = useAuth();
    const [waitingCount, setWaitingCount] = useState(0);
    const timerRef = useRef(null);

    const fetchWaitingCount = useCallback(async () => {
        if (!user) {
            setWaitingCount(0);
            return;
        }
        try {
            const res = await api.get('/approval/stats');
            setWaitingCount(res.data?.waiting_for_me_count || 0);
        } catch (err) {
            // 조용히 실패 (로그인 전 등)
        }
    }, [user]);

    // SSE: 결재 이벤트 수신 시 즉시 배지 카운트 갱신
    useSSE((eventName) => {
        if (eventName === 'approval_updated') {
            fetchWaitingCount();
        }
    }, { enabled: !!user });

    // 폴링: SSE 연결 실패 시 백업 (5분 간격)
    useEffect(() => {
        fetchWaitingCount();
        timerRef.current = setInterval(fetchWaitingCount, POLL_INTERVAL);
        return () => clearInterval(timerRef.current);
    }, [fetchWaitingCount]);

    return (
        <ApprovalBadgeContext.Provider value={{ waitingCount, refresh: fetchWaitingCount }}>
            {children}
        </ApprovalBadgeContext.Provider>
    );
};

export const useApprovalBadge = () => useContext(ApprovalBadgeContext);

export default ApprovalBadgeContext;
