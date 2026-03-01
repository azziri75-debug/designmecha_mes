import React from 'react';
import api from '../lib/api';
import { FileSpreadsheet, Download, RefreshCw } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';

const ReportsPage = () => {
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
        setMounted(true);
    }, []);

    // Mock Data for charts - in real app, fetch from /reports/stats
    const chartData = [
        { month: '1월', revenue: 1200, production: 1400 },
        { month: '2월', revenue: 2100, production: 2200 },
        { month: '3월', revenue: 800, production: 900 },
        { month: '4월', revenue: 1600, production: 1700 },
        { month: '5월', revenue: 2400, production: 2100 },
        { month: '6월', revenue: 3200, production: 3000 },
    ];

    const handleDownload = async (type) => {
        try {
            let endpoint = '';
            let filename = 'download.xlsx';

            if (type === 'orders') {
                endpoint = '/reports/orders/excel';
                filename = 'orders_list.xlsx';
            } else if (type === 'production') {
                endpoint = '/reports/production/excel';
                filename = 'production_status.xlsx';
            } else if (type === 'stats') {
                endpoint = '/reports/stats/excel';
                filename = 'monthly_stats.xlsx';
            }

            const res = await api.get(endpoint, { responseType: 'blob' });
            const url = window.URL.createObjectURL(new Blob([res.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error("Download failed", error);
            alert("다운로드 실패: " + error.message);
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h2 className="text-2xl font-bold text-white mb-2">리포트 및 통계</h2>
                <p className="text-gray-400">데이터를 엑셀로 다운로드하거나 월별 실적을 확인합니다.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="hover:border-blue-500/50 transition-colors">
                    <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
                        <div className="w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center">
                            <FileSpreadsheet className="w-8 h-8 text-blue-500" />
                        </div>
                        <div className="text-center">
                            <h3 className="font-bold text-white mb-1">수주 리스트</h3>
                            <p className="text-xs text-gray-500">모든 수주 내역 및 상태</p>
                        </div>
                        <button
                            onClick={() => handleDownload('orders')}
                            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full justify-center"
                        >
                            <Download className="w-4 h-4" /> 엑셀 다운로드
                        </button>
                    </CardContent>
                </Card>

                <Card className="hover:border-emerald-500/50 transition-colors">
                    <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
                        <div className="w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center">
                            <FileSpreadsheet className="w-8 h-8 text-emerald-500" />
                        </div>
                        <div className="text-center">
                            <h3 className="font-bold text-white mb-1">생산 현황</h3>
                            <p className="text-xs text-gray-500">공정별 상세 생산 계획 현황</p>
                        </div>
                        <button
                            onClick={() => handleDownload('production')}
                            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full justify-center"
                        >
                            <Download className="w-4 h-4" /> 엑셀 다운로드
                        </button>
                    </CardContent>
                </Card>

                <Card className="hover:border-purple-500/50 transition-colors">
                    <CardContent className="flex flex-col items-center justify-center p-8 gap-4">
                        <div className="w-16 h-16 rounded-full bg-purple-500/10 flex items-center justify-center">
                            <FileSpreadsheet className="w-8 h-8 text-purple-500" />
                        </div>
                        <div className="text-center">
                            <h3 className="font-bold text-white mb-1">월별 실적 통계</h3>
                            <p className="text-xs text-gray-500">매출 및 생산량 월별 집계</p>
                        </div>
                        <button
                            onClick={() => handleDownload('stats')}
                            className="flex items-center gap-2 bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors w-full justify-center"
                        >
                            <Download className="w-4 h-4" /> 엑셀 다운로드
                        </button>
                    </CardContent>
                </Card>
            </div>

            <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-white">월별 생산 및 매출 추이</h3>
                    <button className="text-gray-400 hover:text-white"><RefreshCw className="w-4 h-4" /></button>
                </div>
                <div className="h-96 w-full">
                    {mounted && (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="month" stroke="#9CA3AF" />
                                <YAxis stroke="#9CA3AF" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                                    itemStyle={{ color: '#F3F4F6' }}
                                />
                                <Bar dataKey="revenue" name="매출액" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="production" name="생산량" fill="#10B981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ReportsPage;
