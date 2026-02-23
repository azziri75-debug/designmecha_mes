import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ExternalLink, FileText, ArrowLeft, Loader2, FileCode, FileSpreadsheet, Image as ImageIcon, File } from 'lucide-react';
import { cn } from '../lib/utils';

// ─── URL helpers ──────────────────────────────────────────────────────────────
// Build an absolute URL to the FastAPI backend.
// VITE_API_URL is something like "https://backend.onrender.com/api/v1"
// We need the origin (https://backend.onrender.com) to prepend to /api/v1/... paths.
function getBackendOrigin() {
    const configured = import.meta.env.VITE_API_URL;
    if (configured) {
        try {
            return new URL(configured, window.location.origin).origin;
        } catch {
            // fall-through
        }
    }
    return ''; // same origin → works in local dev via Vite proxy
}

function buildPreviewUrl(fileUrl) {
    return `${getBackendOrigin()}/api/v1/preview?path=${encodeURIComponent(fileUrl)}`;
}

function buildDownloadUrl(fileUrl, fileName) {
    return `${getBackendOrigin()}/api/v1/download?path=${encodeURIComponent(fileUrl)}&filename=${encodeURIComponent(fileName)}`;
}

// ─── File type helpers ────────────────────────────────────────────────────────
const IMAGE_EXTS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
const PDF_EXTS = ['pdf'];
const TEXT_EXTS = ['txt', 'nc', 'gcode', 'tap', 'json', 'xml', 'js', 'py', 'md', 'log', 'csv'];
// Excel, Word, hwp, zip, etc. → "unsupported" → offer download + external open
const EXTERNAL_EXTS = ['xlsx', 'xls', 'docx', 'doc', 'pptx', 'ppt', 'hwp', 'zip', 'rar', '7z'];

function getExtension(name = '') {
    return (name.split('.').pop() || '').toLowerCase();
}

function getFileIcon(ext) {
    if (IMAGE_EXTS.includes(ext)) return <ImageIcon className="w-8 h-8 text-blue-400" />;
    if (PDF_EXTS.includes(ext)) return <FileCode className="w-8 h-8 text-red-400" />;
    if (EXTERNAL_EXTS.includes(ext)) return <FileSpreadsheet className="w-8 h-8 text-green-400" />;
    return <File className="w-8 h-8 text-gray-400" />;
}

function getPreviewType(ext) {
    if (IMAGE_EXTS.includes(ext)) return 'image';
    if (PDF_EXTS.includes(ext)) return 'pdf';
    if (TEXT_EXTS.includes(ext)) return 'text';
    return 'external'; // Excel, Word, hwp, unknown → must open externally
}

