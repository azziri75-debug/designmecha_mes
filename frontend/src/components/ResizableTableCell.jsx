import React, { useState, useCallback } from 'react';
import { TableCell } from '@mui/material';

const ResizableTableCell = ({ width, minWidth = 50, onResize, children, ...props }) => {
    const [isResizing, setIsResizing] = useState(false);
    const cellRef = React.useRef(null);

    const handleMouseDown = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);

        const startX = e.pageX;
        const startWidth = cellRef.current.offsetWidth;

        const handleMouseMove = (mouseMoveEvent) => {
            const newWidth = Math.max(minWidth, startWidth + (mouseMoveEvent.pageX - startX));
            if (onResize) onResize(newWidth);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }, [minWidth, onResize]);

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
