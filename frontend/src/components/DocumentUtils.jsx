import React, { useState, useEffect, useRef } from 'react';
import { cn, getImageUrl } from '../lib/utils';

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
    maxWidth = 0,
    forceWrap = false
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [text, setText] = useState(value || "");
    const baseSize = isHeader ? 24 : 14;
    // We intentionally disable useAutoFit's shrinking property to satisfy the new requirement: "크기는 조정하지 말고 줄을 바꾸고 줄높이를 조정하는 방식으로 변경"
    const fittedSize = baseSize;

    useEffect(() => { setText(value || ""); }, [value]);

    const handleBlur = () => {
        setIsEditing(false);
        if (text !== value && onChange) onChange(text);
    };

    if (isEditing) {
        return (
            <textarea
                autoFocus
                className={cn("bg-blue-50 border border-blue-300 outline-none p-1 w-full min-h-[1.5em] resize-none overflow-hidden block", className)}
                value={text}
                onChange={(e) => {
                    setText(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onBlur={handleBlur}
                style={{ fontSize: fittedSize }}
                rows={1}
            />
        );
    }

    return (
        <div
            onClick={(e) => { e.stopPropagation(); setIsEditing(true); }}
            className={cn(
                "cursor-text transition-colors min-h-[1.5em] flex items-center w-full",
                autoFit ? "whitespace-pre-wrap break-all" : "whitespace-nowrap overflow-hidden",
                className
            )}
            style={{
                fontSize: fittedSize,
                ...(isEditing ? {} : { cursor: 'pointer' }),
                ...(!value ? { color: '#d1d5db', fontStyle: 'italic' } : {})
            }}
        >
            {value || placeholder}
        </div>
    );
};

export const StampOverlay = ({ url, className }) => {
    const [base64, setBase64] = useState(null);

    useEffect(() => {
        if (!url) return;
        let isMounted = true;
        const fetchImage = async () => {
            const resolvedUrl = getImageUrl(url);
            try {
                const response = await fetch(resolvedUrl);
                if (!response.ok) throw new Error("Failed to fetch image");
                const blob = await response.blob();
                const reader = new FileReader();
                reader.onloadend = () => {
                    if (isMounted) setBase64(reader.result);
                };
                reader.readAsDataURL(blob);
            } catch (error) {
                console.error("Stamp fetch error:", error, resolvedUrl);
                // Fallback to a transparent 1x1 pixel instead of a broken URL to prevent html-to-image from failing/hanging
                if (isMounted) setBase64("data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7");
            }
        };
        fetchImage();
        return () => { isMounted = false; };
    }, [url]);

    if (!base64) return null; // Wait for base64

    return (
        <div className={cn("absolute pointer-events-none opacity-80 mix-blend-multiply", className)}>
            <img src={base64} alt="Stamp" className="w-full h-full object-contain" />
        </div>
    );
};

/**
 * Resizable Table for Modals
 */
export const ResizableTable = ({ columns, data, onUpdateWidths, onUpdateData, colWidths: initialWidths, className }) => {
    const [widths, setWidths] = useState(initialWidths || columns.map(() => 120));
    const resizing = useRef(null);
    const widthsRef = useRef(widths);

    useEffect(() => {
        if (initialWidths) {
            setWidths(initialWidths);
            widthsRef.current = initialWidths;
        }
    }, [initialWidths]);

    const startResizing = (idx, e) => {
        e.preventDefault();
        const currentWidths = widthsRef.current;
        resizing.current = {
            idx,
            startX: e.pageX,
            startWidth: currentWidths[idx],
            startWidths: [...currentWidths],
            latestWidths: [...currentWidths]
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e) => {
        if (!resizing.current) return;
        const { idx, startX, startWidth, startWidths } = resizing.current;
        const diff = e.pageX - startX;

        // "좌우폭은 늘어나지 않고 안에서만 조정가능하게"
        if (idx < startWidths.length - 1) {
            const nextIdx = idx + 1;
            const startWidthNext = startWidths[nextIdx];

            const newW = Math.max(20, startWidth + diff);
            const actualDiff = newW - startWidth;
            const newWNext = Math.max(20, startWidthNext - actualDiff);

            const finalWidths = [...startWidths];
            finalWidths[idx] = startWidth + (startWidthNext - newWNext);
            finalWidths[nextIdx] = newWNext;

            resizing.current.latestWidths = finalWidths;
            widthsRef.current = finalWidths;
            setWidths(finalWidths);
        } else {
            const prevIdx = idx - 1;
            if (prevIdx >= 0) {
                const startWidthPrev = startWidths[prevIdx];
                const newW = Math.max(20, startWidth + diff);
                const actualDiff = newW - startWidth;
                const newWPrev = Math.max(20, startWidthPrev - actualDiff);

                const finalWidths = [...startWidths];
                finalWidths[idx] = startWidth + (startWidthPrev - newWPrev);
                finalWidths[prevIdx] = newWPrev;

                resizing.current.latestWidths = finalWidths;
                widthsRef.current = finalWidths;
                setWidths(finalWidths);
            }
        }
    };

    const handleMouseUp = () => {
        if (resizing.current && onUpdateWidths && resizing.current.latestWidths) {
            onUpdateWidths(resizing.current.latestWidths);
        }
        resizing.current = null;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
    };

    return (
        <table className={cn("w-full border-collapse table-fixed border-t-2 border-b-2 border-black", className)}>
            <thead>
                <tr className="font-bold border-b border-black" style={{ backgroundColor: '#f9fafb' }}>
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
                    <tr key={rIdx} className="min-h-[2rem] h-auto border-b border-gray-100 last:border-0 hover:bg-[#f9fafb]">
                        {columns.map((col, cIdx) => (
                            <td key={cIdx} className="border-r border-black last:border-0 p-0 text-center h-full">
                                <EditableText
                                    value={row[col.key]}
                                    onChange={(v) => onUpdateData(rIdx, col.key, v)}
                                    autoFit
                                    maxWidth={widths[cIdx]}
                                    className={cn("text-xs justify-center h-full", col.align === 'left' && "justify-start px-2", col.align === 'right' && "justify-end px-2")}
                                />
                            </td>
                        ))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
};
