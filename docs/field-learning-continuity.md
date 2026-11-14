# Persistent confirmed field sources

Owner-approved [SPEC20 L-plan](https://github.com/BMWfan/paperless-ai/issues/20#issuecomment-6874697057),
baseline05d5b9b. This contract precedes the implementation. It extends the earlier
no-new-field-tables scope only inside the existing SQLite learning database.
No additional DB/server, native definitions, provider context, automatic writer,
model inference, CI workflow or production installation is introduced.

## Observable behavior

A confirmed field correction remains a label source after unrelated title/tag
changes, including a subsequently confirmed title-only event. Its source event
stays the original field correction; a title confirmation is not new field proof.
An observed field value/presence or correspondent/document-type scope change
invalidates that field source. A→B→A and remove→re-add are new generations and
cannot restore old permission by equality. Unknown changes need explicit review;
confirmed_ui auto/hybrid behavior stays unchanged. Disabled/self_write observations
still update field state, but create no new learning event by themselves.

These are states of **committed observations**, not instantaneous native truth.
Unobserved changes and pending stabilization candidates are not certified as
observed. Label ownership remains unverified; historical false suggestions from
PR29 stay reported. There is no new confirmation action for unchanged assignments
or per-field review UI, and no qualification for unattended extraction.

## Schema and lifecycle

Migration4 adds three tables, leaving all existing columns/rows/history intact:

- `learning_field_state`: (document_id,field_id) primary key, canonical value JSON,
  presence bit, scope JSON, monotonic generation and last synced document snapshot
  revision. Tombstones distinguish absent from present/null and prevent reuse.
- `learning_event_fields`: (event_id,field_id) primary key, document and generation
  captured only for actual field changes in newly recorded events.
- `learning_field_sources`: (document_id,field_id) primary key, confirmed event and
  its generation; it does not copy native field definitions or create another
  event history. Removing a binding never deletes historical events.

Within the existing Observe transaction: after stabilization/revision checks,
commit the document snapshot and synchronize field state to its revision. Increment
only for value/presence/scope changes or an untracked revision gap; invalidate
sources before binding a new event's changed fields. Independent metadata changes
advance the synced snapshot revision without changing field generation.

Within the existing Review transaction: retain the complete-metadata freshness
check; additionally reject a newly mapped stale generation before changing any
example/status/history. Confirm sources only for mapped, present nonempty fields
of the appropriate generation. Events predating migration without mappings can
still use the old document review contract, but do not gain implicit field proof.

Existing document-wide revocation removes every field binding of that document
and advances its generations, so an older pending event cannot undo revocation.
A later title-only confirmation cannot recreate bindings. A new genuine field
change and eligible explicit confirmation may create a new binding.

The optional `fieldCorrections()` reader groups only currently bound fields by
confirmed source event, at most500 events. Its before/after field lists exclude
unbound fields. Existing document examples, protections and legacy feedback keep
their previous APIs/behavior. Label generation retains its existing source/text/
candidate/reference limits and fresh native type/definition guards.

## Migration, reopening and rollback

All migration/backfill work is inside the existing schema transaction. Seed current
field states from current snapshots. Backfill only existing active examples whose
confirmed event, stored metadata and snapshot are identical, and only genuinely
changed nonempty fields matching that state. Do not import stale/pending/legacy
history or infer pre-migration generations. Insert version4 last. Reopening does
not rerun backfill or resurrect revoked bindings.

Reconcile stored states with snapshots on reopen. Each state records the snapshot
revision last synchronized. If an older app version wrote observations without
updating the new tables, a revision gap invalidates affected document sources
conservatively, even if the final value returned to its old value. No claim is
made about unrecorded native changes or direct database tampering.

Code rollback leaves the additive tables and history intact; do not DROP/reset
or destructively downgrade data. Redeployment reconciles revision gaps and never
blindly repeats backfill. A transaction failure rolls back old and new learning
state together; migration failure closes the connection and leaves no partial
version4 marker/tables/backfill.

An existing version4 marker without the required field tables is an incompatible
schema lineage: startup fails closed rather than overwriting that marker or
guessing its meaning. Keep such data intact and diagnose it separately; a fresh
disposable test DB is not evidence of migrating that incompatible lineage.

## Ordered verification

1. SQLite lifecycle: original source survives title/tag changes, unknown title-only
   changes and later title confirmation; different field changes preserve only
   unaffected sources; original event provenance remains available.
2. Unknown/self_write/disabled field changes, removals, A→B→A, scope changes, stale
   review, revocation and stabilization/revision skips never resurrect permission.
3. Realistic v3 DB fixtures (active/stale/pending/legacy), repeat open, migration
   rollback, observation/review rollback, and old-code revision-gap reconciliation.
   Preserve historical IDs, metadata, settings, events and review actors.
4. Real ngx correction→review→title edit/review→new document→hint retains the
   original field event. Observed field change/revocation removes the hint. Browser
   checks origin/edit/explicit-save; restart and3.4.1→3.4.2 upgrade preserve state.
5. Existing Node22/API/browser/SQLite/migration and relevant lint/Python checks in
   the isolated test stack; no production documents/endpoints. Commands follow
   [test-environment.md](test-environment.md). Exact SHA/results/limitations and
   separate own review are recorded in the PR after execution, not assumed here.

Architecture, hint/Manual contracts and project status are updated with the
implementation. Merge, image publication and deployment remain separate owner
approvals. The existing model-quality issues remain open.