// ─── Component ───────────────────────────────────────────────────────────────
const FileViewerModal = ({ isOpen, onClose, files = [], title, onDeleteFile }) => {
    const [previewFile, setPreviewFile] = useState(null);
    const [previewContent, setPreviewContent] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isOpen) {
            setPreviewFile(null);
            setPreviewContent(null);
            setError(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    // Normalize a file entry to { url, name }
    const normalizeFile = (file) => {
        if (typeof file === 'string') {
            const name = decodeURIComponent(file.split('/').pop());
            return { url: file, name };
        }
        return { url: file.url || '', name: file.name || '파일' };
    };

    const handlePreviewClick = async (rawFile) => {
        const { url, name } = normalizeFile(rawFile);
        const ext = getExtension(name);
        const type = getPreviewType(ext);
        const previewUrl = buildPreviewUrl(url);
        const downloadUrl = buildDownloadUrl(url, name);

        const fileData = { url, name, ext, type, previewUrl, downloadUrl };

        if (type === 'text') {
            setPreviewFile({ ...fileData });
            setIsLoading(true);
            setError(null);
            try {
                const res = await fetch(previewUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                setPreviewContent(await res.text());
            } catch (err) {
                setError('파일 내용을 불러올 수 없습니다.');
                console.error('Preview fetch error:', err);
            } finally {
                setIsLoading(false);
            }
        } else {
            setPreviewFile(fileData);
        }
    };

    const handleBackToList = () => {
        setPreviewFile(null);
        setPreviewContent(null);
        setError(null);
    };

    // ── Preview renderer ──
    const renderPreview = () => {
        if (isLoading) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                    <p>파일을 불러오는 중...</p>
                </div>
            );
        }

        if (error) {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-red-400 gap-3">
                    <FileCode className="w-10 h-10" />
                    <p>{error}</p>
                    <a
                        href={previewFile.downloadUrl}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white text-sm flex items-center gap-2 transition-colors"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <Download className="w-4 h-4" /> 다운로드하여 열기
                    </a>
                </div>
            );
        }

        if (previewFile.type === 'image') {
            return (
                <div className="flex items-center justify-center bg-black/40 rounded-lg p-2 min-h-[50vh]">
                    <img src={previewFile.previewUrl} alt={previewFile.name} className="max-w-full max-h-[70vh] object-contain shadow-lg rounded" />
                </div>
            );
        }

        if (previewFile.type === 'pdf') {
            return (
                <div className="w-full h-[70vh] bg-gray-100 rounded-lg overflow-hidden">
                    <iframe src={previewFile.previewUrl} className="w-full h-full" title="PDF Viewer" />
                </div>
            );
        }

        if (previewFile.type === 'text') {
            return (
                <div className="w-full h-[60vh] bg-gray-950 rounded-lg border border-gray-800 p-4 overflow-auto">
                    <pre className="text-gray-300 font-mono text-sm whitespace-pre-wrap break-all">
                        {previewContent}
                    </pre>
                </div>
            );
        }

        // external – Excel, Word, HWP, etc.
        return (
            <div className="flex flex-col items-center justify-center py-12 gap-5">
                <div className="w-20 h-20 rounded-2xl bg-gray-800/80 flex items-center justify-center border border-gray-700">
                    {getFileIcon(previewFile.ext)}
                </div>
                <div className="text-center">
                    <p className="text-lg font-semibold text-white mb-1">{previewFile.name}</p>
                    <p className="text-sm text-gray-400">브라우저에서 미리볼 수 없는 파일 형식입니다.</p>
                    <p className="text-xs text-gray-500 mt-1">다운로드 후 연결 프로그램으로 여세요.</p>
                </div>
                <div className="flex gap-3">
                    <a
                        href={previewFile.downloadUrl}
                        download={previewFile.name}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors shadow-lg shadow-blue-900/30"
                    >
                        <Download className="w-4 h-4" /> 다운로드
                    </a>
                    <a
                        href={previewFile.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-2 px-6 py-2.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                    >
                        <ExternalLink className="w-4 h-4" /> 다른 방법으로 열기
                    </a>
                </div>
            </div>
        );
    };

    // ── File list ──
    const renderFileList = () => {
        const normalizedFiles = (files || []).map(normalizeFile);

        if (normalizedFiles.length === 0) {
            return (
                <div className="text-center py-12 text-gray-500 flex flex-col items-center gap-2">
                    <FileText className="w-12 h-12 opacity-20" />
                    <span>첨부된 파일이 없습니다.</span>
                </div>
            );
        }

        return (
            <div className="space-y-3">
                {normalizedFiles.map((file, index) => {
                    const ext = getExtension(file.name);
                    const downloadUrl = buildDownloadUrl(file.url, file.name);
                    return (
                        <div
                            key={index}
                            className="bg-gray-800 rounded-lg p-3 border border-gray-700 hover:border-gray-500 transition-colors"
                        >
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-lg bg-gray-700 flex items-center justify-center shrink-0">
                                    {getFileIcon(ext)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white truncate" title={file.name}>{file.name}</p>
                                    <p className="text-xs text-gray-500 uppercase">{ext} 파일</p>
                                </div>
                                {onDeleteFile && (
                                    <button
                                        onClick={() => onDeleteFile(index)}
                                        className="text-red-500 hover:text-red-400 bg-red-900/20 hover:bg-red-900/40 p-1.5 rounded-lg transition-colors shrink-0"
                                        title="이 첨부파일 삭제"
                                    >
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => handlePreviewClick(files[index])}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
                                >
                                    <ExternalLink className="w-3.5 h-3.5" />
                                    {EXTERNAL_EXTS.includes(ext) ? '연결 프로그램으로 열기' : '미리보기'}
                                </button>
                                <a
                                    href={downloadUrl}
                                    download={file.name}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded-lg text-xs font-medium transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    다운로드
                                </a>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className={`bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full ${previewFile ? 'max-w-4xl' : 'max-w-md'} overflow-hidden flex flex-col max-h-[90vh] transition-all duration-300`}>

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-800/50 shrink-0">
                    <div className="flex items-center gap-3 overflow-hidden min-w-0">
                        {previewFile ? (
                            <button
                                onClick={handleBackToList}
                                className="p-1 -ml-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-700/50 transition-colors shrink-0"
                                title="목록으로"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        ) : (
                            <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                        )}
                        <h3 className="text-base font-semibold text-white truncate">
                            {previewFile ? previewFile.name : (title || '첨부 파일')}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                        {previewFile && (
                            <a
                                href={previewFile.downloadUrl}
                                download={previewFile.name}
                                className="p-2 text-gray-400 hover:text-blue-400 transition-colors rounded-full hover:bg-gray-700/50"
                                title="다운로드"
                            >
                                <Download className="w-4 h-4" />
                            </a>
                        )}
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700/50"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto flex-1">
                    {previewFile ? renderPreview() : renderFileList()}
                </div>

                {/* Footer */}
                {!previewFile && (
                    <div className="p-3 border-t border-gray-800 bg-gray-800/30 flex justify-end shrink-0">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors"
                        >
                            닫기
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
};

export default FileViewerModal;
