import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import MobileLayout from './components/MobileLayout';
import MobileRedirectHandler from './components/MobileRedirectHandler';

// 페이지별 코드 스플리팅 (초기 번들 다운로드 및 파싱 속도 대폭 개선)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SalesPage = lazy(() => import('./pages/SalesPage'));
const BasicsPage = lazy(() => import('./pages/BasicsPage'));
const ProductsPage = lazy(() => import('./pages/ProductsPage'));
const ProductionPage = lazy(() => import('./pages/ProductionPage'));
const PurchasePage = lazy(() => import('./pages/PurchasePage'));
const OutsourcingPage = lazy(() => import('./pages/OutsourcingPage'));
const DeliveryPage = lazy(() => import('./pages/DeliveryPage'));
const QualityPage = lazy(() => import('./pages/QualityPage'));
const InventoryPage = lazy(() => import('./pages/InventoryPage'));
const WorkLogPage = lazy(() => import('./pages/WorkLogPage'));
const MobileWorkLogPage = lazy(() => import('./pages/MobileWorkLogPage'));
const ApprovalPage = lazy(() => import('./pages/ApprovalPage'));
const DataManagementPage = lazy(() => import('./pages/DataManagementPage'));
const CustomerComplaintPage = lazy(() => import('./pages/CustomerComplaintPage'));
const MobileAttendancePage = lazy(() => import('./pages/MobileAttendancePage'));
const AttendancePage = lazy(() => import('./pages/AttendancePage'));
const ApprovalDraftPage = lazy(() => import('./components/ApprovalDraftPage'));
const SettlementPage = lazy(() => import('./pages/SettlementPage'));
const WeightCalculatorPage = lazy(() => import('./pages/WeightCalculatorPage'));
const MobileInventoryPage = lazy(() => import('./pages/MobileInventoryPage'));

const PageLoader = () => (
  <div className="flex items-center justify-center h-64">
    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
  </div>
);

const ProtectedRoute = ({ children, menuKey }) => {
  const { user, hasPermission } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (menuKey && !hasPermission(menuKey)) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400 text-lg font-bold">⚠ 접근 권한이 없습니다</p>
        <p className="text-gray-500 mt-2">관리자에게 문의하세요.</p>
      </div>
    );
  }
  return children;
};

const RootRedirect = () => {
  const { user } = useAuth();
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (isMobile && user) {
    return <Navigate to="/mobile/work-logs" replace />;
  }
  return <Dashboard />;
};

const App = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <MobileRedirectHandler />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<RootRedirect />} />
            <Route path="basics" element={<ProtectedRoute menuKey="basics"><BasicsPage /></ProtectedRoute>} />
            <Route path="products/produced" element={<ProtectedRoute menuKey="products_produced"><ProductsPage type="PRODUCED" /></ProtectedRoute>} />
            <Route path="products/parts" element={<ProtectedRoute menuKey="products_parts"><ProductsPage type="PART" /></ProtectedRoute>} />
            <Route path="products/consumables" element={<ProtectedRoute menuKey="products_consumables"><ProductsPage type="CONSUMABLE" /></ProtectedRoute>} />
            <Route path="products" element={<Navigate to="/products/produced" replace />} />
            <Route path="sales" element={<ProtectedRoute menuKey="sales_order"><SalesPage /></ProtectedRoute>} />
            <Route path="purchasing/materials" element={<ProtectedRoute menuKey="purchasing_materials"><PurchasePage type="PART" /></ProtectedRoute>} />
            <Route path="purchasing/consumables" element={<ProtectedRoute menuKey="purchasing_consumables"><PurchasePage type="CONSUMABLE" /></ProtectedRoute>} />
            <Route path="purchasing" element={<Navigate to="/purchasing/materials" replace />} />
            <Route path="production" element={<ProtectedRoute menuKey="production"><ProductionPage /></ProtectedRoute>} />
            <Route path="work-logs" element={<ProtectedRoute menuKey="worklogs"><WorkLogPage /></ProtectedRoute>} />
            <Route path="outsourcing" element={<ProtectedRoute menuKey="outsourcing"><OutsourcingPage /></ProtectedRoute>} />
            <Route path="quality" element={<ProtectedRoute menuKey="quality_status"><QualityPage /></ProtectedRoute>} />
            <Route path="delivery" element={<ProtectedRoute menuKey="delivery"><DeliveryPage /></ProtectedRoute>} />
            <Route path="inventory" element={<ProtectedRoute menuKey="inventory"><InventoryPage /></ProtectedRoute>} />
            <Route path="approval" element={<ProtectedRoute menuKey="approval"><ApprovalPage /></ProtectedRoute>} />
            <Route path="approval/draft" element={<ProtectedRoute menuKey="approval"><ApprovalDraftPage /></ProtectedRoute>} />
            <Route path="settlement" element={<ProtectedRoute menuKey="sales_settlement"><SettlementPage /></ProtectedRoute>} />
            <Route path="attendance" element={<ProtectedRoute menuKey="hr"><AttendancePage /></ProtectedRoute>} />
            <Route path="complaints" element={<ProtectedRoute menuKey="quality_complaints"><CustomerComplaintPage /></ProtectedRoute>} />
            <Route path="db-management" element={<ProtectedRoute menuKey="ADMIN"><DataManagementPage /></ProtectedRoute>} />
          </Route>
          <Route path="/mobile" element={<ProtectedRoute><MobileLayout /></ProtectedRoute>}>
            <Route path="work-logs" element={<MobileWorkLogPage />} />
            <Route path="attendance" element={<MobileAttendancePage />} />
            <Route path="inventory" element={<MobileInventoryPage />} />
          </Route>
          <Route path="/weight-calculator" element={<WeightCalculatorPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
};

export default App;
