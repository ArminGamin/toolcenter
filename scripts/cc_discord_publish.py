"""Control Center → PostMaker discord_publisher (UGC category overrides, PostMaker json unchanged)."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Callable

POST_MAKER = Path(__file__).resolve().parents[2] / "post-maker"
sys.path.insert(0, str(POST_MAKER))

import discord_publisher  # noqa: E402
from discord_publisher import publish_post_folders  # noqa: E402


def _apply_runtime_overrides(
    *,
    guild_id: str | None,
    category_id: str | None,
    token: str | None,
) -> Callable[[], dict[str, str]]:
    original = discord_publisher.discord_settings

    def patched() -> dict[str, str]:
        cfg = dict(original())
        if token:
            cfg["token"] = token
        if guild_id:
            cfg["guild_id"] = guild_id
        if category_id:
            cfg["category_id"] = category_id
        return cfg

    discord_publisher.discord_settings = patched
    return original


def main() -> int:
    if len(sys.argv) < 2:
        print(
            json.dumps(
                [
                    {
                        "ok": False,
                        "error": "Usage: cc_discord_publish.py <folder> [batch_index] [guild_id] [category_id] [token]",
                    }
                ]
            )
        )
        return 1

    folder = Path(sys.argv[1])
    batch_index = int(sys.argv[2]) if len(sys.argv) > 2 and sys.argv[2].strip() else 1
    guild_id = sys.argv[3].strip() if len(sys.argv) > 3 and sys.argv[3].strip() else None
    category_id = sys.argv[4].strip() if len(sys.argv) > 4 and sys.argv[4].strip() else None
    token = sys.argv[5].strip() if len(sys.argv) > 5 and sys.argv[5].strip() else None

    if not folder.is_dir():
        print(json.dumps([{"ok": False, "error": f"Post folder not found: {folder}"}]))
        return 1

    original_settings = _apply_runtime_overrides(
        guild_id=guild_id,
        category_id=category_id,
        token=token,
    )
    try:
        results = publish_post_folders([(batch_index, folder)])
    except Exception as exc:
        print(json.dumps([{"ok": False, "error": str(exc)}]))
        return 1
    finally:
        discord_publisher.discord_settings = original_settings

    print(json.dumps(results, ensure_ascii=False))
    return 0 if results and results[0].get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
