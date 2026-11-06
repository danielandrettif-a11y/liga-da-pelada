#!/usr/bin/env python3
"""Compare COPY counts from a filtered Supabase export to a local restore."""

import argparse
import re
import subprocess
import sys
from pathlib import Path

COPY = re.compile(r'^COPY (?:"([^"]+)"|([a-z_][a-z_0-9]*))\.(?:"([^"]+)"|([a-z_][a-z_0-9]*)) \(')
REQUIRED = {'auth.users', 'storage.buckets', 'storage.objects'}


def export_counts(stream):
    counts = {}
    active = None
    selected = False
    total = 0
    for line in stream:
        if active is None:
            match = COPY.match(line)
            if match:
                schema = match.group(1) or match.group(2)
                table = match.group(3) or match.group(4)
                active = f'{schema}.{table}'
                selected = schema == 'public' or active in REQUIRED
                total = 0
        elif line.rstrip('\r\n') == r'\.':
            if selected:
                if active in counts:
                    raise ValueError('COPY duplicado')
                counts[active] = total
            active = None
        elif selected:
            total += 1
    if active is not None:
        raise ValueError('COPY incompleto')
    if not REQUIRED.issubset(counts) or not any(x.startswith('public.') for x in counts):
        raise ValueError('exportacao sem tabelas obrigatorias')
    return counts


def destination_counts(output):
    counts = {}
    for line in output.splitlines():
        if not line.strip():
            continue
        parts = line.split('\t')
        if len(parts) != 2 or not parts[1].isdigit() or parts[0] in counts:
            raise ValueError('inventario do destino invalido')
        counts[parts[0]] = int(parts[1])
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('data_sql', type=Path)
    parser.add_argument('--container', required=True)
    parser.add_argument('--database', default='postgres')
    args = parser.parse_args()
    with args.data_sql.open(encoding='utf-8', newline='') as stream:
        source = export_counts(stream)
    inventory = Path(__file__).resolve().parents[1] / 'database' / 'migration-inventory.sql'
    result = subprocess.run(
        ['docker', 'exec', '-i', args.container, 'psql', '-X', '-q', '-t', '-A',
         '-v', 'ON_ERROR_STOP=1', '-U', 'supabase_admin', '-d', args.database],
        input=inventory.read_text(encoding='utf-8'), text=True, capture_output=True, check=True,
    )
    destination = destination_counts(result.stdout)
    differences = sorted(name for name in set(source) | set(destination)
                         if source.get(name) != destination.get(name))
    print(f'export_tables={len(source)} restored_tables={len(destination)} '
          f'export_rows={sum(source.values())} restored_rows={sum(destination.values())} '
          f'differences={len(differences)}')
    for name in differences:
        print(f'{name}: export={source.get(name)} restored={destination.get(name)}', file=sys.stderr)
    return int(bool(differences))


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (OSError, UnicodeError, ValueError, subprocess.CalledProcessError) as error:
        print(f'Falha na verificacao: {type(error).__name__}', file=sys.stderr)
        raise SystemExit(2)
