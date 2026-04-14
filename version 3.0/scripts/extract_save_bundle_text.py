from __future__ import annotations

import argparse
import json
from datetime import datetime
from pathlib import Path
from typing import Any


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract readable text from an AI TRPG save-bundle JSON file."
    )
    parser.add_argument("input", help="Path to the save-bundle JSON file.")
    parser.add_argument(
        "-o",
        "--output",
        help="Output .txt path. Defaults to artifacts/save_text_exports/<input_stem>.txt",
    )
    return parser.parse_args()


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def format_timestamp(value: str | None) -> str:
    if not value:
        return "unknown"

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return value

    return parsed.astimezone().strftime("%Y-%m-%d %H:%M:%S %Z")


def normalize_whitespace(value: str) -> str:
    return value.replace("\r\n", "\n").strip()


def clip_text(value: str, limit: int = 220) -> str:
    text = normalize_whitespace(value)
    if len(text) <= limit:
        return text
    return f"{text[: max(0, limit - 3)].rstrip()}..."


def make_participant_map(session: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {
        participant["id"]: participant
        for participant in session.get("participants", [])
        if isinstance(participant, dict) and participant.get("id")
    }


def participant_name(
    participant_map: dict[str, dict[str, Any]], participant_id: str | None
) -> str:
    if not participant_id:
        return "Unknown"
    participant = participant_map.get(participant_id)
    if not participant:
        return participant_id
    return participant.get("displayName") or participant_id


def sort_messages(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    indexed = list(enumerate(messages))
    indexed.sort(
        key=lambda item: (
            item[1].get("round", 0),
            item[1].get("createdAt") or "",
            item[0],
        )
    )
    return [item for _, item in indexed]


def render_public_story(
    lines: list[str],
    messages: list[dict[str, Any]],
    participant_map: dict[str, dict[str, Any]],
) -> None:
    public_messages = [
        message
        for message in sort_messages(messages)
        if message.get("channel") == "public_story"
    ]

    if not public_messages:
        return

    lines.extend(["=== 公共剧情记录 ===", ""])
    current_round: int | None = None

    for message in public_messages:
        message_round = int(message.get("round", 0))
        if current_round != message_round:
            current_round = message_round
            lines.extend([f"--- Round {current_round} ---", ""])

        speaker = participant_name(participant_map, message.get("senderId"))
        content = normalize_whitespace(message.get("content", ""))
        if not content:
            continue

        lines.append(f"[{speaker}]")
        lines.append(content)
        lines.append("")


def render_private_chat(
    lines: list[str],
    messages: list[dict[str, Any]],
    participant_map: dict[str, dict[str, Any]],
) -> None:
    private_messages = [
        message
        for message in sort_messages(messages)
        if message.get("channel") == "private_chat"
    ]

    if not private_messages:
        return

    lines.extend(["=== 私聊记录 ===", ""])
    for message in private_messages:
        round_number = int(message.get("round", 0))
        sender = participant_name(participant_map, message.get("senderId"))
        recipients = ", ".join(
            participant_name(participant_map, recipient_id)
            for recipient_id in message.get("recipientIds", [])
        ) or "Unknown"
        content = normalize_whitespace(message.get("content", ""))
        if not content:
            continue

        lines.append(f"[Round {round_number}] {sender} -> {recipients}")
        lines.append(content)
        lines.append("")


def render_current_round_drafts(
    lines: list[str],
    session: dict[str, Any],
) -> None:
    round_input_state = (
        session.get("gameState", {}) or {}
    ).get("roundInputState")
    if not isinstance(round_input_state, dict):
        return

    drafts = round_input_state.get("drafts", [])
    if not drafts:
        return

    lines.extend(["=== 当前未提交草稿 ===", ""])
    lines.append(f"轮次: {round_input_state.get('round', 'unknown')}")
    lines.append(f"阶段: {round_input_state.get('phase', 'unknown')}")
    lines.append("")
    for draft in drafts:
        display_name = draft.get("displayName") or draft.get("participantId") or "Unknown"
        content = normalize_whitespace(draft.get("content", ""))
        if not content:
            continue

        lines.append(f"[{display_name}]")
        lines.append(content)
        lines.append("")


def render_memory_appendix(lines: list[str], memory: dict[str, Any] | None) -> None:
    if not memory:
        return

    episode_summaries = memory.get("episodeSummaries") or []
    active_facts = [
        fact
        for fact in memory.get("facts", [])
        if isinstance(fact, dict) and fact.get("status") == "active"
    ]
    open_loops = [
        loop
        for loop in memory.get("openLoops", [])
        if isinstance(loop, dict) and loop.get("status") == "open"
    ]

    if not episode_summaries and not active_facts and not open_loops:
        return

    lines.extend(["=== 记忆附录 ===", ""])

    if episode_summaries:
        lines.extend(["-- Episode Summaries --", ""])
        for episode in episode_summaries:
            title = episode.get("title") or "Untitled"
            summary = normalize_whitespace(episode.get("summary", ""))
            lines.append(f"{title}")
            lines.append(summary or "(empty)")
            lines.append("")

    if active_facts:
        lines.extend(["-- Active Facts --", ""])
        for fact in active_facts:
            kind = fact.get("kind") or "unknown"
            text = clip_text(fact.get("text", ""))
            lines.append(f"- [{kind}] {text}")
        lines.append("")

    if open_loops:
        lines.extend(["-- Open Loops --", ""])
        for loop in open_loops:
            title = normalize_whitespace(loop.get("title", "")) or "Untitled"
            summary = clip_text(loop.get("summary", ""))
            lines.append(f"- {title}")
            if summary:
                lines.append(f"  {summary}")
        lines.append("")


def build_output_text(data: dict[str, Any], source_path: Path) -> str:
    session = data.get("session", {}) or {}
    content_summary = data.get("contentSummary", {}) or {}
    participant_map = make_participant_map(session)
    messages = data.get("messages", []) or []

    lines: list[str] = [
        "AI TRPG 存档文本导出",
        "",
        f"源文件: {source_path}",
        f"导出时间: {format_timestamp(datetime.now().astimezone().isoformat())}",
        "",
        "=== 会话信息 ===",
        f"规则: {content_summary.get('ruleTitle') or session.get('ruleId') or 'unknown'}",
        f"剧本: {content_summary.get('storyTitle') or session.get('storyId') or 'unknown'}",
        f"状态: {session.get('status') or 'unknown'}",
        f"游戏模式: {session.get('playMode') or 'unknown'}",
        f"模型入口: {session.get('modelAccessMode') or 'unknown'}",
        f"模型档案: {(session.get('settings', {}) or {}).get('modelProfileId') or 'unknown'}",
        f"当前回合: {session.get('currentRound', 'unknown')}",
        f"创建时间: {format_timestamp(session.get('createdAt'))}",
        f"最后更新时间: {format_timestamp(session.get('updatedAt'))}",
        f"存档时间: {format_timestamp(data.get('savedAt'))}",
        "",
        "=== 参与者 ===",
    ]

    for participant in session.get("participants", []) or []:
        display_name = participant.get("displayName") or participant.get("id") or "Unknown"
        role = participant.get("role") or "unknown"
        lines.append(f"- {display_name} [{role}]")

    lines.append("")

    character_messages = [
        message
        for message in sort_messages(messages)
        if message.get("visibility") == "gm_only"
        and "character_concept" in (message.get("tags") or [])
    ]
    if character_messages:
        lines.extend(["=== 角色设定 ===", ""])
        for message in character_messages:
            lines.append(normalize_whitespace(message.get("content", "")))
            lines.append("")

    render_public_story(lines, messages, participant_map)
    render_private_chat(lines, messages, participant_map)
    render_current_round_drafts(lines, session)
    render_memory_appendix(lines, data.get("memory"))

    return "\n".join(lines).rstrip() + "\n"


def main() -> int:
    args = parse_args()
    input_path = Path(args.input).expanduser()
    if not input_path.is_file():
        raise SystemExit(f"Input file not found: {input_path}")

    output_path = (
        Path(args.output).expanduser()
        if args.output
        else Path("artifacts/save_text_exports") / f"{input_path.stem}.txt"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    data = read_json(input_path)
    output_text = build_output_text(data, input_path)
    output_path.write_text(output_text, encoding="utf-8")

    print(f"Exported: {output_path.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
