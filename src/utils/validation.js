import * as yup from 'yup';

/** End of today (23:59:59.999) — evaluated fresh each time so today always passes. */
const endOfToday = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
};

const notFutureDate = (label = 'Date') =>
  yup
    .date()
    .required(`${label} is required`)
    .test('not-future', `${label} cannot be in the future`, (value) => {
      if (!value) return true;
      return value <= endOfToday();
    });

// Expense Form Validation Schema
export const expenseSchema = yup.object().shape({
  date: notFutureDate('Date'),
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
    .oneOf(['cash', 'card', 'bank', 'upi', 'other'], 'Invalid payment method'),
  lenderId: yup.string().nullable(),
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
  joiningDate: notFutureDate('Joining date'),
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
    .transform((v) => (v == null ? '' : String(v).trim().toUpperCase()))
    .matches(
      /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
      { message: 'Invalid GSTIN format', excludeEmptyString: true }
    ),
  notes: yup
    .string()
    .max(1000, 'Notes must be less than 1000 characters'),
  tokenAmount: yup
    .string()
    .transform((v) => (v == null ? '' : String(v)))
    .test('token-amount', 'Token amount must be zero or a positive number', (v) => {
      const s = (v || '').trim();
      if (s === '') return true;
      const n = parseFloat(s.replace(/[^\d.]/g, ''));
      return !isNaN(n) && n >= 0 && n <= 1e12;
    }),
  tokenPaymentMode: yup
    .string()
    .oneOf(['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE'])
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
  date: notFutureDate('Payment date'),
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
  date: notFutureDate('Payment date'),
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
  purchaseDate: notFutureDate('Purchase date'),
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
  date: notFutureDate('Payment date'),
  paymentMethod: yup
    .string()
    .required('Payment method is required')
});
