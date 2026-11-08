"""Reduce connector telemetry to anonymous, bounded city signals.

No conversation, title, prompt, credential, identifier, screenshot or upstream
label is returned. TTLs mirror the real connector snapshots: browser45s,
official Codex900s and bot120s. Being registered or connected is not activity.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Iterable

PROVIDERS = frozenset({'chatgpt', 'claude', 'gemini', 'grok'})
MEMORY_JOB = 'Revisão de planejamento, memória e foco'
UNKNOWN = {'state': 'unknown', 'label': 'Sem sinal recente'}


def valid_primary(value: Any) -> bool:
    return (isinstance(value, dict) and isinstance(value.get('jobs'), list)
            and isinstance(value.get('codex'), list)
            and (value.get('focus') is None or isinstance(value.get('focus'), dict)))


def recent(value: Any, now: datetime, ttl: int, *, inclusive: bool = True) -> bool:
    if not isinstance(value, str):
        return False
    try:
        observed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if observed.tzinfo is None:
            return False
        age = (now - observed.astimezone(timezone.utc)).total_seconds()
        return 0 <= age <= ttl if inclusive else 0 <= age < ttl
    except (ValueError, TypeError, OverflowError):
        return False


def rows(value: Any) -> list[dict]:
    return [row for row in value[:1024] if isinstance(row, dict)] if isinstance(value, list) else []


def normalize_activity(primary: Any, browser: Any, bots: Any, *, now: datetime,
                       place_ids: Iterable[str], stunt_project_id: str | None = None) -> dict:
    now = now.astimezone(timezone.utc)
    places = {kind: dict(UNKNOWN) for kind in place_ids}
    priorities = {kind: 0 for kind in places}

    def offer(kind: str, state: str, label: str, priority: int):
        if kind in places and priority > priorities[kind]:
            places[kind] = {'state': state, 'label': label}
            priorities[kind] = priority

    if valid_primary(primary):
        # These running jobs are scoped by the upstream to its current database.
        # Done/error entries may remain for90s; they do not establish activity.
        for job in rows(primary['jobs']):
            if job.get('state') != 'running':
                continue
            project_id = job.get('project_id')
            if isinstance(project_id, str) and project_id:
                offer('projects', 'working', 'Atividade de projeto em andamento', 90)
                if stunt_project_id and project_id == stunt_project_id:
                    offer('stunt', 'working', 'Atividade de projeto em andamento', 90)
            if job.get('label') == MEMORY_JOB:
                offer('memory', 'working', 'Revisão em andamento', 90)
        focus = primary.get('focus')
        if isinstance(focus, dict) and focus.get('status') == 'running':
            offer('tasks', 'focus', 'Sessão de foco em andamento', 90)
        for signal in rows(primary['codex']):
            if (signal.get('provider') != 'codex' or signal.get('source') != 'official-hook'
                    or not recent(signal.get('observed_at'), now, 900)):
                continue
            # Recent official working/waiting outranks browser observations.
            # An official idle session does not hide a different active tab.
            state = signal.get('state')
            if state == 'working':
                offer('chatgpt', 'working', 'Codex trabalhando', 100)
            elif state == 'waiting':
                offer('chatgpt', 'waiting', 'Codex aguardando ação', 95)
            elif state == 'idle':
                offer('chatgpt', 'idle', 'Codex sem atividade', 20)

    if isinstance(browser, dict):
        for signal in rows(browser.get('signals')):
            provider = signal.get('provider')
            if (not isinstance(provider, str) or provider not in PROVIDERS
                    or signal.get('source') != 'browser'
                    or not recent(signal.get('observed_at'), now, 45)):
                continue
            if signal.get('state') == 'working':
                offer(provider, 'observed', 'Atividade observada no navegador', 80)
            elif signal.get('state') == 'idle':
                offer(provider, 'idle', 'Navegador sem atividade', 10)

    if isinstance(bots, dict):
        for signal in rows(bots.get('bots')):
            if (signal.get('archived') is True or signal.get('sharing') is not True
                    or signal.get('source') != 'bot-report'
                    or not recent(signal.get('received_at'), now, 120, inclusive=False)):
                continue
            # The bot-office route belongs to the authenticated Grok bridge.
            # Names, roles and current task descriptions are not classifications.
            if signal.get('state') == 'running':
                offer('grok', 'observed', 'Atividade informada por bot', 85)
            elif signal.get('state') == 'waiting':
                offer('grok', 'waiting', 'Bot aguardando ação', 75)
            elif signal.get('state') == 'idle':
                offer('grok', 'idle', 'Bot sem atividade', 15)

    return {'places': places,
            'checked_at': now.isoformat(timespec='microseconds').replace('+00:00', 'Z')}
