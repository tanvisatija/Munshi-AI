"""Pluggable LLM access with a guaranteed fallback.

Order: Anthropic (ANTHROPIC_API_KEY) -> OpenAI (OPENAI_API_KEY) -> caller-provided mock.
Every provider call is wrapped in try/except. A missing key, network failure, timeout,
refusal or empty answer all degrade to the mock — callers always get text back, so no
page can ever break because of the LLM.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Callable

from .config import settings

log = logging.getLogger("munshi.llm")

Message = dict[str, str]  # {"role": "user" | "assistant", "content": str}


@dataclass
class LLMResult:
    text: str
    source: str  # "anthropic" | "openai" | "mock"


def _anthropic(system: str, messages: list[Message], max_tokens: int) -> str:
    import anthropic

    client = anthropic.Anthropic(
        api_key=settings.anthropic_api_key, timeout=settings.llm_timeout_seconds, max_retries=1
    )
    request = dict(model=settings.anthropic_model, max_tokens=max_tokens, system=system, messages=messages)
    try:
        # Short, grounded business answers — low effort keeps latency demo-friendly.
        response = client.messages.create(**request, output_config={"effort": settings.anthropic_effort})
    except anthropic.BadRequestError:
        # Some models (e.g. Haiku) don't accept `effort`; retry once with the plain request.
        response = client.messages.create(**request)
    if response.stop_reason == "refusal":
        raise RuntimeError("model declined the request")
    text = "".join(block.text for block in response.content if block.type == "text").strip()
    if not text:
        raise RuntimeError("empty response")
    return text


def _openai(system: str, messages: list[Message], max_tokens: int) -> str:
    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key, timeout=settings.llm_timeout_seconds, max_retries=1)
    response = client.chat.completions.create(
        model=settings.openai_model,
        max_completion_tokens=max_tokens,  # accepted by both classic and reasoning chat models
        messages=[{"role": "system", "content": system}, *messages],
    )
    text = (response.choices[0].message.content or "").strip()
    if not text:
        raise RuntimeError("empty response")
    return text


def normalize_history(messages: list[Message]) -> list[Message]:
    """Make a chat history valid for every provider: starts with a user turn, roles alternate
    (consecutive same-role turns are merged), and no empty turns."""
    out: list[Message] = []
    for m in messages:
        role, content = m.get("role"), (m.get("content") or "").strip()
        if role not in ("user", "assistant") or not content:
            continue
        if not out and role != "user":
            continue
        if out and out[-1]["role"] == role:
            out[-1] = {"role": role, "content": out[-1]["content"] + "\n\n" + content}
        else:
            out.append({"role": role, "content": content})
    return out


def provider_status() -> dict[str, object]:
    if settings.llm_provider == "mock":
        active = "mock"
    elif settings.anthropic_api_key:
        active = "anthropic"
    elif settings.openai_api_key:
        active = "openai"
    else:
        active = "mock"
    model = {"anthropic": settings.anthropic_model, "openai": settings.openai_model}.get(active)
    return {"active": active, "model": model}


def complete(
    system: str,
    messages: list[Message],
    mock: Callable[[], str] | str,
    max_tokens: int = 1200,
) -> LLMResult:
    providers: list[tuple[str, Callable[[str, list[Message], int], str]]] = []
    if settings.llm_provider in {"auto", "anthropic"} and settings.anthropic_api_key:
        providers.append(("anthropic", _anthropic))
    if settings.llm_provider in {"auto", "openai"} and settings.openai_api_key:
        providers.append(("openai", _openai))

    messages = normalize_history(messages)
    for name, call in providers:
        try:
            return LLMResult(call(system, messages, max_tokens), name)
        except Exception as exc:  # any failure -> try next provider, then mock
            log.warning("LLM provider %s failed (%s: %s); falling back", name, type(exc).__name__, exc)

    try:
        text = mock() if callable(mock) else mock
    except Exception:
        log.exception("Mock fallback raised; using generic text")
        text = "Munshi is running in offline mode right now. Your numbers above are still live and accurate."
    return LLMResult(text, "mock")
