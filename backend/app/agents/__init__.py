"""Agent modules. Importing this package registers every agent with the engine.

Add a new agent: create a module here with an `@register_agent` class and import it below.
"""
from . import growth, regulatory  # noqa: F401
