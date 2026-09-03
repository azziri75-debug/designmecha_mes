import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

const WorkOrderBadgeContext = createContext({ workOrderCount: 0, refresh: () => {} });

const POLL_INTERVAL = 3 * 60 * 1000; // 3분마다 폴링

export const WorkOrderBadgeProvider = ({ children }) => {
    const { user } = useAuth();
    const [workOrderCount, setWorkOrderCount] = useState(0);
    const timerRef = useRef(null);

    const fetchWorkOrderCount = useCallback(async () => {
        if (!user) {
            setWorkOrderCount(0);
            return;
        }
        try {
            const res = await api.get('/production/my-work-orders');
            setWorkOrderCount(Array.isArray(res.data) ? res.data.length : 0);
        } catch (err) {
            // 조용히 실패
        }
    }, [user]);

    useEffect(() => {
        fetchWorkOrderCount();
        timerRef.current = setInterval(fetchWorkOrderCount, POLL_INTERVAL);
        return () => clearInterval(timerRef.current);
    }, [fetchWorkOrderCount]);

    return (
        <WorkOrderBadgeContext.Provider value={{ workOrderCount, refresh: fetchWorkOrderCount }}>
            {children}
        </WorkOrderBadgeContext.Provider>
    );
};

export const useWorkOrderBadge = () => useContext(WorkOrderBadgeContext);

export default WorkOrderBadgeContext;
