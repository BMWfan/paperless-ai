// Regression specification for Learning Engine v2.
// An AI classification must never overwrite an explicitly corrected learning example.
// A later explicit user correction may replace a previous confirmed correction.
// Tests will be wired to an isolated temporary SQLite database before enabling automatic learning.
