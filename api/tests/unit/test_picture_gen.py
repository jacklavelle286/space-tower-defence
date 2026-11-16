"""picture-gen (Gate P, Phase 42b) with a fake Bedrock client on moto S3. Bedrock is never called.

The request shape is the design's: the model ID from configuration, three fixed system blocks (kind-neutral rules,
the style guide with cache breakpoint 1, the picture kind's block with breakpoint 2; Gate P2), max_tokens 16000,
adaptive thinking, and no sampling parameters. Every failure becomes `error.json` with nothing raised (a paid call is
never redelivered); a claimed job is never drawn twice; the usage log line holds token counts and no prompt text.
"""

from __future__ import annotations

import importlib.util
import json
import sys
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import boto3
import pytest
from conftest import CapturedLogger, load_handler

from shared.pictures import KIND_IDS
from shared.rules.contracts import LIMITS
from shared.svg_sanitise import sanitise

gen = load_handler("picture_gen")
REPO_ROOT = Path(__file__).resolve().parents[3]

BUCKET = "test-pictures-bucket"
JOB = "00000000-0000-4000-8000-000000000001"
PREVIOUS = "00000000-0000-4000-8000-000000000002"
CONFIG = gen.WorkerConfig(
    bucket=BUCKET,
    job_prefix="jobs/",
    model_id="eu.anthropic.claude-opus-5-5",
    max_tokens=16000,
    region="eu-west-2",
)
DRAWING = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">'
    '<g stroke="#2A1E3D" stroke-width="7"><circle cx="128" cy="128" r="60" fill="#FFD23F"/></g></svg>'
)


def usage(output: int = 1200, cache_read: int = 0, cache_write: int = 9500) -> SimpleNamespace:
    return SimpleNamespace(
        input_tokens=120,
        output_tokens=output,
        cache_read_input_tokens=cache_read,
        cache_creation_input_tokens=cache_write,
    )


def message(text: str, stop: str = "end_turn", **kwargs: Any) -> SimpleNamespace:
    return SimpleNamespace(
        stop_reason=stop,
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=text)],
        usage=usage(**kwargs),
    )


def block_start(kind: str) -> SimpleNamespace:
    return SimpleNamespace(type="content_block_start", content_block=SimpleNamespace(type=kind))


@dataclass
class FakeStream:
    final: Any
    events: list[Any]
    error: Exception | None = None

    def __enter__(self) -> FakeStream:
        return self

    def __exit__(self, *args: Any) -> None:
        return None

    def __iter__(self) -> Any:
        if self.error is not None:
            raise self.error
        return iter(self.events)

    @property
    def current_message_snapshot(self) -> Any:
        return SimpleNamespace(usage=usage(output=300))

    def get_final_message(self) -> Any:
        return self.final


@dataclass
class FakeBedrock:
    """Stands in for anthropic.AnthropicBedrock: records each messages.stream call."""

    final: Any = None
    events: list[Any] = field(default_factory=lambda: [block_start("thinking"), block_start("text")])
    error: Exception | None = None
    calls: list[dict[str, Any]] = field(default_factory=list)

    @property
    def messages(self) -> FakeBedrock:
        return self

    def stream(self, **kwargs: Any) -> FakeStream:
        self.calls.append(kwargs)
        return FakeStream(self.final if self.final is not None else message(DRAWING), self.events, self.error)


class RateLimitError(Exception):
    status_code = 429


