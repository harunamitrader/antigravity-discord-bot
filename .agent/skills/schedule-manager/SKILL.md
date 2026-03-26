# schedule-manager — Scheduled Job Management

Manage periodic jobs for Antigravity Discord Bot.
Jobs are stored as individual JSON files in `data/jobs/` inside the bot's directory.
The bot watches this directory with Chokidar — changes are applied immediately without restart.

## Bot Directory

The bot is installed at the path configured during setup (see README).
Default: the directory where `discord_bot.js` is located.

## Job File Format

Each file = one job. Filename (without `.json`) is the job name.

```json
{
  "cron": "0 9 * * *",
  "message": "GitHubトレンド記事を作成して",
  "active": true
}
```

| Field     | Description |
|-----------|-------------|
| `cron`    | 5-field cron expression, **JST (Asia/Tokyo)**. Required. |
| `message` | Text to inject into current Antigravity session. Required. |
| `active`  | `true` = enabled, `false` = paused (file kept, job stopped). Default: `true`. |

## Cron Examples (JST)

| Expression    | Meaning |
|---------------|---------|
| `0 9 * * *`   | Every day at 09:00 |
| `30 8 * * 1-5`| Weekdays at 08:30 |
| `0 */2 * * *` | Every 2 hours |
| `*/30 * * * *`| Every 30 minutes |
| `0 9 * * 1`   | Every Monday at 09:00 |

## Operations

### Add a job
Create a new file in `<BOT_DIR>/data/jobs/<name>.json`:
```json
{
  "cron": "0 9 * * *",
  "message": "GitHubトレンド記事を作成して",
  "active": true
}
```
The bot detects the new file automatically.

### Edit a job
Edit the existing file. The bot reloads it automatically.

### Pause a job
Set `"active": false` in the file. The cron task stops; the file is kept.

### Remove a job
Delete the file from `data/jobs/`. The bot stops the task automatically.

### List jobs
List all `.json` files in `<BOT_DIR>/data/jobs/`.

## Notes

- Restart the bot only if Chokidar is not running (e.g., after a crash).
- Do not edit files while the bot is processing a job trigger — wait a moment.
- Use descriptive names: `github-trend-daily.json`, `ai-monitor-weekly.json`.
