# Credentials & Configuration Template

**⚠️ IMPORTANT**: This file contains sensitive information. **DO NOT** commit this file to version control!

Add this file to `.gitignore`:
```
CREDENTIALS.md
CREDENTIALS_TEMPLATE.md
```

## 🔐 Authentication Credentials

### Development Environment

**Admin Account:**
- Email: `admin@example.com`
- Password: `[YOUR_ADMIN_PASSWORD]`
- Role: `admin`
- Location: `Bhondsi`

**Test User Account:**
- Email: `test@example.com`
- Password: `[YOUR_TEST_PASSWORD]`
- Role: `user`
- Location: `Tapugada`

### Production Environment

**Admin Account:**
- Email: `[PRODUCTION_ADMIN_EMAIL]`
- Password: `[PRODUCTION_ADMIN_PASSWORD]`
- Role: `admin`

**API Credentials:**
- API Key: `[IF_APPLICABLE]`
- Secret Key: `[IF_APPLICABLE]`

---

## 🌐 API Configuration

### Development
```
API Base URL: http://localhost:8080/api
Backend Port: 8080
Frontend Port: 3000
```

### Staging
```
API Base URL: http://staging-api.example.com/api
Backend URL: http://staging-api.example.com
```

### Production
```
API Base URL: https://api.example.com/api
Backend URL: https://api.example.com
```

---

## 🗄️ Database Configuration

### Development Database
```
Host: localhost
Port: 3306 (MySQL) / 5432 (PostgreSQL)
Database Name: kataria_inventory_dev
Username: [DB_USERNAME]
Password: [DB_PASSWORD]
```

### Production Database
```
Host: [PRODUCTION_DB_HOST]
Port: [PRODUCTION_DB_PORT]
Database Name: [PRODUCTION_DB_NAME]
Username: [PRODUCTION_DB_USERNAME]
Password: [PRODUCTION_DB_PASSWORD]
Connection String: [FULL_CONNECTION_STRING]
```

---

## 🔑 JWT Token Configuration

### Token Settings
```
Secret Key: [JWT_SECRET_KEY]
Expiration: 24 hours (or as configured)
Algorithm: HS256
```

### Token Storage
- Location: `localStorage`
- Key: `authToken`
- Format: `Bearer {token}`

---

## 📧 Email Configuration (If Applicable)

### SMTP Settings
```
SMTP Host: smtp.gmail.com
SMTP Port: 587
Username: [EMAIL_USERNAME]
Password: [EMAIL_PASSWORD]
From Address: noreply@example.com
```

### Email Templates
- Password Reset: `[TEMPLATE_ID]`
- Welcome Email: `[TEMPLATE_ID]`

---

## ☁️ Cloud Storage (If Applicable)

### AWS S3
```
Bucket Name: [BUCKET_NAME]
Region: [AWS_REGION]
Access Key ID: [ACCESS_KEY_ID]
Secret Access Key: [SECRET_ACCESS_KEY]
```

### Google Cloud Storage
```
Bucket Name: [BUCKET_NAME]
Project ID: [PROJECT_ID]
Service Account Key: [SERVICE_ACCOUNT_JSON]
```

---

## 🔒 Security Keys

### Encryption Keys
```
Data Encryption Key: [ENCRYPTION_KEY]
Salt: [SALT_VALUE]
```

### API Keys
```
Google Maps API: [GOOGLE_MAPS_API_KEY]
Payment Gateway API: [PAYMENT_API_KEY]
SMS Gateway API: [SMS_API_KEY]
```

---

## 🌍 Environment Variables

### Development (.env.development)
```env
REACT_APP_API_BASE_URL=http://localhost:8080/api
REACT_APP_ENVIRONMENT=development
REACT_APP_DEBUG=true
```

### Production (.env.production)
```env
REACT_APP_API_BASE_URL=https://api.example.com/api
REACT_APP_ENVIRONMENT=production
REACT_APP_DEBUG=false
```

---

## 📱 Third-Party Services

### Payment Gateway
```
Provider: [STRIPE/PAYPAL/RAZORPAY]
API Key: [PAYMENT_API_KEY]
Secret Key: [PAYMENT_SECRET_KEY]
Webhook Secret: [WEBHOOK_SECRET]
```

### SMS Service
```
Provider: [TWILIO/AWS_SNS]
Account SID: [ACCOUNT_SID]
Auth Token: [AUTH_TOKEN]
Phone Number: [PHONE_NUMBER]
```

### Analytics
```
Google Analytics ID: [GA_TRACKING_ID]
Facebook Pixel ID: [FB_PIXEL_ID]
```

---

## 🚀 Deployment Credentials

### Hosting Provider
```
Provider: [NETLIFY/VERCEL/AWS]
Deployment URL: [DEPLOYMENT_URL]
API Token: [DEPLOYMENT_TOKEN]
```

### Domain Configuration
```
Domain: example.com
SSL Certificate: [CERTIFICATE_INFO]
DNS Provider: [DNS_PROVIDER]
```

---

## 📝 Notes

### Password Policy
- Minimum length: 6 characters
- Recommended: 8+ characters with mix of letters, numbers, symbols
- Change passwords regularly

### Security Best Practices
- [ ] Use strong, unique passwords
- [ ] Enable 2FA where possible
- [ ] Rotate API keys regularly
- [ ] Never commit credentials to Git
- [ ] Use environment variables for sensitive data
- [ ] Encrypt sensitive data at rest
- [ ] Use HTTPS in production

### Backup Information
```
Backup Frequency: Daily
Backup Location: [BACKUP_LOCATION]
Retention Period: 30 days
```

---

## 🔄 Credential Rotation Schedule

| Credential Type | Last Updated | Next Rotation | Responsible |
|----------------|--------------|---------------|-------------|
| Admin Password | [DATE] | [DATE] | [NAME] |
| API Keys | [DATE] | [DATE] | [NAME] |
| Database Password | [DATE] | [DATE] | [NAME] |
| JWT Secret | [DATE] | [DATE] | [NAME] |

---

## 📞 Emergency Contacts

**System Administrator:**
- Name: [NAME]
- Email: [EMAIL]
- Phone: [PHONE]

**Backend Developer:**
- Name: [NAME]
- Email: [EMAIL]
- Phone: [PHONE]

**Database Administrator:**
- Name: [NAME]
- Email: [EMAIL]
- Phone: [PHONE]

---

**⚠️ REMEMBER**: 
- Keep this file secure
- Never share credentials via email
- Use password managers
- Rotate credentials regularly
- Document all changes

---

**Last Updated**: [DATE]
**Last Reviewed**: [DATE]
**Next Review**: [DATE]

