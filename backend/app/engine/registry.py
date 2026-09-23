from __future__ import annotations

from .base import AgentModule

_AGENTS: dict[str, AgentModule] = {}


def register_agent(cls: type[AgentModule]) -> type[AgentModule]:
    instance = cls()
    if not instance.id:
        raise ValueError(f"{cls.__name__} must define an `id`")
    _AGENTS[instance.id] = instance
    return cls


def all_agents() -> list[AgentModule]:
    return list(_AGENTS.values())


def get_agent(agent_id: str) -> AgentModule | None:
    return _AGENTS.get(agent_id)
