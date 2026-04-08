import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';

/**
 * ResizableTh (개선버전)
 * 
 * 드래그 시 본 th는 늘어나고, 바로 오른쪽 th는 같은 양만큼 줄어듭니다.
 * 테이블 전체 너비는 고정됩니다.
 */
const ResizableTh = ({ children, className, initialWidth, minWidth = 50, style, ...props }) => {
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

        const startX = e.clientX;
        const startWidth = thRef.current ? thRef.current.offsetWidth : (typeof width === 'number' ? width : 120);

        // 바로 오른쪽 th를 찾습니다.
        const nextTh = thRef.current ? thRef.current.nextElementSibling : null;
        const nextStartWidth = nextTh ? nextTh.offsetWidth : null;

        const handleMouseMove = (me) => {
            const delta = me.clientX - startX;
            const newLeft = Math.max(minWidth, startWidth + delta);
            const actualDelta = newLeft - startWidth;

            // 이 th 크기 업데이트
            if (thRef.current) {
                thRef.current.style.width = `${newLeft}px`;
                thRef.current.style.minWidth = `${newLeft}px`;
                thRef.current.style.maxWidth = `${newLeft}px`;
            }

            // 오른쪽 th도 같이 조정 (좌↑ → 우↓)
            if (nextTh && nextStartWidth !== null) {
                const newRight = Math.max(minWidth, nextStartWidth - actualDelta);
                nextTh.style.width = `${newRight}px`;
                nextTh.style.minWidth = `${newRight}px`;
                nextTh.style.maxWidth = `${newRight}px`;
            }

            setWidth(newLeft);
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            document.body.classList.remove('resizing');
            document.body.style.cursor = '';
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        document.body.style.cursor = 'col-resize';
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    };

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
