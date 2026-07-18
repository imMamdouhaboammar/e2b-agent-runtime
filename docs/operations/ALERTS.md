# Alerting Configurations

This document details alerts, severities, likely causes, and runbook links.

### Alert: Controller Availability Drop
- **Condition**: Availability < 99.0% over 5m window.
- **Severity**: Critical.
- **Likely Causes**: DNS issue, crashing server loops, database disconnects.
- **Escalation**: Notify on-call engineer.
- **Runbook Link**: [DEPLOYMENT.md](file:///Users/mamdouhaboammar/Documents/antigravity/beautiful-curie/docs/operations/DEPLOYMENT.md)

### Alert: Worker Creation Latency Spike
- **Condition**: p95 duration > 30s over 10m window.
- **Severity**: Warning.
- **Likely Causes**: E2B cloud provider latency, template loading slowdowns.
