import { useState, useCallback, useEffect } from 'react';

/**
 * A custom hook to manage resizable table columns.
 * @param {Array<{id: string, label: string, minWidth: number, defaultWidth: number}>} initialColumns 
 * @returns {object} { columns, handleDragStart }
 */
export function useResizableColumns(initialColumns) {
    const [columns, setColumns] = useState(
        initialColumns.map(col => ({ ...col, width: col.defaultWidth || 100 }))
    );

    const [isDragging, setIsDragging] = useState(false);
    const [dragActiveCol, setDragActiveCol] = useState(null);
    const [startX, setStartX] = useState(0);
    const [startWidth, setStartWidth] = useState(0);

    const handleDragStart = useCallback((e, colId) => {
        e.preventDefault();
        e.stopPropagation();

        const column = columns.find(c => c.id === colId);
        if (!column) return;

        setIsDragging(true);
        setDragActiveCol(colId);
        setStartX(e.clientX || e.pageX);
        setStartWidth(column.width);

        // Add a class to body to prevent text selection while dragging
        document.body.classList.add('resizing');
    }, [columns]);

    const handleDragMove = useCallback((e) => {
        if (!isDragging || !dragActiveCol) return;

        const currentX = e.clientX || e.pageX;
        const diff = currentX - startX;

        setColumns(prev => prev.map(col => {
            if (col.id === dragActiveCol) {
                const newWidth = Math.max(col.minWidth || 50, startWidth + diff);
                return { ...col, width: newWidth };
            }
            return col;
        }));
    }, [isDragging, dragActiveCol, startX, startWidth]);

    const handleDragEnd = useCallback(() => {
        if (isDragging) {
            setIsDragging(false);
            setDragActiveCol(null);
            document.body.classList.remove('resizing');
        }
    }, [isDragging]);

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleDragMove);
            window.addEventListener('mouseup', handleDragEnd);
        } else {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        }

        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragEnd);
        };
    }, [isDragging, handleDragMove, handleDragEnd]);

    return { columns, handleDragStart };
}
