import { useId } from 'react'

export function WelcomeStory() {
  const titleId = useId()
  const descriptionId = useId()
  return (
    <svg
      className="welcome-story"
      viewBox="0 0 620 460"
      role="img"
      aria-labelledby={`${titleId} ${descriptionId}`}
    >
      <title id={titleId}>How SentinelSME turns a selected message into reviewable evidence</title>
      <desc id={descriptionId}>
        A synthetic email flows through deterministic rules into a prioritised incident. The illustration labels the
        rule evidence, review priority and human decision without showing a real mailbox.
      </desc>
      <defs>
        <linearGradient id="story-panel" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#f4f8ff" />
        </linearGradient>
        <linearGradient id="story-line" x1="0" x2="1">
          <stop offset="0" stopColor="#93c5fd" stopOpacity=".2" />
          <stop offset=".5" stopColor="#2563eb" stopOpacity=".9" />
          <stop offset="1" stopColor="#93c5fd" stopOpacity=".2" />
        </linearGradient>
        <filter id="story-shadow" x="-20%" y="-20%" width="140%" height="150%">
          <feDropShadow dx="0" dy="14" floodColor="#0f172a" floodOpacity=".12" stdDeviation="18" />
        </filter>
        <pattern id="story-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M28 0H0v28" fill="none" stroke="#c9d9f2" strokeOpacity=".48" strokeWidth=".7" />
        </pattern>
      </defs>

      <rect width="620" height="460" rx="30" fill="#eef4fc" />
      <rect x="28" y="26" width="564" height="408" rx="24" fill="url(#story-grid)" />
      <circle cx="498" cy="92" r="68" fill="#dbeafe" opacity=".8" />
      <circle cx="502" cy="92" r="42" fill="none" stroke="#93c5fd" strokeWidth="1.2" strokeDasharray="4 7" />

      <g filter="url(#story-shadow)">
        <rect x="62" y="92" width="204" height="270" rx="18" fill="url(#story-panel)" stroke="#d5e2f4" />
        <rect x="82" y="114" width="44" height="44" rx="12" fill="#e9f1ff" />
        <path d="M93 128h22M93 136h15M93 144h20" stroke="#2563eb" strokeLinecap="round" strokeWidth="2" />
        <text x="142" y="132" fill="#0f172a" fontSize="12.6" fontWeight="700">Selected message</text>
        <text x="142" y="151" fill="#52627b" fontSize="9.9">Synthetic example</text>

        <rect x="82" y="180" width="164" height="42" rx="10" fill="#f7faff" stroke="#dce7f5" />
        <text x="96" y="198" fill="#64748b" fontSize="8.1" fontWeight="700" letterSpacing=".7">SENDER</text>
        <text x="96" y="213" fill="#1e293b" fontSize="9.9">notice@billing-example.test</text>
        <rect x="82" y="232" width="164" height="42" rx="10" fill="#f7faff" stroke="#dce7f5" />
        <text x="96" y="250" fill="#64748b" fontSize="8.1" fontWeight="700" letterSpacing=".7">SUBJECT</text>
        <text x="96" y="265" fill="#1e293b" fontSize="9.9">Verify your account immediately</text>
        <rect x="82" y="286" width="164" height="54" rx="10" fill="#fff8ed" stroke="#f0d8b1" />
        <text x="96" y="305" fill="#92500c" fontSize="8.1" fontWeight="700" letterSpacing=".7">BOUNDARY</text>
        <text x="96" y="320" fill="#70400e" fontSize="9.5">Body reduced to matched phrases</text>
        <text x="96" y="333" fill="#70400e" fontSize="9.5">Links are never opened</text>
      </g>

      <path d="M278 224h62" fill="none" stroke="url(#story-line)" strokeWidth="2" />
      <circle cx="310" cy="224" r="7" fill="#fff" stroke="#2563eb" strokeWidth="2" />
      <circle cx="310" cy="224" r="2.5" fill="#2563eb" />

      <g filter="url(#story-shadow)">
        <rect x="348" y="126" width="210" height="196" rx="18" fill="#0f172a" />
        <rect x="368" y="146" width="34" height="34" rx="9" fill="#1d4ed8" />
        <path d="m378 164 4 4 8-9" fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.3" />
        <text x="414" y="160" fill="#f8fafc" fontSize="11.7" fontWeight="700">Deterministic rules</text>
        <text x="414" y="177" fill="#9fb2ce" fontSize="9">Two findings corroborate</text>
        <rect x="368" y="202" width="170" height="38" rx="9" fill="#18263e" stroke="#2b3d5a" />
        <text x="382" y="218" fill="#8fa6c8" fontSize="8.1" fontWeight="700">RULE</text>
        <text x="382" y="232" fill="#e2e8f0" fontSize="9.5">EMAIL-001 · reply-to mismatch</text>
        <rect x="368" y="248" width="170" height="38" rx="9" fill="#18263e" stroke="#2b3d5a" />
        <text x="382" y="264" fill="#8fa6c8" fontSize="8.1" fontWeight="700">RULE</text>
        <text x="382" y="278" fill="#e2e8f0" fontSize="9.5">EMAIL-002 · urgency language</text>
        <path d="M368 304h170" stroke="#2b3d5a" />
        <text x="368" y="319" fill="#93c5fd" fontSize="9" fontWeight="700">Evidence stays traceable</text>
      </g>

      <g filter="url(#story-shadow)">
        <rect x="312" y="342" width="248" height="64" rx="16" fill="#ffffff" stroke="#d5e2f4" />
        <circle cx="342" cy="374" r="17" fill="#fff1f1" />
        <path d="M342 365v11m0 6h.01" stroke="#b42318" strokeLinecap="round" strokeWidth="2" />
        <text x="370" y="369" fill="#0f172a" fontSize="11.2" fontWeight="700">Incident · High priority</text>
        <text x="370" y="386" fill="#52627b" fontSize="9.5">Priority 72/100 · human review required</text>
        <rect x="516" y="358" width="28" height="28" rx="8" fill="#eff6ff" />
        <path d="m526 372 4 4 7-8" fill="none" stroke="#1d4ed8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      </g>

      <g>
        <rect x="420" y="48" width="142" height="30" rx="15" fill="#ffffff" stroke="#cfe0f7" />
        <circle cx="438" cy="63" r="4" fill="#2563eb" />
        <text x="450" y="67" fill="#345988" fontSize="9.5" fontWeight="700">Rules decide</text>
      </g>
      <g>
        <rect x="62" y="386" width="206" height="30" rx="15" fill="#ffffff" stroke="#cfe0f7" />
        <circle cx="80" cy="401" r="4" fill="#067647" />
        <text x="92" y="405" fill="#345988" fontSize="9.5" fontWeight="700">AI may explain, never decide</text>
      </g>
    </svg>
  )
}