class Harness:
    def __init__(self) -> None:
        self.s3 = boto3.client("s3", region_name="eu-west-2")
        self.s3.create_bucket(Bucket=BUCKET, CreateBucketConfiguration={"LocationConstraint": "eu-west-2"})
        self.bedrock = FakeBedrock()
        self.logger = CapturedLogger()
        self.ticks = 0.0
        self.worker = gen.Worker(
            gen.Deps(
                config=lambda: CONFIG,
                s3=lambda: self.s3,
                bedrock=lambda config: self.bedrock,
                clock=self.clock,
                now=lambda: datetime(2026, 11, 20, 10, 0, tzinfo=UTC),
            ),
            self.logger,
        )

    def clock(self) -> float:
        self.ticks += 1.0
        return self.ticks

    def run(self, attributes: dict[str, str] | None = None, **body: Any) -> dict[str, Any]:
        doc = {"jobId": JOB, "description": "a friendly yellow sun", **body}
        record: dict[str, Any] = {"body": json.dumps(doc)}
        if attributes is not None:
            record["attributes"] = attributes
        return self.worker.handle({"Records": [record]})

    def read(self, name: str, job: str = JOB) -> Any:
        try:
            raw = self.s3.get_object(Bucket=BUCKET, Key=f"jobs/{job}/{name}")["Body"].read()
        except self.s3.exceptions.NoSuchKey:
            return None
        return json.loads(raw) if name.endswith(".json") else raw


@pytest.fixture
def h(aws_env: None) -> Any:
    from moto import mock_aws

    with mock_aws():
        yield Harness()


def test_the_request_has_the_designed_shape(h: Harness) -> None:
    h.run()
    [call] = h.bedrock.calls
    assert set(call) == {"model", "max_tokens", "thinking", "system", "messages"}
    assert call["model"] == "eu.anthropic.claude-opus-5-5"
    assert call["max_tokens"] == 16000
    assert call["thinking"] == {"type": "adaptive"}
    assert not {"temperature", "top_p", "top_k"} & set(call)
    system = call["system"]
    assert [b["type"] for b in system] == ["text", "text", "text"]
    assert ["cache_control" in b for b in system] == [False, True, True]  # breakpoints 1 and 2
    assert system[1]["cache_control"] == system[2]["cache_control"] == {"type": "ephemeral"}
    assert system[0]["text"] == gen.RULES
    assert "Moonbeam Colony" in system[1]["text"]  # art/STYLE.md
    # No kind in the message (one sent before kinds existed): an activity object, today's behaviour.
    assert system[2]["text"].startswith('<picture-kind id="activity-object">')
    for name in ("pic-cat.svg", "pic-boat.svg", "obj-rocket.svg"):
        assert f'<example file="{name}">' in system[2]["text"]
    assert call["messages"] == [{"role": "user", "content": "<request>a friendly yellow sun</request>"}]


@pytest.mark.parametrize("kind", KIND_IDS)
def test_the_system_prompt_is_stable_bytes_for_every_kind(kind: str) -> None:
    """Fixed bytes between runs and builds (no time, no IDs, no ordering accidents), so the prompt cache hits."""
    first = json.dumps(gen.system_blocks(kind), sort_keys=False)
    gen.style_text.cache_clear()
    gen.kind_text.cache_clear()
    assert json.dumps(gen.system_blocks(kind), sort_keys=False) == first
    assert len(first) > 4 * 512  # comfortably over the 512-token cache minimum


def test_every_kind_shares_the_first_two_blocks_and_has_its_own_third() -> None:
    """Blocks 1-2 (rules, style guide, breakpoint 1) are the same bytes for every kind: one cache entry. Block 3 is
    the kind's own, with breakpoint 2."""
    blocks = {kind: gen.system_blocks(kind) for kind in KIND_IDS}
    shared = blocks["activity-object"][:2]
    for kind, system in blocks.items():
        assert system[:2] == shared, kind
        assert system[1]["cache_control"] == {"type": "ephemeral"}
        assert system[2]["cache_control"] == {"type": "ephemeral"}
        assert system[2]["text"].startswith(f'<picture-kind id="{kind}">\n')
        for relative in gen.KIND_EXAMPLES[kind]:
            assert f'<example file="{relative.name}">' in system[2]["text"]
    assert len({system[2]["text"] for system in blocks.values()}) == len(KIND_IDS)


def test_the_kinds_are_the_contract_kinds() -> None:
    assert [k["id"] for k in LIMITS["picture"]["kinds"]] == list(KIND_IDS)
    assert set(gen.KIND_EXAMPLES) == set(KIND_IDS)
    for kind in KIND_IDS:
        assert (gen._HERE / gen.kind_file(kind)).is_file(), kind
        assert 1 <= len(gen.KIND_EXAMPLES[kind]) <= 3, kind


