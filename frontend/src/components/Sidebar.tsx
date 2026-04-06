import React from "react";
import { NavLink } from "react-router-dom";
import "./Sidebar.css";

const links = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/expenses", label: "Expense List" },
  { to: "/upload-receipt", label: "Upload Receipt" },
  { to: "/ocr-pipeline", label: "OCR Pipeline" },
  { to: "/review-queue", label: "Review Queue" },
  { to: "/categories", label: "Categories" },
  { to: "/budgets", label: "Budgets" }
];

const Sidebar: React.FC = () => (
  <aside className="sidebar">
    <div className="brand">Home Budget</div>
    <nav>
      {links.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          className={({ isActive }) =>
            isActive ? "nav-item active" : "nav-item"
          }
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  </aside>
);

export default Sidebar;