export function EmptyWorkspaceArt() {
  return (
    <svg className="empty-art" viewBox="0 0 260 170" role="img" aria-label="A selected message moving into an evidence review queue">
      <rect x="10" y="20" width="240" height="130" rx="18" fill="#f2f7ff" />
      <path d="M30 96h54l12-32 22 70 18-48 12 10h52" fill="none" stroke="#93b8ef" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <rect x="30" y="40" width="92" height="48" rx="10" fill="#fff" stroke="#cbdcf2" />
      <path d="M43 55h44M43 65h64M43 75h34" stroke="#8ca5c5" strokeLinecap="round" strokeWidth="2" />
      <circle cx="201" cy="56" r="18" fill="#e5efff" />
      <path d="M193 56h16m-7-7 7 7-7 7" fill="none" stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <rect x="168" y="86" width="66" height="44" rx="10" fill="#fff" stroke="#cbdcf2" />
      <path d="M180 101h42M180 111h30" stroke="#8ca5c5" strokeLinecap="round" strokeWidth="2" />
    </svg>
  )
}

export function PrivacyBoundaryArt() {
  return (
    <svg className="privacy-art" viewBox="0 0 360 240" role="img" aria-label="A private workspace boundary retaining minimised evidence and excluding message bodies and attachments">
      <rect width="360" height="240" rx="24" fill="#f3f7fd" />
      <circle cx="180" cy="120" r="76" fill="none" stroke="#bcd2f1" strokeDasharray="5 8" />
      <circle cx="180" cy="120" r="52" fill="#e8f0ff" />
      <path d="M180 82 150 94v22c0 20 12 36 30 42 18-6 30-22 30-42V94l-30-12Z" fill="#fff" stroke="#2563eb" strokeWidth="2" />
      <path d="m166 120 9 9 19-21" fill="none" stroke="#1d4ed8" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      <g fill="#fff" stroke="#cbdcf2">
        <rect x="18" y="34" width="82" height="38" rx="9" />
        <rect x="260" y="36" width="82" height="38" rx="9" />
        <rect x="22" y="168" width="94" height="42" rx="9" />
        <rect x="248" y="166" width="94" height="42" rx="9" />
      </g>
      <g fill="#52627b" fontSize="9" fontWeight="600">
        <text x="32" y="57">Selected message</text>
        <text x="274" y="59">Rule evidence</text>
        <text x="36" y="186">No full body</text>
        <text x="262" y="184">No attachments</text>
      </g>
    </svg>
  )
}

export function GmailFlowArt() {
  return (
    <svg className="gmail-art" viewBox="0 0 340 200" role="img" aria-label="A read-only Gmail sample passing through consent into minimised evidence">
      <rect width="340" height="200" rx="20" fill="#f3f7fd" />
      <rect x="24" y="38" width="100" height="124" rx="14" fill="#fff" stroke="#cbdcf2" />
      <rect x="38" y="54" width="38" height="38" rx="9" fill="#e8f0ff" />
      <path d="m46 69 11 8 11-8" fill="none" stroke="#2563eb" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M38 104h68M38 116h54M38 128h62" stroke="#9bb0cb" strokeLinecap="round" strokeWidth="2" />
      <path d="M132 100h50" stroke="#2563eb" strokeDasharray="4 5" strokeWidth="2" />
      <circle cx="170" cy="100" r="24" fill="#e8f0ff" stroke="#b9d0ef" />
      <path d="M162 94v12m0-6h16m-16 0v-4a3 3 0 0 1 3-3h2m8 10v4a3 3 0 0 1-3 3h-2" fill="none" stroke="#1d4ed8" strokeLinecap="round" strokeWidth="2" />
      <rect x="214" y="40" width="102" height="120" rx="14" fill="#0f172a" />
      <text x="230" y="64" fill="#93c5fd" fontSize="9" fontWeight="700">READ ONLY</text>
      <text x="230" y="86" fill="#e2e8f0" fontSize="9.9">Bounded sample</text>
      <text x="230" y="104" fill="#9fb2ce" fontSize="9">No send</text>
      <text x="230" y="120" fill="#9fb2ce" fontSize="9">No delete</text>
      <text x="230" y="136" fill="#9fb2ce" fontSize="9">No attachments</text>
    </svg>
  )
}
