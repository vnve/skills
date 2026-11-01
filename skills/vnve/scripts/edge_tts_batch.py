#!/usr/bin/env python3
"""Optional host-side edge-tts batch helper. No vnve project writes or auto-import.

Default: validate only. --execute sends the explicitly planned lines to Microsoft.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import time


def validate(plan):
    items = plan.get('items') if isinstance(plan, dict) else None
    if not isinstance(items, list) or not items:
        raise ValueError('Expected a nonempty items array')
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            raise ValueError('Each item must be an object')
        for key in ('sceneId', 'nodeId'):
            if not isinstance(item.get(key), str) or not re.fullmatch(r'[A-Za-z0-9_-]+', item[key]):
                raise ValueError(f'{key} must be a filename-safe stable ID')
        key = (item['sceneId'], item['nodeId'])
        if key in seen:
            raise ValueError('Duplicate sceneId/nodeId')
        seen.add(key)
        if 'expectedActorId' not in item or not (item['expectedActorId'] is None or isinstance(item['expectedActorId'], str) and item['expectedActorId']):
            raise ValueError('expectedActorId is required; use JSON null for narration')
        text = item.get('expectedText')
        if not isinstance(text, str) or not text.strip():
            raise ValueError('expectedText must contain speech')
        if '<#' in text or re.search(r'\([^)]*\)', text):
            raise ValueError('Check tagged/parenthesized speech separately: this helper does not translate MiniMax pause or interjection markers')
        if not isinstance(item.get('voice'), str) or not item['voice'].strip():
            raise ValueError('Select an actual voice from edge-tts --list-voices first')
        for field, unit in (('rate', '%'), ('volume', '%'), ('pitch', 'Hz')):
            if field in item and (not isinstance(item[field], str) or not re.fullmatch(r'[+-]\d+' + re.escape(unit), item[field])):
                raise ValueError(f'Invalid {field}')
    return items


def command(executable, item, output):
    # Keep each option and value together. Equals syntax handles negative numbers.
    return [executable, '--voice', item['voice'], f"--text={item['expectedText']}",
            '--write-media', str(output), f"--rate={item.get('rate', '+0%')}",
            f"--pitch={item.get('pitch', '+0Hz')}", f"--volume={item.get('volume', '+0%')}"]


def generate(items, output, executable, run=subprocess.run, sleep=time.sleep):
    output.mkdir(parents=True, exist_ok=False)
    successes, failures = [], []
    for index, item in enumerate(items):
        if index:
            sleep(1.5)
        folder = output / item['sceneId']
        folder.mkdir(exist_ok=True)
        target = folder / (item['nodeId'] + '.mp3')
        temporary = folder / (item['nodeId'] + '.partial.mp3')
        reason = 'synthesis_failed'
        for delay in (0, 2, 5, 8):
            if delay:
                sleep(delay)
            temporary.unlink(missing_ok=True)
            try:
                result = run(command(executable, item, temporary), stdout=subprocess.DEVNULL,
                             stderr=subprocess.PIPE, timeout=120, check=False)
                valid = result.returncode == 0 and temporary.is_file() and temporary.stat().st_size >= 1024
                if valid:
                    temporary.rename(target)
                    successes.append({key: item[key] for key in ('sceneId', 'nodeId', 'expectedText', 'expectedActorId')} |
                                     {'kind': 'voice', 'file': str(target.relative_to(output))})
                    break
                reason = 'nonzero_exit' if result.returncode else 'missing_or_short_audio'
            except subprocess.TimeoutExpired:
                reason = 'timeout'
            except OSError:
                reason = 'tool_unavailable'
                break
        if not target.exists():
            failures.append({'sceneId': item['sceneId'], 'nodeId': item['nodeId'], 'reason': reason})
        temporary.unlink(missing_ok=True)
    # Import is deliberately separate: inspect again, then let vnve validate media/snapshots.
    (output / 'import.json').write_text(json.dumps({'items': successes}, ensure_ascii=False, indent=2), encoding='utf-8')
    report = {'ok': not failures, 'generated': len(successes), 'failed': failures}
    (output / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('plan', type=Path)
    parser.add_argument('--output-dir', type=Path, required=True, help='New directory only')
    parser.add_argument('--execute', action='store_true', help='Generate the already-authorized plan')
    args = parser.parse_args()
    items = validate(json.loads(args.plan.read_text(encoding='utf-8')))
    if not args.execute:
        print(json.dumps({'ok': True, 'planned': len(items), 'executed': False}))
        return
    executable = shutil.which('edge-tts')
    if not executable:
        raise ValueError('edge-tts is not installed; use the selected host environment')
    report = generate(items, args.output_dir.resolve(), executable)
    print(json.dumps(report, ensure_ascii=False))
    raise SystemExit(0 if report['ok'] else 1)


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        raise SystemExit(str(error)) from error
