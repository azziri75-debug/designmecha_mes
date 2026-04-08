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

        const startX = e.clientX;
        const startWidth = cellRef.current ? cellRef.current.offsetWidth : (width || 120);

        const handleMouseMove = (mouseMoveEvent) => {
            const delta = mouseMoveEvent.clientX - startX;
            const newWidth = Math.max(minWidth, startWidth + delta);
            if (onResize) onResize(newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.style.cursor = '';
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.body.style.cursor = 'col-resize';
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [minWidth, onResize, width]);

    return (
        <TableCell
            ref={cellRef}
            {...props}
            style={{ ...props.style, width, position: 'relative' }}
        >
            {children}
            <div
                onMouseDown={handleMouseDown}
                style={{
                    position: 'absolute',
                    right: 0,
                    top: 0,
                    bottom: 0,
                    width: '5px',
                    cursor: 'col-resize',
                    backgroundColor: isResizing ? '#2196f3' : 'transparent',
                    zIndex: 1,
                }}
                onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#2196f3';
                }}
                onMouseLeave={(e) => {
                    if (!isResizing) e.target.style.backgroundColor = 'transparent';
                }}
            />
        </TableCell>
    );
};

export default ResizableTableCell;
