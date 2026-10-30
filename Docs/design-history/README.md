# Design history

This folder keeps design proposals that were written before a feature was built. They record the questions, the decisions and the risk reviews of that time. They are not current documentation.

- The proposals are in Brazilian Portuguese, the working language of their design sessions. They are kept in their original form.
- Each status line describes the state on its own date. Do not read it as the current state.
- The features that these proposals describe are now built. The current behaviour is documented in English in [Architecture](../ARCHITECTURE.md), [Goal planning](../GOAL-PLANNING.md), the [User guide](../USER-GUIDE.md) and the [Data dictionary](../DATA-DICTIONARY.md).

## Proposals

| Document | Date | Summary | Current documentation |
|---|---|---|---|
| [Learning platform](LEARNING-PLATFORM-PROPOSAL.md) | 20 Oct 2026 | Makes the goal the main workspace: a roadmap of steps, tasks, focus sessions and review in one place. Adds a local MCP adapter, so that an agent can read the records and create or edit goals, roadmaps and tasks. Includes a risk review of the structural change. | [Learning workspace and local agent bridge](../ARCHITECTURE.md#learning-workspace-and-local-agent-bridge-unreleased), [Goal planning](../GOAL-PLANNING.md) |
| [Behaviour data science, phase 1](BEHAVIOUR-DATA-SCIENCE-PROPOSAL.md) | 22 Oct 2026 | Plans a full data cycle for focus records: collect a few new local signals (window-switch counts, optional attention check-ins, reflection answers), clean them with explicit rules, analyse them with interpretable statistics, and show the results in the Insights tab and a read-only agent tool. Rejects deep learning for single-person data. Defines schema 10 and backup 10. | [Behaviour insights (schema 10)](../ARCHITECTURE.md#behaviour-insights-schema-10-unreleased), [Visual design: Insights tab](../VISUAL-DESIGN.md#insights-tab) |
