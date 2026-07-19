"""Unit tests for SOAROrchestrator construction and helper methods."""

from __future__ import annotations

import pytest

from aurora_soar import orchestrator as orchestrator_module
from aurora_soar.orchestrator import SOAROrchestrator

from tests.testgen.conftest import (
    FakeAgentInfo,
    FakeAgentRegistry,
    FakeCostTracker,
    FakeLLMClient,
    build_orchestrator,
)


class TestConstruction:
    def test_injected_dependencies_are_kept(self, orchestrator, fake_registry, fake_cost_tracker):
        assert orchestrator.agent_registry is fake_registry
        assert orchestrator.cost_tracker is fake_cost_tracker
        assert orchestrator._use_discovery is False

    def test_no_registry_switches_to_discovery(self, monkeypatch):
        sentinel = object()
        monkeypatch.setattr(
            orchestrator_module.discovery_adapter,
            "get_manifest_manager",
            lambda: sentinel,
        )
        orch = build_orchestrator(registry=None)
        # build_orchestrator always passes a registry; construct directly instead
        orch = SOAROrchestrator(
            store=orch.store,
            config=dict(orch.config),
            reasoning_llm=FakeLLMClient(),
            solving_llm=FakeLLMClient(),
            agent_registry=None,
            cost_tracker=FakeCostTracker(),
            conversation_logger=orch.conversation_logger,
        )
        assert orch._use_discovery is True
        assert orch._manifest_manager is sentinel

    def test_counters_start_at_zero(self, orchestrator):
        assert orchestrator._total_cost == 0.0
        assert orchestrator._token_usage == {"input": 0, "output": 0}


class TestAgentLookup:
    def test_list_agents_uses_registry(self, orchestrator, fake_registry):
        assert orchestrator._list_agents() == fake_registry.list_all()

    def test_get_agent_returns_matching_agent(self, orchestrator):
        agent = orchestrator._get_agent("fake-agent")
        assert agent is not None
        assert agent.agent_id == "fake-agent"

    def test_get_agent_returns_none_for_unknown_id(self, orchestrator):
        assert orchestrator._get_agent("no-such-agent") is None

    def test_get_available_agents_uses_registry(self):
        agents = [FakeAgentInfo(agent_id="a1"), FakeAgentInfo(agent_id="a2")]
        orch = build_orchestrator(registry=FakeAgentRegistry(agents))
        assert [a.agent_id for a in orch._get_available_agents()] == ["a1", "a2"]

    def test_fallback_agent_comes_from_registry(self, orchestrator):
        assert orchestrator._get_or_create_fallback_agent().agent_id == "fallback"

    def test_list_agents_uses_discovery_when_no_registry(self, monkeypatch):
        marker = [FakeAgentInfo(agent_id="discovered")]
        monkeypatch.setattr(
            orchestrator_module.discovery_adapter,
            "get_manifest_manager",
            lambda: object(),
        )
        monkeypatch.setattr(
            orchestrator_module.discovery_adapter,
            "list_agents",
            lambda: marker,
        )
        orch = build_orchestrator()
        orch.agent_registry = None
        orch._use_discovery = True
        assert orch._list_agents() == marker


class TestCallbacks:
    def test_missing_callback_is_a_noop(self, orchestrator):
        orchestrator._invoke_callback("assess", "before")  # must not raise

    def test_callback_receives_phase_status_and_summary(self):
        seen = []
        orch = build_orchestrator()
        orch.phase_callback = lambda phase, status, summary: seen.append((phase, status, summary))
        orch._invoke_callback("decompose", "after", {"subgoals": 3})
        assert seen == [("decompose", "after", {"subgoals": 3})]

    def test_callback_none_summary_becomes_empty_dict(self):
        seen = []
        orch = build_orchestrator()
        orch.phase_callback = lambda phase, status, summary: seen.append(summary)
        orch._invoke_callback("assess", "before", None)
        assert seen == [{}]

    def test_raising_callback_is_swallowed(self):
        def boom(phase, status, summary):
            raise RuntimeError("callback exploded")

        orch = build_orchestrator()
        orch.phase_callback = boom
        orch._invoke_callback("assess", "after", {})  # must not raise

    def test_progress_callback_prints_message(self, orchestrator, capsys):
        cb = orchestrator._get_progress_callback()
        cb("phase 5 running")
        assert capsys.readouterr().out == "phase 5 running\n"


class TestCostTracking:
    def test_track_llm_cost_accumulates_totals(self, orchestrator, fake_cost_tracker):
        cost = orchestrator._track_llm_cost("fake-model", 100, 40, "assess")
        assert cost == 0.005
        assert orchestrator._total_cost == pytest.approx(0.005)
        assert orchestrator._token_usage == {"input": 100, "output": 40}
        assert fake_cost_tracker.recorded[0]["operation"] == "assess"

    def test_track_llm_cost_accumulates_across_calls(self, orchestrator):
        orchestrator._track_llm_cost("fake-model", 10, 5, "assess")
        orchestrator._track_llm_cost("fake-model", 20, 7, "decompose")
        assert orchestrator._token_usage == {"input": 30, "output": 12}
        assert orchestrator._total_cost == pytest.approx(0.010)


class TestClassifyApiError:
    @pytest.mark.parametrize(
        ("message", "expected"),
        [
            ("API error: model: does-not-exist", "invalid_model"),
            ("Invalid model requested", "invalid_model"),
            ("401 Unauthorized", "auth_error"),
            ("bad api key", "auth_error"),
            ("403 Forbidden", "forbidden"),
            ("400 Bad Request", "invalid_request"),
            ("rate limit exceeded", "rate_limit"),
            ("HTTP 429 too many requests", "rate_limit"),
            ("quota exhausted for the month", "rate_limit"),
            ("request timed out after 30s", "timeout"),
            ("500 internal server error", "server_error"),
            ("something inexplicable", "unknown"),
        ],
    )
    def test_classification(self, message, expected):
        assert SOAROrchestrator._classify_api_error(message) == expected

    def test_classification_is_case_insensitive(self):
        assert SOAROrchestrator._classify_api_error("RATE LIMIT") == "rate_limit"
