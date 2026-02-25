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
            context.font = `${size}px "Malgun Gothic", sans-serif`;
            return context.measureText(text).width;
        };

        while (measure(currentSize) > containerWidth - 12 && currentSize > minSize) {
            currentSize -= 0.5;
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
                className={cn("bg-blue-50 border border-blue-300 outline-none px-1 rounded w-full", className)}
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
