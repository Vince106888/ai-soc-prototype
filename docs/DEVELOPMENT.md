# Development Standards

## Branches and commits

- `main` is always expected to be buildable.
- Use short-lived branches: `feature/<issue>-name`, `fix/<issue>-name`, `docs/<issue>-name`.
- Use Conventional Commit style where practical: `feat:`, `fix:`, `test:`, `docs:`, `build:`, `security:`.
- Every implementation change should reference an issue.

## Pull requests

Each PR must state:

- problem and scope;
- design decision;
- tests run and results;
- security/privacy impact;
- documentation/evidence updated;
- known limitations.

## Definition of done

- acceptance criteria satisfied;
- tests cover normal and failure paths;
- no secrets or private test data committed;
- logs do not expose tokens or raw sensitive content;
- API/schema changes documented;
- evidence artifact location recorded;
- CI passes.

## Evidence discipline

Evaluation fixtures, expected outputs, screenshots and logs must be versioned or reproducibly generated. Manual screenshots without a reproducible scenario are not sufficient evidence.