@pytest.mark.parametrize("kind", KIND_IDS)
def test_each_kind_block_has_its_rules_safety_line_and_small_examples(kind: str) -> None:
    rules = (gen._HERE / gen.kind_file(kind)).read_text(encoding="utf-8")
    assert "256 x 256" in rules
    for word in ("Canvas:", "Anchor:", "Background:", "Outline:"):
        assert word in rules, (kind, word)
    safety = (
        "friendly, never frightening, for ages 5-7; no weapons, blood or gore; "
        "no letters, numbers or letter-like shapes"
    )
    assert safety in rules
    examples = sum(len((REPO_ROOT / relative).read_bytes()) for relative in gen.KIND_EXAMPLES[kind])
    assert examples < 12_000, (kind, examples)


def test_the_human_cast_rule_is_in_the_avatar_and_astronaut_blocks() -> None:
    avatar = (gen._HERE / gen.kind_file("avatar")).read_text(encoding="utf-8")
    astronaut = (gen._HERE / gen.kind_file("astronaut")).read_text(encoding="utf-8")
    assert "cheerful boys with light skin and short hair" in avatar
    assert "every human character is a white European man" in astronaut


def test_the_core_rules_are_kind_neutral() -> None:
    """The "one object, centred, no background" rules moved out of the core into the activity-object block."""
    assert "one object, centred" not in gen.RULES.lower()
    assert 'viewBox="0 0 256 256"' in gen.RULES and "<svg-refused/>" in gen.RULES and "<request>" in gen.RULES
    assert "One object, centred" in (gen._HERE / gen.kind_file("activity-object")).read_text(encoding="utf-8")


def test_every_kind_example_is_bundled_by_build_lambdas() -> None:
    spec = importlib.util.spec_from_file_location("build_lambdas_for_test", REPO_ROOT / "scripts" / "build_lambdas.py")
    assert spec is not None and spec.loader is not None
    build = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = build
    spec.loader.exec_module(build)
    bundled = set(build.FUNCTION_FILES["picture_gen"])
    wanted = {gen.STYLE_FILE.as_posix(), *(p.as_posix() for paths in gen.KIND_EXAMPLES.values() for p in paths)}
    assert bundled == wanted


def test_the_prompt_roots_survive_the_lambda_layout() -> None:
    """In Lambda the handler is /var/task/handler.py: /var/task has two parents, so `parents[2]` raised IndexError on
    every job (production, 2026-11-16). The roots must be computed without raising, at any depth."""
    assert gen.prompt_roots(Path("/var/task")) == (Path("/var/task"),)
    assert gen.prompt_roots(Path("/")) == (Path("/"),)
    deep = Path("/repo/api/functions/picture_gen")
    assert gen.prompt_roots(deep) == (deep, Path("/repo"))


def test_the_prompt_files_load_from_a_zip_root(tmp_path: Path) -> None:
    """The packaged layout: art/ and kinds/ beside handler.py. Every prompt file resolves inside the zip root."""
    examples = [p for paths in gen.KIND_EXAMPLES.values() for p in paths]
    for relative in (gen.STYLE_FILE, *examples):
        target = tmp_path / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((REPO_ROOT / relative).read_bytes())
        assert gen._prompt_file(relative, here=tmp_path) == target
    for kind in KIND_IDS:
        target = tmp_path / gen.kind_file(kind)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((gen._HERE / gen.kind_file(kind)).read_bytes())
        assert gen._prompt_file(gen.kind_file(kind), here=tmp_path) == target


