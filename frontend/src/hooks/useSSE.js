import { useEffect, useRef, useCallback } from 'react';

/**
 * SSE (Server-Sent Events) 구독 훅
 *
 * 서버에서 실시간 이벤트를 수신하여 등록된 콜백을 자동 실행합니다.
 * 연결이 끊기면 지수 백오프(exponential backoff)로 자동 재연결합니다.
 *
 * @param {function} onEvent - (eventName: string, data: object) => void
 * @param {object} options
 * @param {boolean} options.enabled - SSE 연결 활성화 여부 (기본값: true)
 */
export function useSSE(onEvent, { enabled = true } = {}) {
    const esRef = useRef(null);
    const retryTimerRef = useRef(null);
    const retryCountRef = useRef(0);
    const onEventRef = useRef(onEvent);

    // onEvent 함수 참조를 최신으로 유지 (useEffect dependency 없이)
    useEffect(() => {
        onEventRef.current = onEvent;
    }, [onEvent]);

    const connect = useCallback(() => {
        if (!enabled) return;

        // 기존 연결 정리
        if (esRef.current) {
            esRef.current.close();
            esRef.current = null;
        }

        const es = new EventSource('/api/v1/events/stream');

        // 연결 성공
        es.addEventListener('connected', () => {
            console.log('[SSE] 연결 성공');
            retryCountRef.current = 0;
        });

        // 결재 업데이트 이벤트 (승인/반려/기안)
        es.addEventListener('approval_updated', (e) => {
            try {
                const data = JSON.parse(e.data || '{}');
                onEventRef.current?.('approval_updated', data);
            } catch {
                onEventRef.current?.('approval_updated', {});
            }
        });

        // 생산 업데이트 이벤트 (작업일지, 생산계획)
        es.addEventListener('production_updated', (e) => {
            try {
                const data = JSON.parse(e.data || '{}');
                onEventRef.current?.('production_updated', data);
            } catch {
                onEventRef.current?.('production_updated', {});
            }
        });

        // 재고 업데이트 이벤트
        es.addEventListener('inventory_updated', (e) => {
            try {
                const data = JSON.parse(e.data || '{}');
                onEventRef.current?.('inventory_updated', data);
            } catch {
                onEventRef.current?.('inventory_updated', {});
            }
        });

        // 근태 업데이트 이벤트 (출/퇴근)
        es.addEventListener('attendance_updated', (e) => {
            try {
                const data = JSON.parse(e.data || '{}');
                onEventRef.current?.('attendance_updated', data);
            } catch {
                onEventRef.current?.('attendance_updated', {});
            }
        });

        // keepalive ping (무시)
        es.addEventListener('ping', () => {});

        // 오류 시 자동 재연결 (지수 백오프: 3s, 6s, 12s, 최대 30s)
        es.onerror = () => {
            es.close();
            esRef.current = null;
            const delay = Math.min(3000 * Math.pow(2, retryCountRef.current), 30000);
            retryCountRef.current += 1;
            console.log(`[SSE] 연결 오류. ${delay / 1000}초 후 재연결...`);
            retryTimerRef.current = setTimeout(() => connect(), delay);
        };

        esRef.current = es;
    }, [enabled]);

    useEffect(() => {
        if (!enabled) return;

        connect();

        return () => {
            clearTimeout(retryTimerRef.current);
            esRef.current?.close();
            esRef.current = null;
        };
    }, [connect, enabled]);
}

export default useSSE;
