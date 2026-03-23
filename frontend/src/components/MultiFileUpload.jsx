import React, { useState, useRef } from 'react';
import { Upload, X, FileText, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';
import api from '../lib/api';
import { getImageUrl, cn } from '../lib/utils';

const MultiFileUpload = ({ files = [], onChange, label = "파일 업로드", isReadOnly = false }) => {
    const [uploading, setUploading] = useState(false);
    const [dragActive, setDragActive] = useState(false);
    const inputRef = useRef(null);

    const handleFiles = async (newFiles) => {
        setUploading(true);
        const uploaded = [...files];

        for (const file of newFiles) {
            try {
                const fd = new FormData();
                fd.append('file', file);
                const res = await api.post('/upload', fd, {
                    headers: { 'Content-Type': 'multipart/form-data' }
                });
                uploaded.push({ name: res.data.filename, url: res.data.url });
            } catch (error) {
                console.error("Upload failed", error);
                alert(`${file.name} 업로드 실패`);
            }
        }

        onChange(uploaded);
        setUploading(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFiles(Array.from(e.dataTransfer.files));
        }
    };

    const handleDrag = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    };

    const isImage = (name) => {
        if (!name || typeof name !== 'string') return false;
        const parts = name?.split('.') || [];
        if (parts.length < 2) return false;
        const ext = parts.pop().toLowerCase();
        return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
    };

    return (
        <div className="space-y-3">
            <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                    "relative border-2 border-dashed rounded-xl p-6 transition-all cursor-pointer flex flex-col items-center justify-center gap-2",
                    dragActive ? "border-blue-500 bg-blue-500/10" : "border-gray-700 bg-gray-900/50 hover:border-gray-500 hover:bg-gray-800",
                    uploading && "opacity-50 pointer-events-none",
                    isReadOnly && "opacity-60 cursor-default hover:bg-gray-900/50 hover:border-gray-700"
                )}
                style={isReadOnly ? { pointerEvents: 'none' } : {}}
            >
                <input
                    ref={inputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(Array.from(e.target.files))}
                />

                {uploading ? (
                    <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                ) : (
                    <Upload className={cn("w-8 h-8", dragActive ? "text-blue-500" : "text-gray-500")} />
                )}

                <div className="text-center">
                    <p className="text-sm font-medium text-gray-300">{label}{isReadOnly && " (읽기 전용)"}</p>
                    <p className="text-xs text-gray-500 mt-1">
                        {isReadOnly ? "첨부된 파일을 확인하려면 파일명을 클릭하세요" : "파일을 드래그하여 올리거나 클릭하여 선택하세요"}
                    </p>
                </div>
            </div>

            {files.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {files.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-gray-800 rounded-lg px-3 py-2 border border-gray-700 group hover:border-gray-500 transition-colors">
                            <div className="flex items-center gap-2 min-w-0">
                                {isImage(file.name) ? <ImageIcon className="w-4 h-4 text-purple-400 shrink-0" /> : <FileText className="w-4 h-4 text-blue-400 shrink-0" />}
                                <a
                                    href={getImageUrl(file.url)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-sm text-gray-300 hover:text-blue-400 truncate"
                                >
                                    {file?.name || 'Unknown File'}
                                </a>
                            </div>
                            {!isReadOnly && (
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onChange(files.filter((_, i) => i !== idx));
                                    }}
                                    className="text-gray-500 hover:text-red-400 p-1 opacity-0 group-hover:opacity-100 transition-all"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MultiFileUpload;