def test_the_prompt_files_load_from_the_lambda_task_root(tmp_path: Path) -> None:
    """/var/task has only two parents: the kind files and examples resolve from the zip root alone."""
    task = tmp_path / "task"
    for relative in [gen.STYLE_FILE, *(p for paths in gen.KIND_EXAMPLES.values() for p in paths)]:
        (task / relative).parent.mkdir(parents=True, exist_ok=True)
        (task / relative).write_bytes((REPO_ROOT / relative).read_bytes())
    for kind in KIND_IDS:
        (task / gen.kind_file(kind)).parent.mkdir(parents=True, exist_ok=True)
        (task / gen.kind_file(kind)).write_bytes((gen._HERE / gen.kind_file(kind)).read_bytes())
    assert gen.prompt_roots(task)[0] == task
    for kind in KIND_IDS:
        assert gen._prompt_file(gen.kind_file(kind), here=task) == task / gen.kind_file(kind)
        for relative in gen.KIND_EXAMPLES[kind]:
            assert gen._prompt_file(relative, here=task) == task / relative


def test_a_good_drawing_is_sanitised_and_stored_with_its_usage(h: Harness) -> None:
    h.bedrock.final = message(DRAWING, cache_read=9500, cache_write=0)
    assert h.run() == {"batchItemFailures": []}
    result = h.read("result.json")
    assert result["svg"] == sanitise(DRAWING).svg
    assert result["usage"] == {"input": 120, "output": 1200, "cacheRead": 9500, "cacheWrite": 0}
    assert (result["stopReason"], result["model"]) == ("end_turn", "eu.anthropic.claude-opus-5-5")
    assert h.read("error.json") is None
    assert h.read("claim") == b""


def test_progress_is_written_for_each_phase(h: Harness) -> None:
    h.run()
    progress = h.read("progress.json")
    assert progress == {"phase": "drawing", "outputTokens": 300, "at": "2026-11-20T10:00:00Z"}


def test_progress_is_written_at_most_every_ten_seconds_within_a_phase(h: Harness, monkeypatch: Any) -> None:
    writes: list[str] = []
    real = gen.Worker.progress

    def counting(self: Any, s3: Any, config: Any, job_id: str, phase: str, stream: Any) -> None:
        writes.append(phase)
        real(self, s3, config, job_id, phase, stream)

    monkeypatch.setattr(gen.Worker, "progress", counting)
    delta = SimpleNamespace(type="content_block_delta")
    h.bedrock.events = [block_start("thinking"), *([delta] * 25), block_start("text"), *([delta] * 5)]
    h.run()
    # thinking at t=0, then every 10 ticks while thinking (one tick per event), then once for drawing
    assert writes == ["thinking", "thinking", "thinking", "drawing"]


def test_a_claimed_job_is_never_drawn_again(h: Harness) -> None:
    h.s3.put_object(Bucket=BUCKET, Key=f"jobs/{JOB}/claim", Body=b"")
    h.run()
    assert h.bedrock.calls == []
    assert h.read("result.json") is None and h.read("error.json") is None
    assert h.logger.lines()[-1]["result"] == "DUPLICATE"


@pytest.mark.parametrize(
    ("final", "code"),
    [
        pytest.param(message("", stop="refusal"), "declined", id="refusal"),
        pytest.param(message("<svg-refused/>"), "declined", id="svg-refused"),
        pytest.param(message("```\n<svg-refused/>\n```"), "declined", id="fenced-refused"),
        pytest.param(message(DRAWING[:100], stop="max_tokens"), "too_long", id="max-tokens"),
        pytest.param(message("", stop="model_context_window_exceeded"), "too_long", id="context-window"),
        pytest.param(message("Here is a sun!"), "unusable", id="no-svg"),
        pytest.param(message("Sure: " + DRAWING), "unusable", id="words-before"),
        pytest.param(message(DRAWING + " Hope you like it"), "unusable", id="words-after"),
        pytest.param(message(DRAWING.replace("</svg>", "<script>alert(1)</script></svg>")), "unusable", id="script"),
        pytest.param(message(DRAWING.replace("</svg>", "<text>A</text></svg>")), "unusable", id="text"),
        pytest.param(message(DRAWING.replace("<g ", "<g " + "a" * 70_000 + " ")), "unusable", id="over-64-kib"),
        pytest.param(message(DRAWING, stop="pause_turn"), "unusable", id="pause-turn"),
    ],
)
def test_failures_become_error_objects_and_nothing_is_raised(h: Harness, final: Any, code: str) -> None:
    h.bedrock.final = final
    assert h.run() == {"batchItemFailures": []}
    assert h.read("error.json") == {"code": code}
    assert h.read("result.json") is None
    line = h.logger.lines()[-1]
    assert (line["metric"], line["result"], line["code"]) == ("picture_usage", "ERROR", code)


