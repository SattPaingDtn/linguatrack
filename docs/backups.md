# Learning history export and database backups

## Learner export

Sign in and choose **My progress → Export learning data**. The authenticated `/api/learning/export` endpoint downloads versioned JSON containing only that learner's profile, every content-version completion, attempt/answer snapshot, mistake review and study session. Auth tokens and passwords are never exported. Retry a failed download; it does not alter saved records.

Sync pending answers first: an export contains acknowledged database records. Browser pending answers are separately stored under `linguatrack:pending:v1:<user-id>` in localStorage. If synchronization is blocked, preserve that value using browser developer tools before clearing site data. It contains selected answers, IDs and content versions, not answer keys or auth credentials. There is no automatic JSON import in this phase.

## Reset your learning data

After exporting if needed, open **My progress → Reset progress and history**, type `RESET` and choose **Permanently reset**. The same control appears in nonempty Review history. This clears your completed lessons, all quiz attempts and answers, mistake reviews, study sessions and resume position across content versions. It retains your login and the curriculum. This is permanent; the app has no undo or history import.

Pending pre-reset answers on all devices become invalid. This device clears them only after confirmation; other devices discard them when refreshing the account snapshot and show a notice. If reset fails or its acknowledgement is lost, keep the dialog open and retry: the same request cannot delete newly added progress a second time. Reloading also lets you check whether the reset committed. Migration `20261011000300_reset_learning.sql` must be applied first; applying the migration itself does not delete learning data.

## Administrator backup

Keep backups outside Git, encrypted and access-controlled. Hosted Supabase backup availability and retention depend on the project's current plan; verify the Dashboard backup settings rather than assuming point-in-time recovery is enabled. Follow [Supabase backup guidance](https://supabase.com/docs/guides/platform/backups) for managed restores.

For an independent logical backup using a linked Supabase CLI project (the CLI dump wrapper requires a running Docker runtime):

```bash
mkdir -p backups
supabase db dump --linked --role-only -f backups/roles.sql
supabase db dump --linked -f backups/schema.sql
supabase db dump --linked --data-only --use-copy -f backups/data.sql
```

The directory is ignored. Schema dumps exclude Supabase-managed definitions such as `auth` and `storage`; inspect the data dump to verify the auth records included by your CLI version. These commands alone are **not a complete authentication/asset backup**. Explicitly follow the provider's current [backup/restore procedure](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) for auth schema data, roles and storage objects, and inspect the dumps to confirm `private.lesson_catalog` plus all six personal tables are included. Auth user IDs must exist before restoring rows that reference them. Keep migration files alongside backups. Restore the custom `learning_profile_signup` trigger on `auth.users` from the schema migration/provider-managed-schema diff if the schema dump omitted it.

Do not paste database passwords, access tokens or service-role keys into scripts, Git or issue logs. Use CLI prompts or secure PostgreSQL connection configuration with least necessary access. Never restore into the active learning database as a test.

## Restore drill

1. Provision an isolated test project with matching compatible PostgreSQL/extensions and provider-managed schemas.
2. Follow the provider's role/schema/data restore order, including the required auth user records. Preserve immutable response and attempt snapshots. The curriculum immutability trigger prevents casually rewriting published catalog rows; restore the original schema/data rather than replaying conflicting catalog inserts.
3. Validate row counts, ownership policies, function permissions, auth-user foreign keys and the private catalog. Account IDs must map to the original personal history.
4. Use two test accounts to verify isolation, login and history/export; answer a new quiz question and retry its delivery to verify RPCs and triggers.
5. Record the backup time, restore time and verified scope. Only schedule a real recovery after a successful drill and an explicit operational decision.

Migration rollback is not an automatic history deletion strategy. Use forward migrations and verified backups for changes to stored learning data.
