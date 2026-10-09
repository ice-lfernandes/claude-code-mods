#!/usr/bin/env python3
"""Checks the manifests: every JSON file parses, the marketplace lists every mod and only mods,
each entry's name and description match the mod's plugin.json, versions are x.y.z, and every
option's default is one of its options.

Usage: python3 scripts/check-manifests.py
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
errors = []


def load(path):
    try:
        with open(path) as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        errors.append(f'{path}: {e}')
        return None


mods = sorted(d for d in os.listdir('.') if os.path.isfile(f'{d}/.claude-plugin/plugin.json'))
market = load('.claude-plugin/marketplace.json') or {'plugins': []}
listed = {p.get('name'): p for p in market.get('plugins', [])}

for name in mods:
    if name not in listed:
        errors.append(f'{name}: not listed in .claude-plugin/marketplace.json')

for name, entry in listed.items():
    source = (entry.get('source') or '').removeprefix('./')
    if source not in mods:
        errors.append(f'marketplace {name}: source {entry.get("source")!r} is not a mod folder')
        continue
    plugin = load(f'{source}/.claude-plugin/plugin.json')
    if not plugin:
        continue
    if plugin.get('name') != name:
        errors.append(f'{source}: plugin.json name {plugin.get("name")!r} is not the marketplace name {name!r}')
    if plugin.get('description') != entry.get('description'):
        errors.append(f'{source}: plugin.json description differs from the marketplace entry')
    if not re.fullmatch(r'\d+\.\d+\.\d+', str(plugin.get('version', ''))):
        errors.append(f'{source}: version {plugin.get("version")!r} is not x.y.z')
    for key, option in (plugin.get('userConfig') or {}).items():
        choices = option.get('options')
        if choices is not None and option.get('default') not in choices:
            errors.append(f'{source}: option {key} default {option.get("default")!r} is not one of {choices}')
    hooks = f'{source}/hooks/hooks.json'
    if os.path.exists(hooks):
        load(hooks)

for e in errors:
    print(f'error: {e}')
print(f'{len(mods)} mods, {len(listed)} marketplace entries checked')
sys.exit(1 if errors else 0)