def test_a_fenced_drawing_is_accepted(h: Harness) -> None:
    h.bedrock.final = message("```svg\n" + DRAWING + "\n```")
    h.run()
    assert h.read("result.json")["svg"] == sanitise(DRAWING).svg


@pytest.mark.parametrize(
    ("error", "code"),
    [
        pytest.param(RuntimeError("connection reset"), "bedrock_error", id="sdk-error"),
        pytest.param(RateLimitError("slow down"), "throttled", id="rate-limit"),
    ],
)
def test_an_sdk_exception_is_an_error_object(h: Harness, error: Exception, code: str) -> None:
    h.bedrock.error = error
    assert h.run() == {"batchItemFailures": []}
    assert h.read("error.json") == {"code": code}
    assert h.logger.lines()[-1]["errorType"] == type(error).__name__


class PermissionDeniedError(Exception):
    """Shaped like the SDK's APIStatusError for a Bedrock 403: a status and the response headers."""

    status_code = 403

    def __init__(self, error_type: str) -> None:
        super().__init__("You don't have access to the model with the specified model ID. secret prompt text")
        self.response = SimpleNamespace(headers={"x-amzn-ErrorType": error_type})


def test_a_refused_call_logs_the_status_and_aws_error_type_but_never_the_message(h: Harness) -> None:
    """A 2026-11-16 production 403 (model agreement not accepted) could not be explained from the log."""
    h.bedrock.error = PermissionDeniedError(
        "AccessDeniedException:http://internal.amazon.com/coral/com.amazon.bedrock/"
    )
    h.run()
    line = h.logger.lines()[-1]
    seen = (line["code"], line["upstreamStatus"], line["upstreamError"])
    assert seen == ("bedrock_error", 403, "AccessDeniedException")
    assert "secret" not in json.dumps(h.logger.lines())


@pytest.mark.parametrize("bad", ["Access Denied: x", "x" * 65, "<script>", ""])
def test_an_odd_error_type_header_is_left_out(h: Harness, bad: str) -> None:
    h.bedrock.error = PermissionDeniedError(bad)
    h.run()
    line = h.logger.lines()[-1]
    assert line["upstreamStatus"] == 403
    assert "upstreamError" not in line


def test_an_error_without_a_response_logs_no_upstream_fields(h: Harness) -> None:
    h.bedrock.error = RuntimeError("connection reset")
    h.run()
    line = h.logger.lines()[-1]
    assert "upstreamStatus" not in line and "upstreamError" not in line


def test_a_stream_that_breaks_logs_the_tokens_reported_so_far(h: Harness) -> None:
    """Tokens streamed before the break are billed: the usage line (and so the hourly alarm) carries them."""
    h.bedrock.error = RuntimeError("read timeout")
    h.run()
    assert h.read("error.json") == {"code": "bedrock_error"}
    line = h.logger.lines()[-1]
    assert (line["result"], line["errorType"]) == ("ERROR", "RuntimeError")
    assert (line["inputTokens"], line["outputTokens"], line["cacheWriteTokens"]) == (120, 300, 9500)


def test_a_progress_write_that_hits_a_network_fault_does_not_fail_the_drawing(h: Harness, monkeypatch: Any) -> None:
    from botocore.exceptions import EndpointConnectionError

    real = gen.Worker.put_json

    def flaky(s3: Any, config: Any, key: str, doc: Any) -> None:
        if key.endswith("progress.json"):
            raise EndpointConnectionError(endpoint_url="https://s3.eu-west-2.amazonaws.com")
        real(s3, config, key, doc)

    monkeypatch.setattr(gen.Worker, "put_json", staticmethod(flaky))
    h.run()
    assert h.read("result.json")["svg"] == sanitise(DRAWING).svg
    assert h.read("error.json") is None


