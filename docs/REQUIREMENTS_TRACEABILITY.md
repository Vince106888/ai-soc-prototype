# Requirements Traceability Matrix

| ID | Requirement | Source objective/question | Planned component | Evidence |
|---|---|---|---|---|
| FR-01 | Accept only controlled or user-authorised inputs | Objective 2; RQ2 | Ingestion adapter | API tests, OAuth scope record |
| FR-02 | Normalise message and security-event inputs | Objective 2 | Normalisation layer | Schema tests |
| FR-03 | Detect suspicious sender/reply-to patterns | Objective 3; RQ3 | Email rules | Labelled scenario results |
| FR-04 | Detect suspicious URL features | Objective 3; RQ3 | URL rules | URL test set, confusion matrix |
| FR-05 | Detect selected posture weaknesses where available | Objective 3; RQ3 | Posture adapter | Capability matrix, scenarios |
| FR-06 | Record evidence for every finding | RQ4 | Finding model | API response and database tests |
| FR-07 | Compute transparent severity and confidence | Objective 3; RQ4 | Scoring engine | Score fixtures and calibration notes |
| FR-08 | Correlate related findings into incidents | Objective 3; RQ4 | Correlation engine | Correlation scenarios |
| FR-09 | Display incidents, evidence and status | Objective 4 | Dashboard/API | Screenshot and acceptance test |
| FR-10 | Provide safe, understandable guidance | Objective 4; RQ4 | Explanation layer | Approved-answer review |
| FR-11 | Record audit events without secrets | NFR privacy/security | Audit layer | Security checklist and tests |
| NFR-01 | Protect tokens and secrets | NFR security | Config/secret handling | Secret scan and review |
| NFR-02 | Minimise and protect collected data | NFR privacy | Storage policy | Retention/deletion tests |
| NFR-03 | Provide repeatable evaluation runs | Objective 5; RQ5 | Evaluation harness | Metrics report |
| NFR-04 | Maintain modular, testable code | Methodology | Repository architecture | CI and coverage report |

