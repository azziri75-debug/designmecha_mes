import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, ExternalLink, FileText, ArrowLeft, Loader2, Image as ImageIcon, FileCode, FileSpreadsheet } from 'lucide-react';
import { cn } from '../lib/utils';
import api from '../lib/api'; // Assuming you have an axios instance or similar

const FileViewerModal = ({ isOpen, onClose, files, title }) => {
    // State for internal preview
    const [previewFile, setPreviewFile] = useState(null);
    const [previewContent, setPreviewContent] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    // Reset preview when modal closes or files change
    useEffect(() => {
        if (!isOpen) {
            setPreviewFile(null);
            setPreviewContent(null);
            setError(null);
        }
    }, [isOpen, files]);

    if (!isOpen) return null;

    const handlePreviewClick = async (file) => {
        const isString = typeof file === 'string';
        const url = isString ? file : file.url;
        const name = isString ? decodeURIComponent(url.split('/').pop()) : file.name;

        const extension = name.split('.').pop().toLowerCase();

        // Define preview types
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
        const textExts = ['txt', 'nc', 'gcode', 'tap', 'json', 'xml', 'js', 'py', 'md', 'csv', 'log'];
        const pdfExts = ['pdf'];
        const spreadsheetExts = ['xlsx', 'xls', 'csv']; // Defined here

        const previewUrl = `/api/v1/preview?path=${encodeURIComponent(url)}`;
        const downloadUrl = `/api/v1/download?path=${encodeURIComponent(url)}&filename=${encodeURIComponent(name)}`;

        const fileData = { url, name, extension, previewUrl, downloadUrl };

        if (imageExts.includes(extension)) {
            setPreviewFile({ ...fileData, type: 'image' });
        } else if (pdfExts.includes(extension)) {
            setPreviewFile({ ...fileData, type: 'pdf' });
        } else if (textExts.includes(extension)) {
            setPreviewFile({ ...fileData, type: 'text' });
            setIsLoading(true);
            try {
                // Fetch text content
                const response = await fetch(previewUrl);
                if (!response.ok) throw new Error('Failed to load content');
                const text = await response.text();
                setPreviewContent(text);
            } catch (err) {
                console.error("Preview fetch error:", err);
                setError("파일 내용을 불러올 수 없습니다.");
            } finally {
                setIsLoading(false);
            }
        } else if (spreadsheetExts.includes(extension)) {
            setPreviewFile({ ...fileData, type: 'unsupported' }); // Reuse unsupported UI for now, or distinct one
        } else {
            // Fallback: Show "Preview Not Available" message
            setPreviewFile({ ...fileData, type: 'unsupported' });
        }
    };

    const handleBackToList = () => {
        setPreviewFile(null);
        setPreviewContent(null);
        setError(null);
    };

    // Render Preview Content
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
                        className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-white text-sm mt-2 flex items-center gap-2"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <Download className="w-4 h-4" /> 다운로드하여 보기
                    </a>
                </div>
            );
        }

        if (previewFile.type === 'image') {
            return (
                <div className="flex items-center justify-center bg-black/40 rounded-lg p-2 min-h-[50vh]">
                    <img src={previewFile.previewUrl} alt={previewFile.name} className="max-w-full max-h-[70vh] object-contain shadow-lg" />
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
                <div className="w-full h-[60vh] bg-gray-950 rounded-lg border border-gray-800 p-4 overflow-auto custom-scrollbar">
                    <pre className="text-gray-300 font-mono text-sm whitespace-pre-wrap break-all">
                        {previewContent}
                    </pre>
                </div>
            );
        }

        if (previewFile.type === 'unsupported') {
            return (
                <div className="flex flex-col items-center justify-center h-64 text-gray-400 gap-4">
                    <FileSpreadsheet className="w-16 h-16 opacity-50" />
                    <div className="text-center">
                        <p className="text-lg font-medium text-white mb-1">미리보기를 지원하지 않는 파일입니다.</p>
                        <p className="text-sm text-gray-500">{previewFile.name}</p>
                    </div>
                    <a
                        href={previewFile.downloadUrl}
                        className="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-white font-medium flex items-center gap-2 transition-colors"
                        target="_blank"
                        rel="noreferrer"
                    >
                        <Download className="w-4 h-4" /> 다운로드
                    </a>
                </div>
            );
        }

        return null;
    }



    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className={`bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full ${previewFile ? 'max-w-4xl' : 'max-w-md'} overflow-hidden flex flex-col max-h-[90vh] transition-all duration-300`}>

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-800 bg-gray-800/50">
                    <div className="flex items-center gap-3 overflow-hidden">
                        {previewFile ? (
                            <button
                                onClick={handleBackToList}
                                className="p-1 -ml-1 text-gray-400 hover:text-white rounded-full hover:bg-gray-700/50 transition-colors"
                            >
                                <ArrowLeft className="w-5 h-5" />
                            </button>
                        ) : (
                            <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                        )}
                        <h3 className="text-lg font-semibold text-white truncate">
                            {previewFile ? previewFile.name : (title || '첨부파일 목록')}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        {previewFile && (
                            <a
                                href={previewFile.downloadUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 text-gray-400 hover:text-blue-400 transition-colors"
                                title="다운로드"
                            >
                                <Download className="w-5 h-5" />
                            </a>
                        )}
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
                            <X className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-4 overflow-y-auto custom-scrollbar flex-1">
                    {previewFile ? (
                        renderPreview()
                    ) : (
                        <div className="space-y-3">
                            {files && files.length > 0 ? (
                                files.map((file, index) => {
                                    const isString = typeof file === 'string';
                                    const url = isString ? file : file.url;
                                    const name = isString ? decodeURIComponent(url.split('/').pop()) : file.name;
                                    const downloadUrl = `/api/v1/download?path=${encodeURIComponent(url)}&filename=${encodeURIComponent(name)}`;

                                    return (
                                        <div key={index} className="bg-gray-800 rounded-lg p-3 border border-gray-700 flex flex-col gap-2 group hover:border-gray-600 transition-colors">
                                            <div className="flex items-center gap-2 text-sm text-white font-medium truncate">
                                                <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center shrink-0">
                                                    <FileText className="w-4 h-4 text-gray-400" />
                                                </div>
                                                <button
                                                    onClick={() => handlePreviewClick(file)}
                                                    className="truncate hover:text-blue-400 hover:underline cursor-pointer transition-colors text-left"
                                                    title={`${name} 미리보기`}
                                                >
                                                    {name}
                                                </button>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 mt-1">
                                                <button
                                                    onClick={() => handlePreviewClick(file)}
                                                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 hover:text-white rounded text-xs transition-colors"
                                                >
                                                    <ExternalLink className="w-3.5 h-3.5" />
                                                    미리보기
                                                </button>
                                                <a
                                                    href={downloadUrl}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded text-xs transition-colors"
                                                >
                                                    <Download className="w-3.5 h-3.5" />
                                                    다운로드
                                                </a>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="text-center py-12 text-gray-500 flex flex-col items-center gap-2">
                                    <FileText className="w-12 h-12 opacity-20" />
                                    <span>첨부된 파일이 없습니다.</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer (only for list view) */}
                {!previewFile && (
                    <div className="p-4 border-t border-gray-800 bg-gray-800/30 flex justify-end">
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
