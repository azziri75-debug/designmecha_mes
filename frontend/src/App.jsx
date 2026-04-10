import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import SalesPage from './pages/SalesPage';
import BasicsPage from './pages/BasicsPage';
import ProductsPage from './pages/ProductsPage';
import ProductionPage from './pages/ProductionPage';
import PurchasePage from './pages/PurchasePage';
import OutsourcingPage from './pages/OutsourcingPage';
import DeliveryPage from './pages/DeliveryPage';
import QualityPage from './pages/QualityPage';
import InventoryPage from './pages/InventoryPage';
import WorkLogPage from './pages/WorkLogPage';
import MobileWorkLogPage from './pages/MobileWorkLogPage';
import ApprovalPage from './pages/ApprovalPage';
import DataManagementPage from './pages/DataManagementPage';
import CustomerComplaintPage from './pages/CustomerComplaintPage';
import MobileAttendancePage from './pages/MobileAttendancePage';
import AttendancePage from './pages/AttendancePage';
import ApprovalDraftPage from './components/ApprovalDraftPage';
import SettlementPage from './pages/SettlementPage';
import WeightCalculatorPage from './pages/WeightCalculatorPage';

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
      <Route path="/mobile/work-logs" element={<ProtectedRoute><MobileWorkLogPage /></ProtectedRoute>} />
      <Route path="/mobile/attendance" element={<ProtectedRoute><MobileAttendancePage /></ProtectedRoute>} />
      <Route path="/weight-calculator" element={<WeightCalculatorPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
