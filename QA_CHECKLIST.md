# 🧪 Grant-AI Manual QA Checklist

Run this checklist before each production deployment. Estimated time: 15 minutes.

## 🚪 Authentication Flows
- [ ] New user registration works with valid email/password
- [ ] Login with valid credentials redirects to dashboard

- [ ] Login with invalid credentials shows appropriate error
- [ ] Password reset flow completes successfully
- [ ] Session timeout after 30 minutes of inactivity

## 📝 Proposal Creation & Generation
- [ ] Create new proposal form loads without errors
- [ ] All required fields (title, mission statement, organization) validate properly
- [ ] Proposal generation starts without errors
- [ ] Generated proposal content loads in editor
- [ ] Tone analysis shows results after generation
- [ ] Voice playback works for generated content

## 🔍 Grant Discovery
- [ ] Grant search page loads without errors
- [ ] Search filters (deadline, amount, categories) work as expected
- [ ] Grant details page shows complete information
- [ ] Calendar reminder setup works for selected grants

## 📤 Submission Workflow
- [ ] Email submission form loads with correct recipient field
- [ ] PDF attachment generates correctly
- [ ] DKIM-signed email sends without errors
- [ ] Success confirmation appears after submission

## ⚙️ Admin Dashboard
- [ ] System health metrics display current status
- [ ] Chaos controls are accessible to admin users only
- [ ] Recovery procedures trigger properly
- [ ] Resource usage charts update in real-time

## 🌐 Multi-language Support
- [ ] Language selector appears in header
- [ ] All UI elements translate correctly when language changes
- [ ] Proposal generation works in non-English languages
- [ ] Date formats adapt to locale settings

## 📱 Mobile Responsiveness
- [ ] All pages load without horizontal scrolling on mobile
- [ ] Form inputs are properly sized for touch interaction
- [ ] Navigation menus collapse appropriately on small screens
- [ ] Voice playback controls work on touch devices

## 🚨 Error Handling
- [ ] Network errors show user-friendly messages
- [ ] Form validation provides clear error feedback
- [ ] Rate limiting applies after multiple failed login attempts
- [ ] Server errors (5xx) display generic error page without exposing details