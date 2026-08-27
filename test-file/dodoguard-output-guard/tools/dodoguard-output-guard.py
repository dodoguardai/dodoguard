import re
from collections.abc import Generator
from typing import Any

from dify_plugin import Tool
from dify_plugin.entities.tool import ToolInvokeMessage

class DodoguardOutputGuardTool(Tool):
    def _invoke(self, tool_parameters: dict[str, Any]) -> Generator[ToolInvokeMessage]:
        text = str(tool_parameters.get("text") or "")
        window_size = self._positive_int(tool_parameters.get("window_size"), 500)
        step = self._positive_int(tool_parameters.get("step"), 400)
        if step > window_size:
            step = window_size

        findings: list[dict[str, Any]] = []
        patterns = {
            "phone": re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)"),
            "email": re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]+\b"),
            "id_card": re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)"),
            "api_key": re.compile(r"\b(?:sk|key|token)[-_]?[A-Za-z0-9_-]{12,}\b", re.I),
        }

        if not text:
            yield self.create_json_message({
                "allowed": True,
                "action": "pass",
                "reason": "empty_text",
                "findings": [],
            })
            return

        for start in range(0, len(text), step):
            window = text[start : start + window_size]
            if not window:
                break
            for risk_type, pattern in patterns.items():
                for match in pattern.finditer(window):
                    findings.append({
                        "risk_type": risk_type,
                        "window_start": start,
                        "window_end": start + len(window),
                        "match_start": start + match.start(),
                        "match_end": start + match.end(),
                    })
            if start + window_size >= len(text):
                break

        yield self.create_json_message({
            "allowed": not findings,
            "action": "pass" if not findings else "block",
            "reason": "no_sensitive_content" if not findings else "sensitive_content_detected",
            "window_size": window_size,
            "step": step,
            "findings": findings,
        })

    @staticmethod
    def _positive_int(value: Any, default: int) -> int:
        try:
            parsed = int(value)
            return parsed if parsed > 0 else default
        except (TypeError, ValueError):
            return default
