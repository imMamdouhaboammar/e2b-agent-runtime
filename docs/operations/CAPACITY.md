# Capacity Planning and Quotas

This document details the quotas and capacity configurations enforced.

## Resource Limits
- **Max Active Workers**: 3 (per Controller instance, scale up to 10 in config).
- **Max Workspace Capacity**: 50 total records.
- **Max Terminals Per Workspace**: 3 active PTYs.
- **Max Browser Sessions**: 2 per workspace.
- **Max Browser Pages**: 5 per browser session.

## Soft vs Hard Limits
- **Soft Limits**: Log a warning when resource utilization hits 80% capacity.
- **Hard Limits**: Reject state-changing operations and return quota error status when 100% capacity is reached.
