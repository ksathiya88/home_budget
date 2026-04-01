import React from "react";

type Props = {
  title: string;
  message?: string;
};

const EmptyState: React.FC<Props> = ({ title, message }) => (
  <div className="empty-state">
    <div>{title}</div>
    {message && <div className="subtle">{message}</div>}
  </div>
);

export default EmptyState;
