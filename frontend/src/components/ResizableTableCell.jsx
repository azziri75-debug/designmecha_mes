import React, { useState, useCallback, useRef } from 'react';
import { TableCell } from '@mui/material';

/**
 * ResizableTableCell (개선버전)
 * 
 * - onResize(newWidth): 기존과 동일 - 이 컬럼 너비만 업데이트
 * - onResizeWithNeighbor(delta): 우측 컬럼 연동 - `delta > 0`이면 이 컬럼 증가, 우측 컬럼 감소
 * 
 * 권장: useResizableColumns 훅과 함께 사용하세요.
 */
const ResizableTableCell = ({ width, minWidth = 50, onResize, children, ...props }) => {
    const [isResizing, setIsResizing] = useState(false);
    const cellRef = useRef(null);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        document.body.classList.add('resizing');

        const startX = e.clientX;
        const startWidth = cellRef.current ? cellRef.current.offsetWidth : (typeof width === 'number' ? width : 120);

        // 바로 오른쪽 셀을 찾습니다.
        const nextCell = cellRef.current ? cellRef.current.nextElementSibling : null;
        const nextStartWidth = nextCell ? nextCell.offsetWidth : null;

        const handleMouseMove = (mouseMoveEvent) => {
            const delta = mouseMoveEvent.clientX - startX;
            const newLeft = Math.max(minWidth, startWidth + delta);
            const actualDelta = newLeft - startWidth;

            // 현재 셀 스타일 즉시 업데이트
            if (cellRef.current) {
                const widthPx = `${newLeft}px`;
                cellRef.current.style.width = widthPx;
                cellRef.current.style.minWidth = widthPx;
                cellRef.current.style.maxWidth = widthPx;
            }

            // 오른쪽 셀도 같이 조정 (상호작용)
            if (nextCell && nextStartWidth !== null) {
                const newRight = Math.max(minWidth, nextStartWidth - actualDelta);
                const rightPx = `${newRight}px`;
                nextCell.style.width = rightPx;
                nextCell.style.minWidth = rightPx;
                nextCell.style.maxWidth = rightPx;
            }
        };

        const handleMouseUp = (mouseUpEvent) => {
            setIsResizing(false);
            document.body.classList.remove('resizing');
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            // 최종 너비를 부모 상태에 반영
            if (onResize && cellRef.current) {
                onResize(cellRef.current.offsetWidth);
            }
        };

        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [minWidth, onResize, width]);

    return (
        <TableCell
            ref={cellRef}
            {...props}
            style={{ 
                ...props.style, 
                width: width ? `${width}px` : undefined,
                minWidth: width ? `${width}px` : undefined,
                maxWidth: width ? `${width}px` : undefined,
                position: 'relative',
                boxSizing: 'border-box'
            }}
        >
            {children}
            <div
                onMouseDown={handleMouseDown}
                style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '6px',
                    cursor: 'col-resize',
                    zIndex: 10,
                    backgroundColor: isResizing ? '#2196f3' : 'transparent',
                }}
                onMouseEnter={(e) => {
                    if (!isResizing) e.target.style.backgroundColor = 'rgba(33, 150, 243, 0.3)';
                }}
                onMouseLeave={(e) => {
                    if (!isResizing) e.target.style.backgroundColor = 'transparent';
                }}
            />
        </TableCell>
    );
};

export default ResizableTableCell;
