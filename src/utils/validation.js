import * as yup from 'yup';

// Expense Form Validation Schema
export const expenseSchema = yup.object().shape({
  date: yup
    .date()
    .required('Date is required')
    .max(new Date(), 'Date cannot be in the future'),
  category: yup
    .string()
    .required('Category is required'),
  description: yup
    .string()
    .max(500, 'Description must be less than 500 characters'),
  amount: yup
    .number()
    .required('Amount is required')
    .positive('Amount must be positive')
    .typeError('Amount must be a valid number'),
  paymentMethod: yup
    .string()
    .required('Payment method is required')
    .oneOf(['cash', 'card', 'bank', 'upi', 'other'], 'Invalid payment method')
});

// Employee Form Validation Schema
export const employeeSchema = yup.object().shape({
  employeeName: yup
    .string()
    .required('Employee name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  salaryAmount: yup
    .number()
    .required('Salary amount is required')
    .positive('Salary must be positive')
    .typeError('Salary must be a valid number'),
  joiningDate: yup
    .date()
    .required('Joining date is required')
    .max(new Date(), 'Joining date cannot be in the future')
});

// Customer Form Validation Schema
export const customerSchema = yup.object().shape({
  name: yup
    .string()
    .required('Customer name is required')
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be less than 100 characters'),
  phone: yup
    .string()
    .required('Phone number is required')
    .matches(/^[0-9]{10}$/, 'Phone number must be 10 digits'),
  email: yup
    .string()
    .email('Invalid email address')
    .max(100, 'Email must be less than 100 characters'),
  address: yup
    .string()
    .max(500, 'Address must be less than 500 characters'),
  city: yup
    .string()
    .max(100, 'City must be less than 100 characters'),
  state: yup
    .string()
    .max(100, 'State must be less than 100 characters'),
  pincode: yup
    .string()
    .matches(/^[0-9]{6}$/, 'Pincode must be 6 digits'),
  gstin: yup
    .string()
    .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GSTIN format'),
  notes: yup
    .string()
    .max(1000, 'Notes must be less than 1000 characters')
});

// Salary Payment Schema
export const salaryPaymentSchema = yup.object().shape({
  month: yup
    .string()
    .required('Month is required')
    .matches(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
  amount: yup
    .number()
    .required('Amount is required')
    .positive('Amount must be positive')
    .typeError('Amount must be a valid number'),
  date: yup
    .date()
    .required('Payment date is required')
    .max(new Date(), 'Date cannot be in the future'),
  paymentMethod: yup
    .string()
    .required('Payment method is required')
});

// Advance Payment Schema
export const advancePaymentSchema = yup.object().shape({
  amount: yup
    .number()
    .required('Amount is required')
    .positive('Amount must be positive')
    .typeError('Amount must be a valid number'),
  date: yup
    .date()
    .required('Payment date is required')
    .max(new Date(), 'Date cannot be in the future')
});

// Client Purchase Schema
export const clientPurchaseSchema = yup.object().shape({
  clientName: yup
    .string()
    .required('Client name is required')
    .min(2, 'Name must be at least 2 characters'),
  purchaseDescription: yup
    .string()
    .required('Description is required')
    .max(500, 'Description must be less than 500 characters'),
  totalAmount: yup
    .number()
    .required('Total amount is required')
    .positive('Amount must be positive')
    .typeError('Amount must be a valid number'),
  purchaseDate: yup
    .date()
    .required('Purchase date is required')
    .max(new Date(), 'Date cannot be in the future'),
  notes: yup
    .string()
    .max(1000, 'Notes must be less than 1000 characters')
});

// Client Payment Schema
export const clientPaymentSchema = yup.object().shape({
  purchaseId: yup
    .string()
    .required('Please select a purchase'),
  amount: yup
    .number()
    .required('Payment amount is required')
    .positive('Amount must be positive')
    .typeError('Amount must be a valid number'),
  date: yup
    .date()
    .required('Payment date is required')
    .max(new Date(), 'Date cannot be in the future'),
  paymentMethod: yup
    .string()
    .required('Payment method is required')
});

