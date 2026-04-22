"""Tests for patient route helpers."""

from api.routes.patients import _apply_order


class FakeQuery:
    def __init__(self):
        self.calls: list[tuple[str, bool]] = []

    def order(self, column: str, desc: bool = False):
        self.calls.append((column, desc))
        return self


class TestApplyOrder:
    def test_parses_desc_order(self):
        query = FakeQuery()

        result = _apply_order(query, "timestamp.desc")

        assert result is query
        assert query.calls == [("timestamp", True)]

    def test_parses_asc_order(self):
        query = FakeQuery()

        result = _apply_order(query, "patient_id.asc")

        assert result is query
        assert query.calls == [("patient_id", False)]

    def test_ignores_missing_order(self):
        query = FakeQuery()

        result = _apply_order(query, None)

        assert result is query
        assert query.calls == []
