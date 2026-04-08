import React, { useRef, useCallback, useEffect } from 'react';
import { cn } from '../lib/utils';

/**
 * ResizableTable
 *
 * 컬럼 너비 리사이즈가 가능한 테이블 래퍼입니다.
 * - 전체 테이블 너비는 고정 (tableLayout: fixed)
 * - 드래그한 컬럼이 넓어지면 바로 우측 컬럼이 같은 양만큼 좁아집니다.
 * - 마지막 컬럼에는 핸들이 없습니다.
 *
 * 사용 예시:
 *   <ResizableTable
 *     columns={[
 *       { key: 'date',    label: '날짜',   width: 100 },
 *       { key: 'name',    label: '이름',   width: 200 },
 *       { key: 'status',  label: '상태',   width: 120 },
 *       { key: 'actions', label: '관리',   width: 80, noResize: true },
 *     ]}
 *     className="w-full text-left text-sm"
 *     theadClassName="bg-gray-900/50 text-gray-200"
 *     thClassName="px-4 py-3 font-semibold text-xs uppercase tracking-wider"
 *   >
 *     {rows.map(row => (
 *       <tr key={row.id}>
 *         <td>{row.date}</td>
 *         <td>{row.name}</td>
 *         <td>{row.status}</td>
 *         <td>{row.actions}</td>
 *       </tr>
 *     ))}
 *   </ResizableTable>
 */

const MIN_WIDTH = 50;

const ResizableTable = ({
    columns,
    children,
    className,
    theadClassName,
    thClassName,
    tbodyClassName,
    style,
    tableRef: externalTableRef,
    onResizeEnd, // 추가: 리사이징 완료 시 콜백
}) => {
    // 컬럼 너비를 ref로 관리하여 리렌더 없이 DOM을 직접 제어
    const colRefs = useRef({}); // { key: colElement }
    const widthsRef = useRef({}); // { key: number(px) }

    // 초기 및 업데이트 너비 설정
    useEffect(() => {
        columns.forEach(col => {
            widthsRef.current[col.key] = col.width || 120;
            if (colRefs.current[col.key]) {
                colRefs.current[col.key].style.width = `${widthsRef.current[col.key]}px`;
            }
        });
    }, [columns]);

    const handleMouseDown = useCallback((leftKey, rightKey) => (e) => {
        e.preventDefault();
        e.stopPropagation();

        const startX = e.clientX;
        const leftStart = widthsRef.current[leftKey] || 120;
        const rightStart = widthsRef.current[rightKey] || 120;

        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        document.body.classList.add('resizing');

        const onMouseMove = (me) => {
            const delta = me.clientX - startX;
            const newLeft = Math.max(MIN_WIDTH, leftStart + delta);
            const actualDelta = newLeft - leftStart;
            const newRight = Math.max(MIN_WIDTH, rightStart - actualDelta);

            if (newLeft >= MIN_WIDTH && newRight >= MIN_WIDTH) {
                widthsRef.current[leftKey] = newLeft;
                widthsRef.current[rightKey] = newRight;

                if (colRefs.current[leftKey]) {
                    colRefs.current[leftKey].style.width = `${newLeft}px`;
                }
                if (colRefs.current[rightKey]) {
                    colRefs.current[rightKey].style.width = `${newRight}px`;
                }
            }
        };

        const onMouseUp = () => {
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            document.body.classList.remove('resizing');
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);

            // 최종 결과를 부모에게 전달 (필요 시)
            if (onResizeEnd) {
                onResizeEnd({
                    leftKey, 
                    newLeft: widthsRef.current[leftKey],
                    rightKey,
                    newRight: widthsRef.current[rightKey]
                });
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }, [onResizeEnd]);

    return (
        <table
            ref={externalTableRef}
            className={cn('w-full', className)}
            style={{ tableLayout: 'fixed', ...style }}
        >
            <colgroup>
                {columns.map(col => (
                    <col
                        key={col.key}
                        ref={el => { if (el) colRefs.current[col.key] = el; }}
                        style={{ width: `${widthsRef.current[col.key] || col.width || 120}px` }}
                    />
                ))}
            </colgroup>
            <thead className={theadClassName}>
                <tr>
                    {columns.map((col, i) => {
                        const isLast = i === columns.length - 1;
                        const nextCol = !isLast ? columns[i + 1] : null;
                        const canResize = !col.noResize && !isLast && nextCol && !nextCol.noResize;

                        return (
                            <th
                                key={col.key}
                                className={cn(thClassName, col.thClassName)}
                                style={{ position: 'relative', overflow: 'hidden', ...col.thStyle }}
                            >
                                <span
                                    style={{
                                        display: 'block',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        paddingRight: canResize ? '8px' : undefined,
                                    }}
                                >
                                    {col.label}
                                </span>
                                {canResize && (
                                    <div
                                        onMouseDown={handleMouseDown(col.key, nextCol.key)}
                                        style={{
                                            position: 'absolute',
                                            right: 0,
                                            top: 0,
                                            bottom: 0,
                                            width: '6px',
                                            cursor: 'col-resize',
                                            zIndex: 10,
                                            background: 'transparent',
                                            transition: 'background 0.15s',
                                        }}
                                        onMouseEnter={ev => { ev.currentTarget.style.background = 'rgba(99,179,237,0.45)'; }}
                                        onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; }}
                                        title="드래그하여 너비 조절"
                                    />
                                )}
                            </th>
                        );
                    })}
                </tr>
            </thead>
            <tbody className={tbodyClassName}>
                {children}
            </tbody>
        </table>
    );
};

export default ResizableTable;
