"""Shared fakes for the SOAR orchestrator test suite.

All dependencies are injected plain fakes: no network, no real models, no
filesystem state outside tmp_path. Current behavior of the orchestrator is
treated as the spec.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

import pytest

from aurora_soar.orchestrator import SOAROrchestrator


@dataclass
class FakeResponse:
    content: str = "fake answer"
    model: str = "fake-model"
    input_tokens: int = 10
    output_tokens: int = 5


class FakeLLMClient:
    """Minimal LLM client: records calls, returns a canned response."""

    def __init__(self, content: str = "fake answer"):
        self.default_model = "fake-model"
        self.calls: list[dict[str, Any]] = []
        self._content = content

    def generate(self, prompt: str, max_tokens: int = 1024, temperature: float = 0.7, **kwargs: Any):
        self.calls.append(
            {"prompt": prompt, "max_tokens": max_tokens, "temperature": temperature},
        )
        return FakeResponse(content=self._content)


class FakeCostTracker:
    """Cost tracker that always allows the budget and charges a fixed rate."""

    def __init__(self, allow: bool = True, message: str = ""):
        self.allow = allow
        self.message = message
        self.recorded: list[dict[str, Any]] = []

    def estimate_cost(self, model: str, prompt_length: int, max_output_tokens: int) -> float:
        return 0.01

    def check_budget(self, estimated_cost: float, raise_on_exceeded: bool = True):
        return (self.allow, self.message)

    def record_cost(self, model: str, input_tokens: int, output_tokens: int, operation: str) -> float:
        self.recorded.append(
            {
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "operation": operation,
            },
        )
        return 0.005

    def get_status(self) -> dict[str, Any]:
        return {"consumed_usd": 0.0, "limit_usd": 100.0}


class FakeConversationLogger:
    """Conversation logger stub: records calls, writes nothing."""

    def __init__(self):
        self.events: list[tuple[str, tuple[Any, ...], dict[str, Any]]] = []

    def __getattr__(self, name: str):
        def _record(*args: Any, **kwargs: Any):
            self.events.append((name, args, kwargs))
            return None

        return _record


@dataclass
class FakeAgentInfo:
    agent_id: str = "fake-agent"
    name: str = "Fake Agent"
    description: str = "does nothing"
    capabilities: list[str] = field(default_factory=lambda: ["general"])


class FakeAgentRegistry:
    """Registry with a fixed set of agents."""

    def __init__(self, agents: list[FakeAgentInfo] | None = None):
        self.agents = agents if agents is not None else [FakeAgentInfo()]

    def list_all(self) -> list[FakeAgentInfo]:
        return list(self.agents)

    def get(self, agent_id: str) -> FakeAgentInfo | None:
        for a in self.agents:
            if a.agent_id == agent_id:
                return a
        return None

    def create_fallback_agent(self) -> FakeAgentInfo:
        return FakeAgentInfo(agent_id="fallback", name="Fallback Agent")


class FakeStore:
    """Memory store stub; retrieval is monkeypatched at the phase module."""

    def __getattr__(self, name: str):
        def _noop(*args: Any, **kwargs: Any):
            return None

        return _noop


DISABLED_MONITORING_CONFIG: dict[str, Any] = {
    "proactive_health_checks": {"enabled": False},
    "early_detection": {"enabled": False},
    "budget": {"monthly_limit_usd": 100.0},
    "logging": {"conversation_logging_enabled": False},
}


@pytest.fixture(autouse=True)
def aurora_dir(tmp_path, monkeypatch):
    """QueryMetrics resolves ./.aurora from cwd; give every test its own."""
    (tmp_path / ".aurora").mkdir()
    monkeypatch.chdir(tmp_path)


@pytest.fixture
def fake_registry() -> FakeAgentRegistry:
    return FakeAgentRegistry()


@pytest.fixture
def fake_reasoning_llm() -> FakeLLMClient:
    return FakeLLMClient()


@pytest.fixture
def fake_solving_llm() -> FakeLLMClient:
    return FakeLLMClient(content="solved: 42")


@pytest.fixture
def fake_cost_tracker() -> FakeCostTracker:
    return FakeCostTracker()


def build_orchestrator(
    registry: FakeAgentRegistry | None = None,
    cost_tracker: FakeCostTracker | None = None,
    reasoning_llm: FakeLLMClient | None = None,
    solving_llm: FakeLLMClient | None = None,
    config: dict[str, Any] | None = None,
    **kwargs: Any,
) -> SOAROrchestrator:
    """Construct an orchestrator wired entirely with fakes."""
    return SOAROrchestrator(
        store=FakeStore(),
        config=config if config is not None else dict(DISABLED_MONITORING_CONFIG),
        reasoning_llm=reasoning_llm if reasoning_llm is not None else FakeLLMClient(),
        solving_llm=solving_llm if solving_llm is not None else FakeLLMClient(content="solved: 42"),
        agent_registry=registry if registry is not None else FakeAgentRegistry(),
        cost_tracker=cost_tracker if cost_tracker is not None else FakeCostTracker(),
        conversation_logger=FakeConversationLogger(),
    )


@pytest.fixture
def orchestrator(fake_registry, fake_cost_tracker, fake_reasoning_llm, fake_solving_llm) -> SOAROrchestrator:
    return build_orchestrator(
        registry=fake_registry,
        cost_tracker=fake_cost_tracker,
        reasoning_llm=fake_reasoning_llm,
        solving_llm=fake_solving_llm,
    )
