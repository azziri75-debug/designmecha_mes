import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';

const ResizableTh = ({ children, className, initialWidth, minWidth = 50, style, ...props }) => {
    // If an initial width like "20%" or "100px" is passed via className or props, 
    // we start with 'auto' unless explicitly provided to state.
    const [width, setWidth] = useState(initialWidth || 'auto');
    const [isResizing, setIsResizing] = useState(false);
    const thRef = useRef(null);

    // Initialize width on mount if it's 'auto' so we have a pixel baseline
    useEffect(() => {
        if (thRef.current && width === 'auto') {
            const rect = thRef.current.getBoundingClientRect();
            if (rect.width > 0) {
                setWidth(rect.width);
            }
        }
    }, []);

    const startResize = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        document.body.classList.add('resizing');
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isResizing || !thRef.current) return;
            const thRect = thRef.current.getBoundingClientRect();
            const newWidth = Math.max(minWidth, e.clientX - thRect.left);
            setWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (isResizing) {
                setIsResizing(false);
                document.body.classList.remove('resizing');
            }
        };

        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, minWidth]);

    return (
        <th
            ref={thRef}
            className={cn("table-header-resizable", className)}
            style={{
                width: width !== 'auto' ? `${width}px` : undefined,
                minWidth: width !== 'auto' ? `${width}px` : undefined,
                maxWidth: width !== 'auto' ? `${width}px` : undefined,
                ...style
            }}
            {...props}
        >
            {children}
            {/* The resize handle */}
            <div
                className={cn("table-header-resizer", isResizing && "active")}
                onMouseDown={startResize}
            />
        </th>
    );
};

export default ResizableTh;
