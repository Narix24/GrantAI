# 🚀 Grant-AI Production Deployment Checklist

## 🛠️ Pre-Deployment
- [ ] Run health checks: `npm run health-check`
- [ ] Complete manual QA checklist
- [ ] Database migrations applied: `npm run migrate`
- [ ] Admin user created: `npm run create-admin -- --email admin@yourcompany.com --password "SecurePassword123!"`
- [ ] Environment variables set in production (see .env.example)
- [ ] SSL certificate installed and enforced
- [ ] Rate limiting configured in production

## 🚀 Deployment
- [ ] Build frontend: `npm run build`
- [ ] Start services with process manager (PM2/Docker)
- [ ] Verify health endpoint: `curl https://your-domain.com/api/system/health`
- [ ] Test user authentication flow
- [ ] Generate test proposal and verify AI response
- [ ] Check monitoring dashboards (Sentry/LogRocket)

## 👀 Post-Deployment Monitoring
- [ ] Review Sentry error dashboard for 24 hours
- [ ] Watch LogRocket session recordings of first users
- [ ] Check system metrics (CPU, memory, response times)
- [ ] Verify email/PDF generation works in production
- [ ] Confirm chaos recovery procedures function
- [ ] Review application logs for warnings/errors

## 📞 Emergency Contacts
- DevOps/SRE: your-email@company.com
- Product Manager: product-manager@company.com
- Customer Support Lead: support@company.com
- 24/7 Pager: +1-555-123-4567