#!/usr/bin/env python3
import hashlib
import json
from pathlib import Path
from uuid import UUID

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
INPUT_PATH = ROOT / "docs/测试用例库标准/Agent通用安全测试用例库_105条.xlsx"
OUTPUT_PATH = ROOT / "docs/测试用例库标准/导入SQL_Agent通用安全测试用例库_105条_mysql.sql"


def deterministic_uuid(prefix: str, value: str) -> str:
    digest = hashlib.sha1(f"{prefix}:{value}".encode("utf-8")).hexdigest()
    return str(UUID(f"{digest[:8]}-{digest[8:12]}-{digest[12:16]}-{digest[16:20]}-{digest[20:32]}"))


def esc(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, float) and pd.isna(value):
        return "NULL"
    text = str(value)
    if text == "":
        return "NULL"
    return "'" + text.replace("\\", "\\\\").replace("'", "''") + "'"


def json_sql(value) -> str:
    return esc(json.dumps(value, ensure_ascii=False))


def risk_level(value: str) -> str:
    mapping = {
        "高风险": "high",
        "中风险": "medium",
        "低风险": "low",
        "严重": "critical",
    }
    return mapping.get(str(value).strip(), "medium")


def attack_type(value: str) -> str:
    return "multi_turn" if str(value).strip() == "多轮" else "direct"


def normalize_multiturn_prompt(prompt: str):
    import re

    labels = "一二三四五六七八九十"
    pattern = re.compile(rf"第([{labels}]+)轮[：:]?")
    matches = list(pattern.finditer(prompt))
    if len(matches) < 2:
        if "每轮" in prompt and "最后再" in prompt:
            first, last = prompt.split("最后再", 1)
            first = first.strip(" ，,。；;")
            last = f"最后再{last}".strip(" ，,。；;")
            turns = [
                {"role": "user", "content": first},
                {"role": "user", "content": last},
            ]
            formatted = "\n\n".join(
                f"[轮次 {index + 1}] {turn['content']}" for index, turn in enumerate(turns)
            )
            return formatted, turns
        return prompt, []

    turns = []
    for index, match in enumerate(matches):
        start = match.end()
        end = matches[index + 1].start() if index + 1 < len(matches) else len(prompt)
        content = prompt[start:end].strip(" ，,。；;")
        if content:
            turns.append({"role": "user", "content": content})

    if len(turns) < 2:
        return prompt, []

    formatted = "\n\n".join(
        f"[轮次 {index + 1}] {turn['content']}" for index, turn in enumerate(turns)
    )
    return formatted, turns


cases_df = pd.read_excel(INPUT_PATH, sheet_name="测试用例列表")
scenes_df = pd.read_excel(INPUT_PATH, sheet_name="场景目录")

scene_descriptions = {
    str(row["二级风险场景"]).strip(): str(row["功能描述"]).strip()
    for _, row in scenes_df.iterrows()
}
scene_orders = {
    str(row["二级风险场景"]).strip(): int(row["序号"])
    for _, row in scenes_df.iterrows()
}

library_rows = []
case_rows = []

for (category, scene), group in cases_df.groupby(["一级分类", "二级风险场景"], sort=False):
    first_code_prefix = str(group.iloc[0]["用例编号"]).split("-")[0].lower()
    library_key = f"agent-generic-{first_code_prefix}"
    library_id = deterministic_uuid("agent-generic-library", library_key)
    risks = [risk_level(value) for value in group["风险等级"]]
    default_level = "high" if "high" in risks or "critical" in risks else "medium"

    library_rows.append(
        {
            "id": library_id,
            "library_key": library_key,
            "title": str(scene).strip(),
            "domain": str(category).strip(),
            "description": scene_descriptions.get(str(scene).strip(), f"{scene} Agent 通用安全测试场景库。"),
            "case_count": len(group),
            "enabled": 1,
            "default_level": default_level,
            "detect_method": "对话探测",
            "status": "published",
            "standards": sorted(set(str(value).strip() for value in group["数据来源"] if str(value).strip())),
            "metadata": {
                "seeded": True,
                "libraryCategory": "technical",
                "taxonomyVersion": "agent-generic-security-105",
                "sourceFile": INPUT_PATH.name,
                "sourceTopCategory": str(category).strip(),
                "riskSubclass": str(scene).strip(),
                "sceneOrder": scene_orders.get(str(scene).strip()),
                "tag": "Agent通用安全",
                "category": str(scene).strip(),
                "scope": "通用型 Agent / 智能体",
            },
        }
    )

    for idx, (_, row) in enumerate(group.iterrows()):
        original_code = str(row["用例编号"]).strip()
        case_code = f"AGENT-GEN-{original_code}"
        prompt = str(row["Prompt载荷 / 测试输入"]).strip()
        turns = []
        if attack_type(row["测试轮次"]) == "multi_turn":
            prompt, turns = normalize_multiturn_prompt(prompt)
            for turn in turns:
                turn["expectedSafe"] = str(row["预期安全响应"]).strip()
        metadata = {
            "seeded": True,
            "taxonomyVersion": "agent-generic-security-105",
            "sourceFile": INPUT_PATH.name,
            "sourceRow": int(row["序号"]),
            "originalCaseCode": original_code,
            "testRound": str(row["测试轮次"]).strip(),
            "caseBasis": str(row["数据来源"]).strip(),
            "riskSubclass": str(scene).strip(),
            "sourceTopCategory": str(category).strip(),
            "scope": str(row["适用范围"]).strip(),
        }
        if turns:
            metadata["turns"] = turns
        case_rows.append(
            {
                "id": deterministic_uuid("agent-generic-case", case_code),
                "library_key": library_key,
                "case_code": case_code,
                "name": str(row["用例名称"]).strip(),
                "attack_type": attack_type(row["测试轮次"]),
                "prompt": prompt,
                "expected_pass": str(row["预期安全响应"]).strip(),
                "expected_fail": str(row["风险命中表现"]).strip(),
                "risk_level": risk_level(row["风险等级"]),
                "status": "published",
                "tags": ["Agent通用安全", str(category).strip(), str(scene).strip()],
                "sort_order": idx,
                "metadata": metadata,
            }
        )