@pytest.mark.parametrize(
    ("started", "attributes"),
    [
        pytest.param("2026-11-20T09:46:59Z", None, id="startedAt-13m01s"),
        pytest.param(
            None,
            {"SentTimestamp": str(int(datetime(2026, 11, 20, 9, 40, tzinfo=UTC).timestamp() * 1000))},
            id="sent-20m-ago",
        ),
        pytest.param("2026-11-20T09:59:00Z", {"SentTimestamp": "1795165200000"}, id="sent-earlier-than-start"),
    ],
)
def test_a_job_that_waited_too_long_is_answered_timed_out_without_a_call(
    h: Harness, started: str | None, attributes: dict[str, str] | None
) -> None:
    """admin-api gives up on an unclaimed job at 15 minutes; picture-gen refuses one older than 13, so a job the page
    has given up on is never drawn and paid for."""
    body = {"startedAt": started} if started is not None else {}
    h.run(attributes, **body)
    assert h.bedrock.calls == []
    assert h.read("error.json") == {"code": "timed_out"}
    assert h.read("claim") == b""  # claimed, so a second delivery is a DUPLICATE
    line = h.logger.lines()[-1]
    assert (line["result"], line["code"]) == ("ERROR", "timed_out") and line["queuedSeconds"] > 13 * 60


def test_a_fresh_job_with_its_start_time_is_drawn(h: Harness) -> None:
    sent = str(int(datetime(2026, 11, 20, 9, 59, 30, tzinfo=UTC).timestamp() * 1000))
    h.run({"SentTimestamp": sent}, startedAt="2026-11-20T09:59:29Z")
    assert len(h.bedrock.calls) == 1
    assert h.read("result.json") is not None


def test_a_stale_duplicate_never_overwrites_a_job_being_drawn(h: Harness) -> None:
    h.s3.put_object(Bucket=BUCKET, Key=f"jobs/{JOB}/claim", Body=b"")
    h.run(startedAt="2026-11-20T09:00:00Z")
    assert h.read("error.json") is None
    assert h.logger.lines()[-1]["result"] == "DUPLICATE"


def test_try_again_sends_the_previous_drawing_and_the_change(h: Harness) -> None:
    h.s3.put_object(Bucket=BUCKET, Key=f"jobs/{PREVIOUS}/result.json", Body=json.dumps({"svg": sanitise(DRAWING).svg}))
    h.run(previousJobId=PREVIOUS, change="make it bigger")
    content = h.bedrock.calls[0]["messages"][0]["content"]
    assert content.startswith("<request>a friendly yellow sun</request>\n<previous-drawing>\n<svg ")
    assert content.endswith("</previous-drawing>\n<change>make it bigger</change>")
    # The system blocks are the same bytes as a first drawing: the cache prefix is shared.
    assert h.bedrock.calls[0]["system"] == gen.system_blocks()


def test_a_message_with_a_kind_is_drawn_with_that_kinds_block(h: Harness) -> None:
    h.run(kind="avatar")
    [call] = h.bedrock.calls
    assert call["system"] == gen.system_blocks("avatar")
    assert '<example file="avatar-07.svg">' in call["system"][2]["text"]
    assert h.logger.lines()[-1]["kind"] == "avatar"


def test_a_message_without_a_kind_is_an_activity_object(h: Harness) -> None:
    h.run()
    assert h.bedrock.calls[0]["system"] == gen.system_blocks("activity-object")
    assert h.logger.lines()[-1]["kind"] == "activity-object"


@pytest.mark.parametrize("kind", ["boss", "backdrop", "", 7, None])
def test_an_unknown_kind_is_answered_bad_request_without_a_call(h: Harness, kind: Any) -> None:
    h.run(kind=kind)
    assert h.bedrock.calls == []
    assert h.read("error.json") == {"code": "bad_request"}
    assert h.read("claim") == b""
    assert h.read("result.json") is None
    line = h.logger.lines()[-1]
    assert (line["result"], line["code"]) == ("ERROR", "bad_request")


