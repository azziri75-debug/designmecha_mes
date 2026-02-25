import React, { useState, useEffect } from 'react';
import {
    FileText,
    Settings,
    Save,
    RefreshCcw,
    Layout
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import api from '../lib/api';
import VisualFormEditor from '../components/VisualFormEditor';
import { cn } from '../lib/utils';

const FormManagementPage = () => {
    const [templates, setTemplates] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [editorMode, setEditorMode] = useState('visual'); // 'visual', 'json'

    useEffect(() => {
        fetchTemplates();
    }, []);

    const fetchTemplates = async () => {
        setLoading(true);
        try {
            const res = await api.get('/basics/form-templates/');
            setTemplates(res.data);
            if (res.data.length > 0) setSelectedTemplate(res.data[0]);
        } catch (err) {
            console.error("Fetch templates failed", err);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedTemplate) return;
        try {
            await api.post(`/basics/form-templates/`, selectedTemplate);
            alert("저장되었습니다.");
            fetchTemplates();
        } catch (err) {
            alert("저장 실패");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <FileText className="w-6 h-6 text-blue-500" />
                        양식 관리
                    </h2>
                    <p className="text-gray-400">명세서, 시트 등 시스템에서 생성되는 문서의 출력 양식을 시각적으로 편집합니다.</p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={fetchTemplates}>
                        <RefreshCcw className="w-4 h-4 mr-2" />
                        초기화
                    </Button>
                    <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={handleSave}>
                        <Save className="w-4 h-4 mr-2" />
                        설정 저장
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* template list */}
                <Card className="lg:col-span-1 bg-gray-900 border-gray-800">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-sm font-medium text-gray-400">양식 목록</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {templates.map((t) => (
                            <button
                                key={t.id}
                                onClick={() => setSelectedTemplate(t)}
                                className={`w-full text-left px-4 py-3 rounded-lg border transition-all ${selectedTemplate?.id === t.id
                                    ? "bg-blue-600/10 border-blue-500 text-blue-400"
                                    : "bg-gray-800 border-transparent text-gray-400 hover:bg-gray-700"
                                    }`}
                            >
                                <div className="text-sm font-bold">{t.name}</div>
                                <div className="text-[10px] mt-1 opacity-60 font-mono">{t.form_type}</div>
                            </button>
                        ))}
                    </CardContent>
                </Card>

                {/* Editor Area */}
                <Card className="lg:col-span-3 bg-gray-900 border-gray-800">
                    <CardHeader className="border-b border-gray-800 flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="text-white">{selectedTemplate?.name || '양식을 선택하세요'}</CardTitle>
                            <CardDescription>드래그 앤 드롭으로 블록을 배치하거나 상세 설정을 변경합니다.</CardDescription>
                        </div>
                        <div className="flex bg-gray-800 p-1 rounded-lg">
                            <button
                                onClick={() => setEditorMode('visual')}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                    editorMode === 'visual' ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
                                )}
                            >
                                시각적 편집
                            </button>
                            <button
                                onClick={() => setEditorMode('json')}
                                className={cn(
                                    "px-3 py-1.5 text-xs font-medium rounded-md transition-all",
                                    editorMode === 'json' ? "bg-blue-600 text-white shadow-sm" : "text-gray-400 hover:text-white"
                                )}
                            >
                                JSON 직접 편집
                            </button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-6">
                        {selectedTemplate ? (
                            <div className="space-y-6">
                                {editorMode === 'visual' ? (
                                    <VisualFormEditor
                                        template={selectedTemplate}
                                        onChange={(newVal) => setSelectedTemplate(newVal)}
                                    />
                                ) : (
                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <div className="flex items-center justify-between">
                                                <label className="text-sm font-medium text-gray-400 flex items-center gap-2">
                                                    <Layout className="w-4 h-4" />
                                                    레이아웃 데이터 (JSON)
                                                </label>
                                            </div>
                                            <textarea
                                                rows={20}
                                                value={JSON.stringify(selectedTemplate.layout_data, null, 4)}
                                                onChange={(e) => {
                                                    try {
                                                        const parsed = JSON.parse(e.target.value);
                                                        setSelectedTemplate({ ...selectedTemplate, layout_data: parsed });
                                                    } catch (err) {
                                                        // ignore parse errors while typing
                                                    }
                                                }}
                                                className="w-full bg-gray-950 border border-gray-800 text-blue-400 font-mono text-xs rounded-lg p-4 focus:ring-1 focus:ring-blue-500 outline-none"
                                            />
                                        </div>
                                    </div>
                                )}

                                <div className="p-4 bg-gray-800/50 rounded-lg border border-gray-700">
                                    <h4 className="text-sm font-bold text-gray-300 flex items-center gap-2 mb-2">
                                        <Settings className="w-4 h-4 text-blue-400" />
                                        도움말
                                    </h4>
                                    <p className="text-xs text-gray-500 leading-relaxed">
                                        - 시각적 편집 모드에서 왼쪽의 블록을 클릭하여 추가하고, 드래그하여 순서를 바꿀 수 있습니다.<br />
                                        - 상단의 **[설정 저장]** 버튼을 눌러야 실제 시스템에 반영됩니다.
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="py-20 text-center text-gray-600">
                                <FileText className="w-12 h-12 mx-auto mb-4 opacity-10" />
                                <p>수정할 양식을 왼쪽에서 선택하세요.</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
};

export default FormManagementPage;
