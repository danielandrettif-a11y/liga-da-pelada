#!/usr/bin/env python3

import argparse
import csv
import json
import sys
from pathlib import Path


SECTIONS = {'exact_public_counts', 'signatures'}


def load_json(value, label):
    try:
        result = json.loads(value)
    except json.JSONDecodeError as error:
        raise ValueError(f'{label}: JSON invalido: {error.msg}') from error
    if not isinstance(result, dict):
        raise ValueError(f'{label}: objeto JSON esperado')
    return result


def load_browser_csv(counts_path, signatures_path):
    result = {}
    for section, path in (
        ('exact_public_counts', counts_path),
        ('signatures', signatures_path),
    ):
        with path.open(newline='', encoding='utf-8-sig') as stream:
            rows = list(csv.reader(stream))
        if len(rows) != 2 or rows[0] != [section] or len(rows[1]) != 1:
            raise ValueError(f'{path}: export CSV inesperado para {section}')
        result[section] = load_json(rows[1][0], str(path))
    return result


def load_combined_browser_csv(path):
    result = {}
    with path.open(newline='', encoding='utf-8-sig') as stream:
        reader = csv.DictReader(stream)
        if reader.fieldnames != ['section', 'payload']:
            raise ValueError(f'{path}: colunas section,payload esperadas')
        for line_number, row in enumerate(reader, 2):
            section = row.get('section')
            if section not in SECTIONS:
                raise ValueError(f'{path}:{line_number}: secao invalida')
            if section in result:
                raise ValueError(f'{path}:{line_number}: secao duplicada {section}')
            result[section] = load_json(row.get('payload', ''), str(path))
    missing = sorted(SECTIONS - result.keys())
    if missing:
        raise ValueError(f'{path}: secoes ausentes: {", ".join(missing)}')
    return result


def load_psql_tsv(path):
    result = {}
    for line_number, raw_line in enumerate(
        path.read_text(encoding='utf-8-sig').splitlines(), 1
    ):
        if not raw_line.strip():
            continue
        parts = raw_line.split('\t', 1)
        if len(parts) != 2 or parts[0] not in SECTIONS:
            raise ValueError(f'{path}:{line_number}: linha de inventario invalida')
        if parts[0] in result:
            raise ValueError(f'{path}:{line_number}: secao duplicada {parts[0]}')
        result[parts[0]] = load_json(parts[1], f'{path}:{line_number}')
    missing = sorted(SECTIONS - result.keys())
    if missing:
        raise ValueError(f'{path}: secoes ausentes: {", ".join(missing)}')
    return result


def compare(source, destination):
    source_counts = source['exact_public_counts']
    destination_counts = destination['exact_public_counts']
    source_rows = source_counts.get('rows')
    destination_rows = destination_counts.get('rows')
    if not isinstance(source_rows, dict) or not isinstance(destination_rows, dict):
        raise ValueError('rows deve ser um objeto nas duas contagens')

    table_names = sorted(set(source_rows) | set(destination_rows))
    row_differences = [
        name for name in table_names
        if source_rows.get(name) != destination_rows.get(name)
    ]

    source_signatures = {
        key: value for key, value in source['signatures'].items()
        if key != 'captured_at'
    }
    destination_signatures = {
        key: value for key, value in destination['signatures'].items()
        if key != 'captured_at'
    }
    signature_names = sorted(set(source_signatures) | set(destination_signatures))
    signature_differences = [
        name for name in signature_names
        if source_signatures.get(name) != destination_signatures.get(name)
    ]

    return row_differences, signature_differences


def main():
    parser = argparse.ArgumentParser(
        description='Compara fotografia agregada oficial com um destino local.'
    )
    parser.add_argument('--source-combined-csv', type=Path)
    parser.add_argument('--source-counts-csv', type=Path)
    parser.add_argument('--source-signatures-csv', type=Path)
    parser.add_argument('--destination-tsv', type=Path, required=True)
    args = parser.parse_args()

    try:
        if args.source_combined_csv:
            if args.source_counts_csv or args.source_signatures_csv:
                raise ValueError(
                    'use o CSV combinado ou o par de CSVs, nao ambos'
                )
            source = load_combined_browser_csv(args.source_combined_csv)
        elif args.source_counts_csv and args.source_signatures_csv:
            source = load_browser_csv(
                args.source_counts_csv, args.source_signatures_csv
            )
        else:
            raise ValueError(
                'informe --source-combined-csv ou os dois CSVs separados'
            )
        destination = load_psql_tsv(args.destination_tsv)
        row_differences, signature_differences = compare(source, destination)
    except (OSError, ValueError) as error:
        print(f'erro: {error}', file=sys.stderr)
        return 2

    source_counts = source['exact_public_counts']
    destination_counts = destination['exact_public_counts']
    print(
        'origem: '
        f'{source_counts.get("table_count")} tabelas, '
        f'{source_counts.get("total_rows")} linhas'
    )
    print(
        'destino: '
        f'{destination_counts.get("table_count")} tabelas, '
        f'{destination_counts.get("total_rows")} linhas'
    )
    print(f'tabelas com diferenca: {len(row_differences)}')
    print(f'grupos de assinatura com diferenca: {len(signature_differences)}')

    if row_differences:
        print('tabelas divergentes: ' + ', '.join(row_differences))
    if signature_differences:
        print('assinaturas divergentes: ' + ', '.join(signature_differences))

    return 1 if row_differences or signature_differences else 0


if __name__ == '__main__':
    raise SystemExit(main())
