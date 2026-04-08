import { useState, useCallback, useRef } from 'react';

/**
 * useTableResize
 *
 * 테이블 전체 너비를 고정한 채로 컬럼 너비를 조절합니다.
 * 드래그한 컬럼이 넓어지면 바로 우측 컬럼이 좁아지고, 반대도 마찬가지입니다.
 *
 * @param {Object} initialWidths - { colKey: widthPx } 형태의 초기 너비 맵
 * @param {number} minWidth - 최소 컬럼 너비 (px), 기본값 40
 * @returns {{ widths, getResizeHandler }}
 *
 * 사용 예시:
 *   const cols = ['no', 'name', 'status', 'actions'];
 *   const { widths, getResizeHandler } = useTableResize({
 *     no: 60, name: 200, status: 100, actions: 80
 *   });
 *
 *   <table style={{ tableLayout: 'fixed', width: '100%' }}>
 *     <colgroup>
 *       {cols.map(k => <col key={k} style={{ width: widths[k] }} />)}
 *     </colgroup>
 *     <thead>
 *       <tr>
 *         {cols.map((k, i) => (
 *           <th key={k} style={{ position: 'relative' }}>
 *             {k}
 *             {i < cols.length - 1 && (
 *               <ResizeHandle onMouseDown={getResizeHandler(k, cols[i + 1])} />
 *             )}
 *           </th>
 *         ))}
 *       </tr>
 *     </thead>
 *   </table>
 */
export function useTableResize(initialWidths, minWidth = 40) {
    const [widths, setWidths] = useState(() => {
        const result = {};
        for (const [k, v] of Object.entries(initialWidths)) {
            result[k] = typeof v === 'number' ? `${v}px` : v;
        }
        return result;
    });

    // startX와 시작 너비를 ref로 추적 (리렌더 없이)
    const dragState = useRef(null);

    /**
     * getResizeHandler(leftKey, rightKey)
     * <th>의 오른쪽 경계에 붙어 있는 핸들의 onMouseDown에 전달합니다.
     * leftKey 컬럼을 넓히면 rightKey 컬럼이 같은 양만큼 좁아집니다.
     */
    const getResizeHandler = useCallback((leftKey, rightKey) => (e) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;

        // 현재 px 값을 파싱
        const parseW = (v) => parseInt(String(v).replace('px', ''), 10) || 0;

        setWidths(prev => {
            dragState.current = {
                startX,
                leftStart: parseW(prev[leftKey]),
                rightStart: parseW(prev[rightKey]),
            };
            return prev; // 상태 변경 없이 ref만 초기화
        });

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        const onMouseMove = (me) => {
            if (!dragState.current) return;
            const { startX: sx, leftStart, rightStart } = dragState.current;
            const delta = me.clientX - sx;

            const newLeft = Math.max(minWidth, leftStart + delta);
            const newRight = Math.max(minWidth, rightStart - delta);

            // 양쪽 모두 최솟값 이상일 때만 업데이트
            if (newLeft >= minWidth && newRight >= minWidth) {
                setWidths(prev => ({
                    ...prev,
                    [leftKey]: `${newLeft}px`,
                    [rightKey]: `${newRight}px`,
                }));
            }
        };

        const onMouseUp = () => {
            dragState.current = null;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [minWidth]);

    return { widths, getResizeHandler };
}

/**
 * ResizeHandle - 컬럼 경계에 위치하는 드래그 핸들 UI
 * useTableResize와 함께 사용합니다.
 */
export function ResizeHandle({ onMouseDown, disabled = false }) {
    if (disabled) return null;
    return (
        <div
            onMouseDown={onMouseDown}
            style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: '6px',
                cursor: 'col-resize',
                zIndex: 10,
                // 시각적 힌트
                background: 'transparent',
                transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(99,179,237,0.5)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
            title="드래그하여 너비 조절"
        />
    );
}