sql = [
    "-- Agent 通用安全测试用例库 105 条（MySQL）",
    f"-- Source: {INPUT_PATH.relative_to(ROOT)}",
    "-- Safe to run multiple times. It upserts the 35 agent-generic-* libraries and 105 AGENT-GEN-* cases.",
    "",
    "SET NAMES utf8mb4;",
    "START TRANSACTION;",
    "",
    "-- TODO: 导入前请确认目标组织；默认选择最早创建的组织。",
    "SET @org_id := (SELECT id FROM organizations ORDER BY created_at LIMIT 1);",
    "SET @actor_id := NULL;",
    "SET @now := NOW();",
    "",
    "-- 1) 导入/更新 35 个二级风险场景用例库。",
    "INSERT INTO security_case_libraries",
    "(id, organization_id, library_key, title, domain, description, case_count, enabled, default_level, detect_method, status, standards, metadata, created_by, updated_by, created_at, updated_at, deleted_at)",
    "VALUES",
]

sql.append(
    ",\n".join(
        (
            f"({esc(row['id'])}, @org_id, {esc(row['library_key'])}, {esc(row['title'])}, "
            f"{esc(row['domain'])}, {esc(row['description'])}, {row['case_count']}, {row['enabled']}, "
            f"{esc(row['default_level'])}, {esc(row['detect_method'])}, {esc(row['status'])}, "
            f"{json_sql(row['standards'])}, {json_sql(row['metadata'])}, @actor_id, @actor_id, @now, @now, NULL)"
        )
        for row in library_rows
    )
)
sql.append(
    """ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  domain = VALUES(domain),
  description = VALUES(description),
  case_count = VALUES(case_count),
  enabled = VALUES(enabled),
  default_level = VALUES(default_level),
  detect_method = VALUES(detect_method),
  status = VALUES(status),
  standards = VALUES(standards),
  metadata = VALUES(metadata),
  updated_by = @actor_id,
  updated_at = @now,
  deleted_at = NULL;"""
)

sql.extend(
    [
        "",
        "-- 2) 导入/更新 105 条测试用例。",
        "INSERT INTO security_test_cases",
        "(id, organization_id, library_id, case_code, name, attack_type, prompt, expected_pass, expected_fail, risk_level, status, tags, sort_order, metadata, created_by, updated_by, created_at, updated_at, deleted_at)",
        "VALUES",
    ]
)

sql.append(
    ",\n".join(
        (
            f"({esc(row['id'])}, @org_id, "
            f"(SELECT id FROM security_case_libraries WHERE organization_id = @org_id AND library_key = {esc(row['library_key'])} LIMIT 1), "
            f"{esc(row['case_code'])}, {esc(row['name'])}, {esc(row['attack_type'])}, {esc(row['prompt'])}, "
            f"{esc(row['expected_pass'])}, {esc(row['expected_fail'])}, {esc(row['risk_level'])}, {esc(row['status'])}, "
            f"{json_sql(row['tags'])}, {row['sort_order']}, {json_sql(row['metadata'])}, @actor_id, @actor_id, @now, @now, NULL)"
        )
        for row in case_rows
    )
)
sql.append(
    """ON DUPLICATE KEY UPDATE
  library_id = VALUES(library_id),
  name = VALUES(name),
  attack_type = VALUES(attack_type),
  prompt = VALUES(prompt),
  expected_pass = VALUES(expected_pass),
  expected_fail = VALUES(expected_fail),
  risk_level = VALUES(risk_level),
  status = VALUES(status),
  tags = VALUES(tags),
  sort_order = VALUES(sort_order),
  metadata = VALUES(metadata),
  updated_by = @actor_id,
  updated_at = @now,
  deleted_at = NULL;"""
)

library_keys = ", ".join(esc(row["library_key"]) for row in library_rows)
sql.extend(
    [
        "",
        "-- 3) 依据未删除用例刷新库内计数。",
        f"""UPDATE security_case_libraries AS lib
JOIN (
  SELECT library_id, COUNT(*) AS case_count
  FROM security_test_cases
  WHERE organization_id = @org_id
    AND deleted_at IS NULL
  GROUP BY library_id
) AS stat ON stat.library_id = lib.id
SET lib.case_count = stat.case_count,
    lib.updated_at = @now
WHERE lib.organization_id = @org_id
  AND lib.library_key IN ({library_keys});""",
        "",
        "COMMIT;",
        "",
        "-- 校验：",
        f"-- SELECT domain, COUNT(*) AS libraries, SUM(case_count) AS cases FROM security_case_libraries WHERE organization_id = @org_id AND library_key IN ({library_keys}) GROUP BY domain;",
        "-- SELECT COUNT(*) AS cases FROM security_test_cases WHERE organization_id = @org_id AND case_code LIKE 'AGENT-GEN-%' AND deleted_at IS NULL;",
        "",
    ]
)

OUTPUT_PATH.write_text("\n".join(sql), encoding="utf-8")
print(
    json.dumps(
        {
            "outputPath": str(OUTPUT_PATH),
            "libraries": len(library_rows),
            "cases": len(case_rows),
        },
        ensure_ascii=False,
        indent=2,
    )
)
