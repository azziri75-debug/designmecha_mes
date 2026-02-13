import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SalesPage from './pages/SalesPage';
import BasicsPage from './pages/BasicsPage';
import ProductsPage from './pages/ProductsPage';



import ProductionPage from './pages/ProductionPage';
import PurchasePage from './pages/PurchasePage';
import OutsourcingPage from './pages/OutsourcingPage';

const App = () => {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="basics" element={<BasicsPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="sales" element={<SalesPage />} />
        <Route path="production" element={<ProductionPage />} />
        <Route path="purchase" element={<PurchasePage />} />
        <Route path="outsourcing" element={<OutsourcingPage />} />
        <Route path="quality" element={<div className="p-4 text-white">Quality Module (Coming Soon)</div>} />
        <Route path="inventory" element={<div className="p-4 text-white">Inventory Module (Coming Soon)</div>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