def test_a_redraw_keeps_the_kind_of_its_job(h: Harness) -> None:
    h.s3.put_object(Bucket=BUCKET, Key=f"jobs/{PREVIOUS}/result.json", Body=json.dumps({"svg": sanitise(DRAWING).svg}))
    h.run(kind="badge", previousJobId=PREVIOUS, change="a bigger star")
    [call] = h.bedrock.calls
    assert call["system"] == gen.system_blocks("badge")
    assert "<previous-drawing>" in call["messages"][0]["content"]


def test_a_missing_or_unusable_previous_drawing_starts_fresh(h: Harness) -> None:
    h.run(previousJobId=PREVIOUS, change="bigger")
    assert h.bedrock.calls[0]["messages"][0]["content"] == "<request>a friendly yellow sun</request>"


@pytest.mark.parametrize(
    "body",
    [
        pytest.param("not json", id="not-json"),
        pytest.param(json.dumps({"jobId": "x", "description": "a sun"}), id="bad-job-id"),
        pytest.param(json.dumps({"jobId": JOB, "description": "<script>"}), id="markup"),
        pytest.param(json.dumps({"jobId": JOB, "description": "a sun", "extra": 1}), id="extra-field"),
        pytest.param(json.dumps({"jobId": JOB, "description": "a sun", "change": "x" * 201}), id="long-change"),
        pytest.param(json.dumps({"jobId": JOB, "description": "a sun", "startedAt": "yesterday"}), id="bad-start"),
    ],
)
def test_a_message_admin_api_would_not_send_is_dropped_without_a_call(h: Harness, body: str) -> None:
    h.worker.handle({"Records": [{"body": body}]})
    assert h.bedrock.calls == []
    assert h.logger.lines()[-1]["code"] == "bad_message"


def test_the_usage_line_has_token_counts_and_no_prompt_text(h: Harness) -> None:
    h.run(description="a secret purple dragon")
    line = h.logger.lines()[-1]
    assert line == {
        "level": "INFO",
        "metric": "picture_usage",
        "jobId": JOB,
        "model": "eu.anthropic.claude-opus-5-5",
        "kind": "activity-object",
        "inputTokens": 120,
        "outputTokens": 1200,
        "cacheReadTokens": 0,
        "cacheWriteTokens": 9500,
        "stopReason": "end_turn",
        "result": "OK",
        "durationMs": line["durationMs"],
    }
    text = json.dumps(h.logger.lines())
    assert "secret purple dragon" not in text and "<svg" not in text


def test_a_failed_s3_write_propagates_to_the_dlq(h: Harness) -> None:
    """The one failure that is not caught: the result cannot be written. The message then goes to the DLQ."""
    h.s3.delete_bucket(Bucket=BUCKET)
    with pytest.raises(Exception, match="NoSuchBucket"):
        h.run()


def test_the_real_sdk_client_is_built_from_the_config_without_calling_anything(monkeypatch: Any) -> None:
    pytest.importorskip("anthropic")
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "testing")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "testing")
    client = gen.bedrock_client(CONFIG)
    assert type(client).__name__ == "AnthropicBedrock"
    assert client.max_retries == 1
    assert client.timeout.read == 280.0 and client.timeout.connect == 10.0


def test_the_config_reads_the_environment(monkeypatch: Any) -> None:
    monkeypatch.setenv("PICTURES_BUCKET", "b")
    monkeypatch.setenv("BEDROCK_MODEL_ID", "eu.anthropic.claude-opus-5-5")
    monkeypatch.setenv("BEDROCK_MAX_TOKENS", "16000")
    monkeypatch.setenv("AWS_REGION", "eu-west-2")
    monkeypatch.delenv("PICTURE_JOB_PREFIX", raising=False)
    expected = gen.WorkerConfig("b", "jobs/", "eu.anthropic.claude-opus-5-5", 16000, "eu-west-2")
    assert gen.WorkerConfig.from_env() == expected
