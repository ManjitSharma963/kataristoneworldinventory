import { useState } from 'react';

export const useExpensesForms = ({ getLocalDateString, getLocalMonthString }) => {
  const [formData, setFormData] = useState({
    date: getLocalDateString(),
    category: '',
    description: '',
    amount: '',
    paymentMethod: 'cash',
    employeeId: ''
  });

  const [salaryFormData, setSalaryFormData] = useState({
    employeeName: '',
    salaryAmount: '',
    joiningDate: getLocalDateString()
  });

  const [paySalaryFormData, setPaySalaryFormData] = useState({
    month: getLocalMonthString(),
    date: getLocalDateString(),
    paymentMethod: 'cash',
    amount: ''
  });

  const [payAdvanceFormData, setPayAdvanceFormData] = useState({
    employeeId: '',
    amount: '',
    date: getLocalDateString()
  });

  const [clientPurchaseFormData, setClientPurchaseFormData] = useState({
    purchaseDescription: '',
    totalAmount: '',
    purchaseDate: getLocalDateString(),
    dueDate: '',
    notes: ''
  });

  const [clientPaymentFormData, setClientPaymentFormData] = useState({
    purchaseId: '',
    amount: '',
    date: getLocalDateString(),
    paymentMethod: 'cash',
    notes: ''
  });

  const [showCustomCategoryInput, setShowCustomCategoryInput] = useState(false);
  const [customCategoryDraft, setCustomCategoryDraft] = useState('');

  return {
    formData,
    setFormData,
    salaryFormData,
    setSalaryFormData,
    paySalaryFormData,
    setPaySalaryFormData,
    payAdvanceFormData,
    setPayAdvanceFormData,
    clientPurchaseFormData,
    setClientPurchaseFormData,
    clientPaymentFormData,
    setClientPaymentFormData,
    showCustomCategoryInput,
    setShowCustomCategoryInput,
    customCategoryDraft,
    setCustomCategoryDraft
  };
};

