import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'; // We need to build UI components later, for now inline simple cards
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import { Users, ShoppingCart, Activity, AlertCircle } from 'lucide-react';
import api from '../lib/api';

const DashboardCard = ({ title, value, icon: Icon, description, trend }) => (
    <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-sm">
        <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-400">{title}</h3>
            <Icon className="w-5 h-5 text-blue-500" />
        </div>
        <div className="text-2xl font-bold text-white mb-1">{value}</div>
        <p className="text-xs text-gray-500">{description}</p>
    </div>
);

const Dashboard = () => {
    const [stats, setStats] = useState({
        totalOrders: 0,
        pendingOrders: 0,
        productionActive: 0,
        qualityIssues: 0
    });

    // Mock Data for charts
    const productionData = [
        { name: 'Mon', output: 4000, target: 2400 },
        { name: 'Tue', output: 3000, target: 1398 },
        { name: 'Wed', output: 2000, target: 9800 },
        { name: 'Thu', output: 2780, target: 3908 },
        { name: 'Fri', output: 1890, target: 4800 },
        { name: 'Sat', output: 2390, target: 3800 },
        { name: 'Sun', output: 3490, target: 4300 },
    ];

    useEffect(() => {
        // Fetch stats from API in real implementation
        // For now, setting dummy values or fetching real counts if endpoints exist
        const fetchStats = async () => {
            try {
                // Example: const res = await api.get('/stats/summary');
                // setStats(res.data);
                setStats({
                    totalOrders: 124,
                    pendingOrders: 12,
                    productionActive: 5,
                    qualityIssues: 2
                });
            } catch (error) {
                console.error("Failed to fetch dashboard stats", error);
            }
        };
        fetchStats();
    }, []);

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <DashboardCard
                    title="총 수주 건수"
                    value={stats.totalOrders}
                    icon={ShoppingCart}
                    description="이번 달 누적 수주"
                />
                <DashboardCard
                    title="진행 중 주문"
                    value={stats.pendingOrders}
                    icon={Activity}
                    description="납품 대기 중인 주문"
                />
                <DashboardCard
                    title="가동 중 라인"
                    value={stats.productionActive}
                    icon={Activity}
                    description="현재 생산 중인 공정"
                />
                <DashboardCard
                    title="품질 이슈"
                    value={stats.qualityIssues}
                    icon={AlertCircle}
                    description="해결되지 않은 품질 문제"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-white mb-6">주간 생산 실적</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={productionData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="name" stroke="#9CA3AF" />
                                <YAxis stroke="#9CA3AF" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                                    itemStyle={{ color: '#F3F4F6' }}
                                />
                                <Bar dataKey="output" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
                    <h3 className="text-lg font-semibold text-white mb-6">품질 불량률 추이</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={productionData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                <XAxis dataKey="name" stroke="#9CA3AF" />
                                <YAxis stroke="#9CA3AF" />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                                />
                                <Line type="monotone" dataKey="target" stroke="#EF4444" strokeWidth={2} dot={{ r: 4 }} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
