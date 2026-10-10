# CampusPilot AI — Backend Services & Integration Layer

This folder houses the backend services, microservices, and webhook bridges supporting CampusPilot AI:

1. **API Gateway / Webhook Relays**:
   - Webhook ingress and egress bridges between n8n, frontend clients, and external providers.
   - Voice agent callback listeners (OmniDimension, Retell, Twilio).

2. **Database Integration**:
   - Direct connection utilities to PostgreSQL / Supabase for transactional operations and audit history queries.
   - Scripted seed loaders and migration runners.

3. **Notification Utilities**:
   - SMTP / email dispatch handlers and templates.
   - SMS / WhatsApp integration hooks for critical campus announcements.

---

### Getting Started

```bash
cd backend
npm install
npm run dev
```
