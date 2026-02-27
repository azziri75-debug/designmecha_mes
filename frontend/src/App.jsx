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
        <Route index element={<Dashboard />} />
        <Route path="basics" element={<ProtectedRoute menuKey="basics"><BasicsPage /></ProtectedRoute>} />
        <Route path="products" element={<ProtectedRoute menuKey="products"><ProductsPage /></ProtectedRoute>} />
        <Route path="sales" element={<ProtectedRoute menuKey="sales"><SalesPage /></ProtectedRoute>} />
        <Route path="production" element={<ProtectedRoute menuKey="production"><ProductionPage /></ProtectedRoute>} />
        <Route path="work-logs" element={<ProtectedRoute menuKey="production"><WorkLogPage /></ProtectedRoute>} />
        <Route path="purchase" element={<ProtectedRoute menuKey="purchase"><PurchasePage /></ProtectedRoute>} />
        <Route path="outsourcing" element={<ProtectedRoute menuKey="outsourcing"><OutsourcingPage /></ProtectedRoute>} />
        <Route path="quality" element={<ProtectedRoute menuKey="quality"><QualityPage /></ProtectedRoute>} />
        <Route path="delivery" element={<ProtectedRoute menuKey="sales"><DeliveryPage /></ProtectedRoute>} />
        <Route path="inventory" element={<ProtectedRoute menuKey="inventory"><InventoryPage /></ProtectedRoute>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
