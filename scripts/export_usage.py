"""Daily, read-only aggregation. Publish only after the entire query succeeds."""
import argparse
import csv
from datetime import datetime, timedelta
import fcntl
import io
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
from zoneinfo import ZoneInfo

TIERS = {2: ('default', 0.4), 6: ('tier_1', 0.32), 7: ('tier_2', 0.28), 8: ('tier_3', 0.24)}
MODELS = {
    'gpt-6-astra': 'GPT-6 Astra', 'gpt-5.6-terra': 'GPT-5.6 Terra',
    'gpt-5.6-sol': 'GPT-5.6 Sol', 'gpt-5.6-luna': 'GPT-5.6 Luna',
    'gpt-5.6': 'GPT-5.6', 'gpt-5.5': 'GPT-5.5',
    'gpt-5.4': 'GPT-5.4', 'gpt-5.4-mini': 'GPT-5.4 Mini',
}


def make_snapshot(rows, previous, start, end):
    models = []
    for model, label in MODELS.items():
        old = next((m for m in previous.get('models', []) if m['id'] == model), {})
        samples = {r['group_id']: r for r in old.get('samples', []) if r['group_id'] in TIERS}
        for row in rows:
            if row['model'] != model or row['group_id'] not in TIERS:
                continue
            if not all(math.isfinite(row[k]) and row[k] > 0
                       for k in ('total_tokens', 'actual_cost', 'requests', 'days')):
                continue
            if row['requests'] < 10 or row['days'] < 2:
                continue
            old_row = samples.get(row['group_id'])
            if old_row and old_row['window_end'] > end:
                continue
            samples[row['group_id']] = {**row, 'window_start': start, 'window_end': end}
        models.append({'id': model, 'label': label, 'samples': list(samples.values())})
    if not any(m['samples'] for m in models):
        raise ValueError('No usable samples; keep previous snapshot')
    return {'version': 1, 'generated_at': datetime.now(ZoneInfo('Asia/Shanghai')).isoformat(),
            'window_start': start, 'window_end': end, 'models': models}


def atomic_write(path, content):
    fd, name = tempfile.mkstemp(dir=path.parent, prefix='.usage-')
    try:
        with os.fdopen(fd, 'w') as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(name, 0o644)
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def query(start, end):
    # SQL is generated only from source-controlled IDs and ISO dates, never HTTP input.
    model_names = ','.join("'%s'" % name for name in MODELS)
    sql = f"""
    WITH bounds AS (
      SELECT '{start}'::timestamp AT TIME ZONE 'Asia/Shanghai' AS lo,
             '{end}'::timestamp AT TIME ZONE 'Asia/Shanghai' AS hi
    ), requests AS (
      SELECT DISTINCT ON (u.user_id, COALESCE(NULLIF(u.request_id,''), 'row:' || u.id::text)) u.*
      FROM usage_logs u, bounds b
      WHERE u.created_at >= b.lo AND u.created_at < b.hi AND u.group_id IN (2,6,7,8)
      ORDER BY u.user_id, COALESCE(NULLIF(u.request_id,''), 'row:' || u.id::text), u.id DESC
    ), eligible AS (
      SELECT *, regexp_replace(model, '-proxy$', '') AS canonical_model
      FROM requests WHERE actual_cost > 0 AND input_tokens >= 0 AND output_tokens >= 0
        AND cache_read_tokens >= 0 AND cache_creation_tokens >= 0
        AND COALESCE(image_count,0)=0 AND COALESCE(video_count,0)=0
    ), totals AS (
      SELECT group_id,canonical_model AS model,count(*) AS requests,
        count(DISTINCT (created_at AT TIME ZONE 'Asia/Shanghai')::date) AS days,
        sum(input_tokens::bigint) AS input_tokens, sum(output_tokens::bigint) AS output_tokens,
        sum(cache_read_tokens::bigint) AS cache_read_tokens,
        sum(cache_creation_tokens::bigint) AS cache_creation_tokens,
        sum(input_tokens::bigint+output_tokens+cache_read_tokens+cache_creation_tokens) AS total_tokens,
        sum(actual_cost) AS actual_cost
      FROM eligible WHERE canonical_model IN ({model_names}) GROUP BY group_id,canonical_model
    ) SELECT json_build_object(
      'groups', (SELECT json_agg(json_build_object('id',id,'name',name,'multiplier',rate_multiplier))
                 FROM groups WHERE id IN (2,6,7,8) AND deleted_at IS NULL AND status='active'),
      'rows', COALESCE((SELECT json_agg(t) FROM totals t),'[]'::json));
    """
    command = ['docker', 'exec', '-i', 'sub2api-postgres', 'sh', '-c',
               'PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=60000" '
               'exec psql -X -qAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"']
    result = subprocess.run(command, input=sql, text=True, capture_output=True, timeout=75, check=True)
    data = json.loads(result.stdout)
    actual = {g['id']: (g['name'], g['multiplier']) for g in data['groups'] or []}
    if actual != TIERS:
        raise ValueError('Production tier mapping changed; refusing to publish')
    return [{**r, 'group_name': TIERS[r['group_id']][0], 'multiplier': TIERS[r['group_id']][1]}
            for r in data['rows']]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    with (args.output_dir / '.export.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        end = datetime.now(ZoneInfo('Asia/Shanghai')).date()
        start = end - timedelta(days=30)
        target = args.output_dir / 'latest.json'
        previous = json.loads(target.read_text()) if target.exists() else {}
        rows = query(start.isoformat(), end.isoformat())
        snapshot = make_snapshot(rows, previous, start.isoformat(), end.isoformat())
        buffer = io.StringIO()
        fields = ['group_id','group_name','multiplier','model','requests','days','input_tokens',
                  'output_tokens','cache_read_tokens','cache_creation_tokens','total_tokens','actual_cost',
                  'window_start','window_end']
        writer = csv.DictWriter(buffer, fieldnames=fields)
        writer.writeheader()
        writer.writerows({**r, 'window_start': str(start), 'window_end': str(end)} for r in rows)
        atomic_write(args.output_dir / 'aggregates.csv', buffer.getvalue())
        if target.exists():
            atomic_write(args.output_dir / 'previous.json', target.read_text())
        atomic_write(target, json.dumps(snapshot, ensure_ascii=False, allow_nan=False))
        print(f'Published {len(rows)} model/group aggregates for {start} through {end} (exclusive)')


if __name__ == '__main__':
    main()
