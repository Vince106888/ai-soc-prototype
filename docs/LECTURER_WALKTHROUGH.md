# A five-minute product walkthrough

The intended handover is one public HTTPS link. A lecturer signs in with their
Google account and receives a private workspace. No installation, workspace ID
or API key is needed. The final public URL follows domain/VPS selection and live
Google callback acceptance; the laptop's localhost preview is not a public link.

1. **Open the link and sign in.** Explain: “This is your workspace. Signing in
   does not give us access to your inbox.” Show the separate Gmail option only
   if it is configured and approved for the deployment.
2. **Analyse a selected email.** Use an explicitly synthetic sample or a message
   the presenter owns. Enter the sender, reply-to, subject and selected text.
   Acknowledge permission and run analysis. The body is processed transiently;
   the workspace retains minimised indicators.
3. **Open the resulting incident.** Explain what was observed, why each rule
   matched, and the recommended verification step. Show the Evidence tab and
   copied rule weights. Priority is not the probability of an attack.
4. **Record a review decision.** Move the case to Under review with a note.
   Show the Activity tab. The product records the user's decision and does not
   change anything in Gmail. Optional AI rewrites structured findings only;
   the deterministic explanation remains available during inference or failure.
5. **Hand over the product.** Invite the lecturer to sign in with another Google
   account and verify their workspace is separate. Show sign-out, privacy,
   retention information and permanent account deletion. Give them the actual
   HTTPS URL once live acceptance is complete.

Safe synthetic message for the selected-message form:

```text
Sender address: support@example.test
Reply-to address: recovery@different.test
Sender display name: Account Support
Subject: Urgent: verify your account
Selected message text:
Your account is suspended. Verify your account immediately to confirm your identity.
```

Do not promise every suspicious email will be detected. The product evaluates
specific indicators in supplied or consented data. Missing findings are not a
safety guarantee. Account posture answers are self-reported, not automatically
retrieved administrator telemetry.

Before presenting, rehearse the complete journey with a disposable account and
the actual deployed URL. Keep the synthetic sample available if provider
consent or connectivity fails; label that mode clearly.
