import React from 'react';

const InlineToast = ({ message, type = 'success', onClose }) => {
  if (!message) return null;
  return (
    <div className={`inline-toast inline-toast-${type}`} role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" onClick={onClose} aria-label="Close message">×</button>
    </div>
  );
};

export default InlineToast;
