import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

const ApprovalBadgeContext = createContext({ waitingCount: 0, refresh: () => {} });

const POLL_INTERVAL = 60 * 1000; // 60초마다 갱신

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
