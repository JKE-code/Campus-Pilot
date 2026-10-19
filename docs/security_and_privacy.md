# CampusPilot AI — Security, Cryptographic Audit & DPDP 2023 Compliance Runbook

## 1. Regulatory Alignment: Digital Personal Data Protection (DPDP) Act 2023

CampusPilot AI handles sensitive institutional information, including student directory records and guardian contact numbers. The platform adheres strictly to the core tenets of the Indian DPDP Act 2023 and international privacy standards:

### Principle 1: Purpose Limitation & Lawful Basis
* **Outbound Voice Verification Calls:** Automated guardian calls are executed exclusively for physical campus safety and hostel outpass verification.
* **Verifiable Consent Logs (`dpdp_consents` table):** Before any voice call is dispatched, student consent is logged with timestamp, exact purpose disclosure, and IP address.

### Principle 2: Data Minimization & Protected Fields
* **Immutable Parent Contacts:** Students cannot edit guardian contact phone numbers via self-service profile APIs. Changes require in-person staff verification at the Warden Desk (`PUT /api/students/:id/parent-contact`).
* **PII Redaction in Application Logs:** Structured logs mask email addresses (`a***@domain.com`), phone numbers (`+1***001`), and redact authentication tokens.

### Principle 3: Right to Data Portability & Right to Erasure
* **Data Portability (`GET /api/privacy/export-data`):** Students can download their entire institutional profile, submitted tickets, outpass history, and consent records as a structured JSON bundle.
* **Right to Erasure (`POST /api/privacy/delete-account`):** Upon student graduation or account termination request, student PII (name, phone, parent details) is permanently anonymized (`erased_uuid@dpdp-anonymized.test`), while preserving cryptographic audit hash chains intact.

---

## 2. Cryptographic Hash-Chained Audit Trail Runbook

### Architectural Mechanism
Every state change on a ticket, incident, or outpass writes a record to the `audit_log` table with an incremental SHA-256 hash:
$$\text{Current Hash} = \text{SHA-256}(\text{Tenant ID} \parallel \text{Actor ID} \parallel \text{Action} \parallel \text{Previous State} \parallel \text{New State} \parallel \text{Previous Hash})$$

### Database-Level Append-Only Enforcement
```sql
CREATE OR REPLACE FUNCTION block_audit_log_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Security Policy Violation: audit_log is append-only and cannot be modified or deleted.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_immutable
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION block_audit_log_modification();
```

### Audit Verification CLI Script
To verify the cryptographic integrity of an institution's audit chain, run:
```bash
node backend/scripts/verify_audit_chain.js --tenant=a0000000-0000-0000-0000-000000000001
```
Expected output:
```text
🔍 [Audit Verifier] Reading 45 audit records for Tenant a0000000-0000-0000-0000-000000000001...
✅ Record 1: Hash verified (Genesis: 0000000000000000...)
✅ Record 2: Hash verified (Chain unbroken)
...
✅ [PASS] 45/45 records cryptographically valid. Zero tampering detected.
```

---

## 3. Production Boot Security Guard Checklist

The CampusPilot server (`backend/src/server.js`) enforces strict boot-time guards that prevent accidental production deployment in vulnerable configurations:

1. **`DEMO_MODE=false`:** Production boot aborts with code 1 if `DEMO_MODE=true`.
2. **`REQUIRE_REAL_DB=true`:** Production boot aborts if PostgreSQL connection fails or falls back to `pg-mem`.
3. **`CORS_ALLOWLIST` Specified:** Production boot aborts if wildcard `*` or unverified origins are permitted.
4. **Secrets Entropy:** Production boot validates that `JWT_SECRET` and `VOICE_HMAC_SECRET` are at least 32 characters long and not set to default developer placeholders.
