import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/Sidebar";
import Dashboard from "./pages/Dashboard";
import Expenses from "./pages/Expenses";
import Categories from "./pages/Categories";
import Budgets from "./pages/Budgets";
import UploadReceipt from "./pages/UploadReceipt";
import ReviewQueue from "./pages/ReviewQueue";
import OcrPipeline from "./pages/OcrPipeline";
import "./App.css";

const App: React.FC = () => (
  <div className="app-shell">
    <Sidebar />
    <main className="main-container">
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/budgets" element={<Budgets />} />
        <Route path="/upload-receipt" element={<UploadReceipt />} />
        <Route path="/ocr-pipeline" element={<OcrPipeline />} />
        <Route path="/review-queue" element={<ReviewQueue />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </main>
  </div>
);

export default App;
