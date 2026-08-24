# AI-SOC Prototype Project Charter

## 1. Product definition

AI-SOC is a defensive, privacy-aware prototype for small organisations using cloud email and online accounts without a dedicated security analyst. It converts selected authorised security signals into prioritised incidents with evidence and safe, understandable response guidance.

The first release is a research prototype, not a commercial SOC, a compliance product, an autonomous response system, or a replacement for Google Workspace, Microsoft Defender, SIEM, or professional incident response.

## 2. Primary user and supported environment

The primary user is a micro or small organisation with limited cybersecurity capacity. The first integration target is one Google cloud-email environment, using only scopes and telemetry demonstrably available to the test account. Controlled fixtures are a first-class fallback when live administrative telemetry is unavailable.

The supported environment must be frozen before live integration work begins. Personal Gmail and managed Google Workspace accounts must not be treated as equivalent.

## 3. v1 capabilities

### In scope

- controlled email/message fixture ingestion;
- selected authorised Gmail/Workspace metadata ingestion where feasible;
- deterministic phishing and suspicious-link indicators;
- selected account-security posture indicators where available;
- evidence-backed severity scoring;
- time/account/message-based incident correlation;
- dashboard views for incidents, findings, evidence and response guidance;
- bounded AI-assisted or template-based explanation;
- audit logging, privacy controls and evaluation evidence.

### Out of scope

- endpoint detection and response;
- packet capture or network intrusion detection;
- malware execution or sandboxing;
- credential collection or offensive testing;
- unrestricted multi-tenant SaaS deployment;
- guaranteed real-time monitoring;
- legal/compliance certification;
- autonomous account changes or remediation;
- complete protection against all cyber threats.

## 4. Design principles

1. **Evidence before explanation:** every alert must expose the indicators that caused it.
2. **Deterministic core:** detection, scoring and correlation remain transparent and testable.
3. **Bounded intelligence:** AI may explain structured findings; it cannot execute actions or override policy.
4. **Least privilege:** collect the smallest signal set needed for each evaluated capability.
5. **Privacy by construction:** minimise raw message content, protect tokens, define retention and support deletion.
6. **Vertical slices:** each iteration must produce a demonstrable path from input to user outcome.
7. **Research traceability:** every objective must map to requirements, implementation evidence and evaluation results.

## 5. Success definition

The prototype is successful when it can process labelled controlled scenarios end-to-end, produce evidence-backed findings and incidents with deterministic outcomes, present safe and understandable guidance, and report measurable detection, integration, security and usability results with limitations clearly stated.

## 6. Non-goals and claim discipline

The project must not claim that it detects account takeover reliably in the general case, provides full real-time coverage, replaces an enterprise SOC, or makes autonomous AI security decisions unless those claims are separately implemented and evidenced.

