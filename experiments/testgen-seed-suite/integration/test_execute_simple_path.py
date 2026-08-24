"""Integration tests: execute() driven end-to-end with fake components.

Phase modules assess/retrieve are monkeypatched at the orchestrator module
boundary; everything downstream (simple path, cost tracking, respond
formatting) runs for real against the fakes.
"""

from __future__ import annotations

import pytest

from aurora_core.exceptions import BudgetExceededError
from aurora_soar import orchestrator as orchestrator_module

from tests.testgen.conftest import FakeCostTracker, FakeLLMClient, build_orchestrator


@pytest.fixture
def simple_phases(monkeypatch):
    """Route every query down the SIMPLE path with empty retrieved context."""
    monkeypatch.setattr(
        orchestrator_module.assess,
        "assess_complexity",
        lambda query, _llm_client: {"complexity": "SIMPLE", "confidence": 0.95},
    )
    monkeypatch.setattr(
        orchestrator_module.retrieve,
        "retrieve_context",
        lambda query, complexity, store: {"code_chunks": [], "reasoning_chunks": []},
    )


class TestSimplePath:
    def test_answer_comes_from_solving_llm(self, simple_phases):
        solving = FakeLLMClient(content="the answer is 42")
        orch = build_orchestrator(solving_llm=solving)
        result = orch.execute("what is six times seven?")
        assert result["answer"] == "the answer is 42"

    def test_solving_llm_receives_the_query(self, simple_phases):
        solving = FakeLLMClient()
        orch = build_orchestrator(solving_llm=solving)
        orch.execute("marker-query-xyz")
        assert len(solving.calls) == 1
        assert "marker-query-xyz" in solving.calls[0]["prompt"]

    def test_cost_is_tracked_for_simple_query(self, simple_phases):
        tracker = FakeCostTracker()
        orch = build_orchestrator(cost_tracker=tracker)
        orch.execute("simple question")
        operations = [r["operation"] for r in tracker.recorded]
        assert "simple_query_solving" in operations
        assert orch._total_cost == pytest.approx(0.005)

    def test_token_usage_accumulates_from_response(self, simple_phases):
        orch = build_orchestrator()
        orch.execute("simple question")
        # FakeResponse reports 10 input / 5 output tokens
        assert orch._token_usage == {"input": 10, "output": 5}

    def test_phase_metadata_records_simple_path(self, simple_phases):
        orch = build_orchestrator()
        orch.execute("simple question")
        assert "phase1_assess" in orch._phase_metadata
        assert "phase2_retrieve" in orch._phase_metadata
        assert orch._phase_metadata["phase7_synthesize"]["metadata"]["simple_path"] is True

    def test_phase_callback_fires_before_and_after_assess(self, simple_phases):
        seen = []
        orch = build_orchestrator()
        orch.phase_callback = lambda phase, status, summary: seen.append((phase, status))
        orch.execute("simple question")
        assert ("assess", "before") in seen
        assert ("assess", "after") in seen
        assert ("retrieve", "after") in seen


class TestBudgetEnforcement:
    def test_exceeded_budget_rejects_query(self, simple_phases):
        tracker = FakeCostTracker(allow=False, message="monthly limit reached")
        orch = build_orchestrator(cost_tracker=tracker)
        with pytest.raises(BudgetExceededError):
            orch.execute("any query at all")

    def test_exceeded_budget_makes_no_llm_call(self, simple_phases):
        solving = FakeLLMClient()
        tracker = FakeCostTracker(allow=False, message="monthly limit reached")
        orch = build_orchestrator(cost_tracker=tracker, solving_llm=solving)
        with pytest.raises(BudgetExceededError):
            orch.execute("any query at all")
        assert solving.calls == []


class TestAssessFallback:
    def test_assess_failure_degrades_to_medium(self, monkeypatch):
        def broken_assess(query, _llm_client):
            raise RuntimeError("assess model unavailable")

        monkeypatch.setattr(orchestrator_module.assess, "assess_complexity", broken_assess)
        orch = build_orchestrator()
        result = orch._phase1_assess("some query")
        assert result["complexity"] == "MEDIUM"
        assert result["confidence"] == 0.0
        assert "assess model unavailable" in result["_error"]

    def test_retrieve_failure_yields_empty_context(self, monkeypatch):
        def broken_retrieve(query, complexity, store):
            raise RuntimeError("store offline")

        monkeypatch.setattr(orchestrator_module.retrieve, "retrieve_context", broken_retrieve)
        orch = build_orchestrator()
        result = orch._phase2_retrieve("some query", "MEDIUM")
        assert result["code_chunks"] == []
        assert result["reasoning_chunks"] == []
        assert "store offline" in result["_error"]
