import React, { useState, useEffect, useRef } from 'react';
import { cn } from '../lib/utils';

/**
 * Auto-fit Text Logic
 */
export const useAutoFit = (text, containerWidth, baseSize = 14, minSize = 6) => {
    const [fontSize, setFontSize] = useState(baseSize);

    useEffect(() => {
        if (!text || !containerWidth || containerWidth < 10) return;
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        let currentSize = baseSize;

        const measure = (size) => {
            const fontStr = `${size}px "Malgun Gothic", sans-serif`;
            context.font = fontStr;
            return context.measureText(text || "").width;
        };

        const target = containerWidth - 12;
        if (measure(currentSize) > target) {
            while (measure(currentSize) > target && currentSize > minSize) {
                currentSize -= 0.5;
            }
        } else {
            // Optional: grow back if possible? No, stay at base if fits.
            currentSize = baseSize;
            while (measure(currentSize) > target && currentSize > minSize) {
                currentSize -= 0.5;
            }
        }
        setFontSize(currentSize);
    }, [text, containerWidth, baseSize, minSize]);

    return fontSize;
};

export const EditableText = ({
    value,
    onChange,
    className,
    placeholder = "...",
    isHeader = false,
    autoFit = false,
    maxWidth = 0
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(value || "");
    const fittedSize = useAutoFit(text, maxWidth > 0 ? maxWidth : 1000, isHeader ? 24 : 14);

    useEffect(() => { setText(value || ""); }, [value]);

    const handleBlur = () => {
        setIsEditing(false);
        if (text !== value && onChange) onChange(text);
    };

    if (isEditing) {
        return (
            <input
                autoFocus
                className={cn("bg-blue-50 border border-blue-300 outline-none px-1 rounded w-full h-full", className)}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => { if (e.key === 'Enter') handleBlur(); }}
                style={autoFit ? { fontSize: fittedSize } : {}}
            />
        );
    }

    return (
        <div
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            className={cn(
                "cursor-text hover:bg-gray-100/50 rounded px-1 transition-colors min-h-[1.5em] flex items-center overflow-hidden whitespace-nowrap",
                !value && "text-gray-300 italic",
                className
            )}
            style={autoFit ? { fontSize: fittedSize } : {}}
        >
            {value || placeholder}
        </div>
    );
};

export const StampOverlay = ({ url, className }) => {
    if (!url) return null;
    return (
        <div className={cn("absolute pointer-events-none opacity-80 mix-blend-multiply", className)}>
            <img src={url} alt="Stamp" className="w-full h-full object-contain" />
        </div>
    );
};

/**
 * Resizable Table for Modals
 */
export const ResizableTable = ({ columns, data, onUpdateWidths, onUpdateData, colWidths: initialWidths, className }) => {
    const [widths, setWidths] = useState(initialWidths || columns.map(() => 120));
    const resizing = useRef(null);

    useEffect(() => {
        if (initialWidths) setWidths(initialWidths);
    }, [initialWidths]);

    const startResizing = (idx, e) => {
        e.preventDefault();
        resizing.current = { idx, startX: e.pageX, startWidth: widths[idx] };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        if (!resizing.current) return;
        const { idx, startX, startWidth } = resizing.current;
        const diff = e.pageX - startX;

        // "좌우폭은 늘어나지 않고 안에서만 조정가능하게"
        // Adjust current column and the next one to maintain total width
        if (idx < widths.length - 1) {
            const nextIdx = idx + 1;
            const startWidthNext = widths[nextIdx];

            // Calculate new widths
            const newW = Math.max(20, startWidth + diff);
            const actualDiff = newW - startWidth;
            const newWNext = Math.max(20, startWidthNext - actualDiff);

            const finalWidths = [...widths];
            finalWidths[idx] = startWidth + (startWidthNext - newWNext);
            finalWidths[nextIdx] = newWNext;
            setWidths(finalWidths);
        } else {
            // Last column: Just resize it but it might overflow? 
            // Better to allow resize but the user wants "within bounds".
            // If it's the last column, we could steal from the previous one.
            const prevIdx = idx - 1;
            if (prevIdx >= 0) {
                const startWidthPrev = widths[prevIdx];
                const newW = Math.max(20, startWidth + diff);
                const actualDiff = newW - startWidth;
                const newWPrev = Math.max(20, startWidthPrev - actualDiff);

                const finalWidths = [...widths];
                finalWidths[idx] = startWidth + (startWidthPrev - newWPrev);
                finalWidths[prevIdx] = newWPrev;
                setWidths(finalWidths);
            }
        }
    };

    const handleMouseUp = () => {
        if (resizing.current && onUpdateWidths) {
            onUpdateWidths(widths);
        }
        resizing.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    return (
        <table className={cn("w-full border-collapse table-fixed border-t-2 border-b-2 border-black", className)}>
            <thead>
                <tr className="bg-gray-50 font-bold border-b border-black">
                    {columns.map((col, idx) => (
                        <th
                            key={idx}
                            className="border-r border-black last:border-0 relative p-1 text-xs"
                            style={{ width: widths[idx] }}
                        >
                            <div className="flex flex-col items-center justify-center leading-tight">
                                <span>{col.label}</span>
                                {col.subLabel && <span className="text-[8px] font-normal uppercase">{col.subLabel}</span>}
                            </div>
                            <div
                                className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-blue-400 z-10"
                                onMouseDown={(e) => startResizing(idx, e)}
                            />
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {data.map((row, rIdx) => (
                    <tr key={rIdx} className="h-8 border-b border-gray-100 last:border-0 hover:bg-gray-50/50">
                        {columns.map((col, cIdx) => (
                            <td key={cIdx} className="border-r border-black last:border-0 p-0 text-center">
                                <EditableText
                                    value={row[col.key]}
                                    onChange={(v) => onUpdateData(rIdx, col.key, v)}
                                    autoFit
                                    maxWidth={widths[cIdx]}
                                    className={cn("text-xs justify-center", col.align === 'left' && "justify-start px-2", col.align === 'right' && "justify-end px-2")}
                                />
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
